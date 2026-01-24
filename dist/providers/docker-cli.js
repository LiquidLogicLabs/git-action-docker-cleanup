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
        const normalized = url.replace(/^https?:\/\//, '').replace(/\/$/, '');
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
        this.logger.debug(`[DockerCLI] Authenticating with registry: ${this.registryUrl} (optional for local operations)`);
        // Authentication is optional for Docker CLI provider since it only works with local images
        // If credentials are provided, we'll login to the registry (useful for pulling images or if Docker has cached credentials)
        const username = this.config.username;
        const password = this.config.password || this.config.token;
        if (username && password) {
            this.logger.debug(`[DockerCLI] authenticate: Credentials provided, attempting docker login`);
            try {
                // Login to registry using docker login
                const loginArgs = [
                    'login',
                    this.registryUrl,
                    '--username',
                    username,
                    '--password-stdin',
                ];
                this.logger.debug(`[DockerCLI] authenticate: Running docker login for ${this.registryUrl}`);
                await exec.exec('docker', loginArgs, {
                    input: Buffer.from(password),
                    silent: !this.logger.verbose,
                });
                this.logger.debug(`[DockerCLI] authenticate: Successfully authenticated with registry ${this.registryUrl}`);
            }
            catch (error) {
                // Don't fail if login fails - we can still work with local images
                const errorMsg = error instanceof Error ? error.message : 'Unknown error';
                this.logger.debug(`[DockerCLI] authenticate: Docker login failed: ${errorMsg}`);
                this.logger.warning(`Docker login failed (continuing with local images only): ${errorMsg}`);
            }
        }
        else {
            this.logger.debug('[DockerCLI] authenticate: No credentials provided - working with local images only');
        }
        // Mark as authenticated even without credentials since we can work with local images
        this.authenticated = true;
        this.logger.debug(`[DockerCLI] authenticate: Authentication complete (authenticated: ${this.authenticated})`);
    }
    async listPackages() {
        this.logger.debug(`[DockerCLI] Listing all packages from local Docker images (registry: ${this.registryUrl})`);
        // Authentication is optional for local operations
        if (!this.authenticated) {
            await this.authenticate();
        }
        // Use docker image ls to list local images, filter by registry URL
        this.logger.debug(`[DockerCLI] listPackages: Running 'docker image ls' to list local images`);
        const images = await this.execDockerJson(['image', 'ls']);
        this.logger.debug(`[DockerCLI] listPackages: Found ${images.length} local images, filtering by registry ${this.registryUrl}`);
        // Extract unique package names from images that match our registry
        const packageNames = new Set();
        for (const image of images) {
            // Check if image belongs to our registry
            if (image.Repository.startsWith(`${this.registryUrl}/`)) {
                // Extract package name (everything after registry URL)
                const packageName = image.Repository.replace(`${this.registryUrl}/`, '');
                packageNames.add(packageName);
                this.logger.debug(`[DockerCLI] listPackages: Found package ${packageName} from image ${image.Repository}`);
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
        this.logger.debug(`[DockerCLI] listPackages: Completed, found ${packages.length} packages from local Docker images`);
        return packages;
    }
    async getPackageManifests(packageName) {
        this.logger.debug(`[DockerCLI] Getting all manifests for package: ${packageName} from local Docker images`);
        // Authentication is optional for local operations
        if (!this.authenticated) {
            await this.authenticate();
        }
        const manifests = [];
        const tags = await this.listTags(packageName);
        this.logger.debug(`[DockerCLI] getPackageManifests: Found ${tags.length} tags`);
        for (const tag of tags) {
            this.logger.debug(`[DockerCLI] getPackageManifests: Fetching manifest for tag ${tag.name} (digest: ${tag.digest})`);
            try {
                const manifest = await this.getManifest(packageName, tag.digest);
                manifests.push(manifest);
                this.logger.debug(`[DockerCLI] getPackageManifests: Successfully fetched manifest ${manifest.digest}`);
            }
            catch (error) {
                const errorMsg = error instanceof Error ? error.message : 'Unknown error';
                this.logger.debug(`[DockerCLI] getPackageManifests: Failed to get manifest for ${packageName}@${tag.digest}: ${errorMsg}`);
                this.logger.warning(`Failed to get manifest for ${packageName}@${tag.digest}: ${errorMsg}`);
            }
        }
        this.logger.debug(`[DockerCLI] getPackageManifests: Completed, returning ${manifests.length} manifests`);
        return manifests;
    }
    async listTags(packageName) {
        this.logger.debug(`[DockerCLI] Listing all tags for package: ${packageName} from local Docker images`);
        // Authentication is optional for local operations
        if (!this.authenticated) {
            await this.authenticate();
        }
        // Use docker image ls to list local images for this package
        const imageName = `${this.registryUrl}/${packageName}`;
        this.logger.debug(`[DockerCLI] listTags: Running 'docker image ls' to find images matching ${imageName}`);
        const images = await this.execDockerJson(['image', 'ls']);
        this.logger.debug(`[DockerCLI] listTags: Found ${images.length} local images, filtering for ${imageName}`);
        const tags = [];
        for (const image of images) {
            if (image.Repository === imageName) {
                this.logger.debug(`[DockerCLI] listTags: Processing image ${imageName}:${image.Tag}`);
                // Get manifest to get digest
                try {
                    const manifest = await this.getManifest(packageName, image.Tag);
                    tags.push({
                        name: image.Tag,
                        digest: manifest.digest,
                        createdAt: new Date(image.CreatedAt),
                    });
                    this.logger.debug(`[DockerCLI] listTags: Tag ${image.Tag} mapped to digest ${manifest.digest}`);
                }
                catch (error) {
                    // If we can't get manifest, still add the tag with ID as digest
                    const errorMsg = error instanceof Error ? error.message : 'Unknown error';
                    this.logger.debug(`[DockerCLI] listTags: Could not get manifest for ${imageName}:${image.Tag}: ${errorMsg}, using image ID as digest`);
                    tags.push({
                        name: image.Tag,
                        digest: image.ID,
                        createdAt: new Date(image.CreatedAt),
                    });
                }
            }
        }
        this.logger.debug(`[DockerCLI] listTags: Completed, returning ${tags.length} tags for ${packageName} from local Docker images`);
        return tags;
    }
    async deleteTag(packageName, tag, _tagsBeingDeleted) {
        this.logger.debug(`[DockerCLI] Deleting local Docker image: ${packageName}:${tag}`);
        // Authentication is optional for local operations
        if (!this.authenticated) {
            await this.authenticate();
        }
        const imageName = this.getImageName(packageName, tag);
        this.logger.debug(`[DockerCLI] deleteTag: Deleting local image ${imageName}`);
        try {
            // Delete local image using docker image rm
            this.logger.debug(`[DockerCLI] deleteTag: Running 'docker image rm ${imageName}'`);
            await exec.exec('docker', ['image', 'rm', imageName], {
                silent: !this.logger.verbose,
            });
            this.logger.info(`Deleted local image ${imageName}`);
            this.logger.debug(`[DockerCLI] deleteTag: Successfully deleted local image ${imageName}`);
        }
        catch (error) {
            // Check if image doesn't exist locally (that's okay)
            const errorMsg = error instanceof Error ? error.message : 'Unknown error';
            this.logger.debug(`[DockerCLI] deleteTag: Error: ${errorMsg}`);
            if (errorMsg.includes('No such image') || errorMsg.includes('image not found')) {
                this.logger.debug(`[DockerCLI] deleteTag: Image ${imageName} not found locally, may have already been deleted`);
                return;
            }
            this.logger.error(`[DockerCLI] deleteTag: Failed to delete image ${imageName}: ${errorMsg}`);
            throw new Error(`Failed to delete image ${imageName}: ${errorMsg}`);
        }
    }
    async getManifest(packageName, reference) {
        this.logger.debug(`[DockerCLI] Inspecting local Docker image manifest: ${packageName}:${reference}`);
        // Authentication is optional for local operations
        if (!this.authenticated) {
            await this.authenticate();
        }
        const imageName = this.getImageName(packageName, reference);
        this.logger.debug(`[DockerCLI] getManifest: Inspecting local image ${imageName}`);
        let manifestOutput = '';
        try {
            // Get manifest using docker manifest inspect
            this.logger.debug(`[DockerCLI] getManifest: Running 'docker manifest inspect ${imageName}'`);
            await exec.exec('docker', ['manifest', 'inspect', imageName], {
                silent: !this.logger.verbose,
                listeners: {
                    stdout: (data) => {
                        manifestOutput += data.toString();
                    },
                },
            });
            this.logger.debug(`[DockerCLI] getManifest: Received ${manifestOutput.length} bytes of manifest data`);
            const manifestData = JSON.parse(manifestOutput);
            // Parse OCI manifest
            const mediaType = manifestData.mediaType || manifestData.schemaVersion ? 'application/vnd.docker.distribution.manifest.v2+json' : 'application/vnd.oci.image.manifest.v1+json';
            // Check if it's a multi-arch manifest (index)
            const isIndex = mediaType.includes('manifest.list') || mediaType.includes('image.index');
            this.logger.debug(`[DockerCLI] getManifest: Parsed manifest, mediaType: ${mediaType}, isIndex: ${isIndex}`);
            const manifest = {
                digest: reference.startsWith('sha256:') ? reference : `sha256:${reference}`,
                mediaType,
                size: JSON.stringify(manifestData).length,
                createdAt: manifestData.created ? new Date(manifestData.created) : undefined,
            };
            if (isIndex && manifestData.manifests) {
                this.logger.debug(`[DockerCLI] getManifest: Multi-arch manifest with ${manifestData.manifests.length} child manifests`);
                manifest.manifests = manifestData.manifests.map((m) => ({
                    digest: m.digest,
                    mediaType: m.mediaType,
                    size: m.size,
                    platform: m.platform,
                }));
            }
            else if (manifestData.config) {
                this.logger.debug(`[DockerCLI] getManifest: Single-arch manifest with config`);
                manifest.config = {
                    digest: manifestData.config.digest,
                    mediaType: manifestData.config.mediaType || 'application/vnd.docker.container.image.v1+json',
                    size: manifestData.config.size || 0,
                };
            }
            if (manifestData.layers) {
                this.logger.debug(`[DockerCLI] getManifest: Manifest has ${manifestData.layers.length} layers`);
                manifest.layers = manifestData.layers.map((l) => ({
                    digest: l.digest,
                    mediaType: l.mediaType,
                    size: l.size,
                }));
            }
            this.logger.debug(`[DockerCLI] getManifest: Successfully parsed manifest, digest: ${manifest.digest}`);
            return manifest;
        }
        catch (error) {
            const errorMsg = error instanceof Error ? error.message : 'Unknown error';
            this.logger.debug(`[DockerCLI] getManifest: Error: ${errorMsg}`);
            throw new Error(`Failed to get manifest for ${packageName}@${reference}: ${errorMsg}`);
        }
    }
    async deleteManifest(packageName, digest) {
        this.logger.debug(`[DockerCLI] Deleting local Docker images matching manifest digest: ${digest} from package: ${packageName}`);
        // Authentication is optional for local operations
        if (!this.authenticated) {
            await this.authenticate();
        }
        // Try to find local images with this digest and delete them
        this.logger.debug(`[DockerCLI] deleteManifest: Running 'docker image ls' to find images with digest ${digest}`);
        const images = await this.execDockerJson(['image', 'ls']);
        this.logger.debug(`[DockerCLI] deleteManifest: Found ${images.length} local images, searching for matches`);
        const imageName = `${this.registryUrl}/${packageName}`;
        const digestShort = digest.replace('sha256:', '');
        this.logger.debug(`[DockerCLI] deleteManifest: Looking for images matching ${imageName} with digest prefix ${digestShort}`);
        let deleted = false;
        for (const image of images) {
            if (image.Repository === imageName && image.ID.startsWith(digestShort)) {
                const fullImageName = `${image.Repository}:${image.Tag}`;
                this.logger.debug(`[DockerCLI] deleteManifest: Found matching image ${fullImageName} (ID: ${image.ID})`);
                try {
                    this.logger.debug(`[DockerCLI] deleteManifest: Running 'docker image rm ${fullImageName}'`);
                    await exec.exec('docker', ['image', 'rm', fullImageName], {
                        silent: !this.logger.verbose,
                    });
                    this.logger.info(`Deleted local image ${fullImageName} (digest: ${digest})`);
                    this.logger.debug(`[DockerCLI] deleteManifest: Successfully deleted local image ${fullImageName}`);
                    deleted = true;
                }
                catch (error) {
                    const errorMsg = error instanceof Error ? error.message : 'Unknown error';
                    this.logger.debug(`[DockerCLI] deleteManifest: Could not delete ${fullImageName}: ${errorMsg}`);
                }
            }
        }
        if (!deleted) {
            this.logger.debug(`[DockerCLI] deleteManifest: No local images found with digest ${digest} for ${packageName}`);
        }
        else {
            this.logger.debug(`[DockerCLI] deleteManifest: Completed deletion of manifest ${digest}`);
        }
    }
    async getReferrers(packageName, digest) {
        this.logger.debug(`[DockerCLI] Fetching referrers for package: ${packageName}, digest: ${digest} (Docker CLI doesn't support referrers API, returning empty array)`);
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