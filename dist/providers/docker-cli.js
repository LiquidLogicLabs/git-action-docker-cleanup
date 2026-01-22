"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.DockerCLIProvider = void 0;
const exec = __importStar(require("@actions/exec"));
const types_1 = require("../types");
/**
 * Docker CLI provider
 * Uses Docker CLI commands ONLY - no HTTP API calls
 *
 * This provider works with LOCAL Docker images only.
 * It uses docker image ls with JSON formatting to list and manage local images.
 * Useful for cleaning up local Docker images that match a registry pattern.
 *
 * Note: This provider does NOT interact with remote registries - it only manages
 * local images in the Docker daemon.
 */
class DockerCLIProvider {
    logger;
    config;
    registryUrl;
    authenticated = false;
    constructor(logger, config, _httpClient) {
        this.logger = logger;
        this.config = config;
        if (!config.registryUrl) {
            throw new Error('registry-url is required for Docker CLI provider');
        }
        this.registryUrl = this.normalizeRegistryUrl(config.registryUrl);
    }
    normalizeRegistryUrl(url) {
        // Remove protocol and trailing slash
        let normalized = url.replace(/^https?:\/\//, '').replace(/\/$/, '');
        return normalized;
    }
    getImageName(packageName, tag) {
        const imageName = `${this.registryUrl}/${packageName}`;
        return tag ? `${imageName}:${tag}` : imageName;
    }
    /**
     * Execute docker command and parse JSON output
     * Automatically adds --format json if not already present
     */
    async execDockerJson(args) {
        // Work with a copy to avoid mutating the original array
        const dockerArgs = [...args];
        // Ensure --format json is set for JSON output
        const formatIndex = dockerArgs.indexOf('--format');
        if (formatIndex === -1) {
            // No --format found, add it
            dockerArgs.push('--format', '{{json .}}');
        }
        else if (formatIndex + 1 >= dockerArgs.length || dockerArgs[formatIndex + 1] !== '{{json .}}') {
            // --format found but not set to json, update it
            dockerArgs[formatIndex + 1] = '{{json .}}';
        }
        // If --format {{json .}} is already present, use dockerArgs as-is
        let output = '';
        await exec.exec('docker', dockerArgs, {
            silent: !this.logger.verbose,
            listeners: {
                stdout: (data) => {
                    output += data.toString();
                },
                stderr: (data) => {
                    // Log stderr but don't fail
                    this.logger.debug(`Docker stderr: ${data.toString()}`);
                },
            },
        });
        if (!output.trim()) {
            return [];
        }
        // Parse JSON lines (each line is a JSON object)
        const lines = output.trim().split('\n');
        const results = [];
        for (const line of lines) {
            if (line.trim()) {
                try {
                    results.push(JSON.parse(line));
                }
                catch (error) {
                    this.logger.debug(`Failed to parse JSON line: ${line}`);
                }
            }
        }
        return results;
    }
    async authenticate() {
        try {
            const username = this.config.username;
            const password = this.config.password || this.config.token;
            if (!username || !password) {
                throw new types_1.AuthenticationError('Docker CLI provider requires username and password/token for authentication', 'docker');
            }
            // Login to registry using docker login
            const loginArgs = [
                'login',
                this.registryUrl,
                '--username',
                username,
                '--password-stdin',
            ];
            await exec.exec('docker', loginArgs, {
                input: Buffer.from(password),
                silent: !this.logger.verbose,
            });
            this.authenticated = true;
            this.logger.debug(`Successfully authenticated with registry ${this.registryUrl}`);
        }
        catch (error) {
            throw new types_1.AuthenticationError(`Docker login failed: ${error instanceof Error ? error.message : 'Unknown error'}`, 'docker');
        }
    }
    async listPackages() {
        if (!this.authenticated) {
            await this.authenticate();
        }
        // Use docker image ls to list local images, filter by registry URL
        const images = await this.execDockerJson(['image', 'ls']);
        // Extract unique package names from images that match our registry
        const packageNames = new Set();
        for (const image of images) {
            // Check if image belongs to our registry
            if (image.Repository.startsWith(`${this.registryUrl}/`)) {
                // Extract package name (everything after registry URL)
                const packageName = image.Repository.replace(`${this.registryUrl}/`, '');
                packageNames.add(packageName);
            }
        }
        const packages = [];
        for (const name of packageNames) {
            packages.push({
                id: name,
                name,
                type: 'container',
            });
        }
        this.logger.debug(`Found ${packages.length} packages from local Docker images`);
        return packages;
    }
    async getPackageManifests(packageName) {
        if (!this.authenticated) {
            await this.authenticate();
        }
        const manifests = [];
        const tags = await this.listTags(packageName);
        for (const tag of tags) {
            try {
                const manifest = await this.getManifest(packageName, tag.digest);
                manifests.push(manifest);
            }
            catch (error) {
                this.logger.warning(`Failed to get manifest for ${packageName}@${tag.digest}: ${error instanceof Error ? error.message : 'Unknown error'}`);
            }
        }
        return manifests;
    }
    async listTags(packageName) {
        if (!this.authenticated) {
            await this.authenticate();
        }
        // Use docker image ls to list local images for this package
        const imageName = `${this.registryUrl}/${packageName}`;
        const images = await this.execDockerJson(['image', 'ls']);
        const tags = [];
        for (const image of images) {
            if (image.Repository === imageName) {
                // Get manifest to get digest
                try {
                    const manifest = await this.getManifest(packageName, image.Tag);
                    tags.push({
                        name: image.Tag,
                        digest: manifest.digest,
                        createdAt: new Date(image.CreatedAt),
                    });
                }
                catch (error) {
                    // If we can't get manifest, still add the tag with ID as digest
                    this.logger.debug(`Could not get manifest for ${imageName}:${image.Tag}, using image ID as digest`);
                    tags.push({
                        name: image.Tag,
                        digest: image.ID,
                        createdAt: new Date(image.CreatedAt),
                    });
                }
            }
        }
        this.logger.debug(`Found ${tags.length} tags for ${packageName} from local Docker images`);
        return tags;
    }
    async deleteTag(packageName, tag) {
        if (!this.authenticated) {
            await this.authenticate();
        }
        const imageName = this.getImageName(packageName, tag);
        try {
            // Delete local image using docker image rm
            await exec.exec('docker', ['image', 'rm', imageName], {
                silent: !this.logger.verbose,
            });
            this.logger.info(`Deleted local image ${imageName}`);
        }
        catch (error) {
            // Check if image doesn't exist locally (that's okay)
            const errorMsg = error instanceof Error ? error.message : 'Unknown error';
            if (errorMsg.includes('No such image') || errorMsg.includes('image not found')) {
                this.logger.debug(`Image ${imageName} not found locally, may have already been deleted`);
                return;
            }
            throw new Error(`Failed to delete image ${imageName}: ${errorMsg}`);
        }
    }
    async getManifest(packageName, reference) {
        if (!this.authenticated) {
            await this.authenticate();
        }
        const imageName = this.getImageName(packageName, reference);
        let manifestOutput = '';
        try {
            // Get manifest using docker manifest inspect
            await exec.exec('docker', ['manifest', 'inspect', imageName], {
                silent: !this.logger.verbose,
                listeners: {
                    stdout: (data) => {
                        manifestOutput += data.toString();
                    },
                },
            });
            const manifestData = JSON.parse(manifestOutput);
            // Parse OCI manifest
            const mediaType = manifestData.mediaType || manifestData.schemaVersion ? 'application/vnd.docker.distribution.manifest.v2+json' : 'application/vnd.oci.image.manifest.v1+json';
            // Check if it's a multi-arch manifest (index)
            const isIndex = mediaType.includes('manifest.list') || mediaType.includes('image.index');
            const manifest = {
                digest: reference.startsWith('sha256:') ? reference : `sha256:${reference}`,
                mediaType,
                size: JSON.stringify(manifestData).length,
                createdAt: manifestData.created ? new Date(manifestData.created) : undefined,
            };
            if (isIndex && manifestData.manifests) {
                manifest.manifests = manifestData.manifests.map((m) => ({
                    digest: m.digest,
                    mediaType: m.mediaType,
                    size: m.size,
                    platform: m.platform,
                }));
            }
            else if (manifestData.config) {
                manifest.config = {
                    digest: manifestData.config.digest,
                    mediaType: manifestData.config.mediaType || 'application/vnd.docker.container.image.v1+json',
                    size: manifestData.config.size || 0,
                };
            }
            if (manifestData.layers) {
                manifest.layers = manifestData.layers.map((l) => ({
                    digest: l.digest,
                    mediaType: l.mediaType,
                    size: l.size,
                }));
            }
            return manifest;
        }
        catch (error) {
            throw new Error(`Failed to get manifest for ${packageName}@${reference}: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }
    async deleteManifest(packageName, digest) {
        if (!this.authenticated) {
            await this.authenticate();
        }
        // Try to find local images with this digest and delete them
        const images = await this.execDockerJson(['image', 'ls']);
        const imageName = `${this.registryUrl}/${packageName}`;
        let deleted = false;
        for (const image of images) {
            if (image.Repository === imageName && image.ID.startsWith(digest.replace('sha256:', ''))) {
                try {
                    await exec.exec('docker', ['image', 'rm', `${image.Repository}:${image.Tag}`], {
                        silent: !this.logger.verbose,
                    });
                    this.logger.info(`Deleted local image ${image.Repository}:${image.Tag} (digest: ${digest})`);
                    deleted = true;
                }
                catch (error) {
                    this.logger.debug(`Could not delete ${image.Repository}:${image.Tag}: ${error instanceof Error ? error.message : 'Unknown error'}`);
                }
            }
        }
        if (!deleted) {
            this.logger.debug(`No local images found with digest ${digest} for ${packageName}`);
        }
    }
    async getReferrers(packageName, digest) {
        // Docker CLI doesn't support referrers API
        return [];
    }
    supportsFeature(feature) {
        switch (feature) {
            case 'MULTI_ARCH':
                return true; // Docker CLI can inspect multi-arch manifests
            case 'REFERRERS':
                return false; // Docker CLI doesn't support referrers API
            case 'ATTESTATION':
                return false; // Docker CLI doesn't support attestations
            case 'COSIGN':
                return false; // Docker CLI doesn't support cosign directly
            default:
                return false;
        }
    }
    getKnownRegistryUrls() {
        // Docker CLI is a fallback provider, no known URLs
        return [];
    }
}
exports.DockerCLIProvider = DockerCLIProvider;
//# sourceMappingURL=docker-cli.js.map