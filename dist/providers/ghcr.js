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
exports.GHCRProvider = void 0;
const core = __importStar(require("@actions/core"));
const types_1 = require("../types");
const base_1 = require("./base");
/**
 * GitHub Container Registry provider
 * Uses GitHub Package API + OCI Registry V2 API
 */
class GHCRProvider extends base_1.BaseProvider {
    githubToken;
    owner;
    repository;
    githubApiUrl = 'https://api.github.com';
    constructor(logger, config, httpClient) {
        super(logger, config, httpClient);
        this.githubToken = config.token || core.getInput('token') || '';
        if (!this.githubToken) {
            throw new Error('GitHub token is required for GHCR provider');
        }
        this.owner = config.owner || process.env.GITHUB_REPOSITORY_OWNER || '';
        this.repository = config.repository || process.env.GITHUB_REPOSITORY?.split('/')[1] || '';
        if (!this.owner) {
            throw new Error('Owner is required for GHCR provider');
        }
    }
    getAuthHeaders() {
        return {
            Authorization: `Bearer ${this.githubToken}`,
            Accept: 'application/vnd.github+json',
        };
    }
    getRegistryAuthHeaders() {
        return {
            Authorization: `Bearer ${this.githubToken}`,
            Accept: 'application/vnd.oci.image.manifest.v1+json, application/vnd.docker.distribution.manifest.v2+json',
        };
    }
    async authenticate() {
        try {
            // Test authentication by calling GitHub API
            const response = await this.httpClient.get(`${this.githubApiUrl}/user`, this.getAuthHeaders());
            if (response.status === 200) {
                this.authenticated = true;
                this.logger.debug('Successfully authenticated with GitHub');
            }
            else {
                throw new types_1.AuthenticationError('Failed to authenticate with GitHub', 'ghcr');
            }
        }
        catch (error) {
            if (error instanceof types_1.AuthenticationError) {
                throw error;
            }
            throw new types_1.AuthenticationError(`Authentication failed: ${error instanceof Error ? error.message : 'Unknown error'}`, 'ghcr');
        }
    }
    async listPackages() {
        if (!this.authenticated) {
            await this.authenticate();
        }
        const packages = [];
        let page = 1;
        const perPage = 100;
        while (true) {
            const url = `${this.githubApiUrl}/users/${this.owner}/packages?package_type=container&page=${page}&per_page=${perPage}`;
            try {
                const response = await this.httpClient.get(url, this.getAuthHeaders());
                if (!response.data || response.data.length === 0) {
                    break;
                }
                for (const pkg of response.data) {
                    packages.push({
                        id: String(pkg.id),
                        name: pkg.name,
                        type: pkg.package_type,
                        owner: pkg.owner.login,
                        createdAt: new Date(pkg.created_at),
                        updatedAt: new Date(pkg.updated_at),
                    });
                }
                if (response.data.length < perPage) {
                    break;
                }
                page++;
            }
            catch (error) {
                if (error instanceof types_1.NotFoundError) {
                    break;
                }
                throw error;
            }
        }
        return packages;
    }
    async getPackageManifests(packageName) {
        if (!this.authenticated) {
            await this.authenticate();
        }
        const manifests = [];
        const packageVersions = await this.getPackageVersions(packageName);
        for (const version of packageVersions) {
            try {
                const manifest = await this.getManifest(packageName, version.digest);
                manifests.push(manifest);
            }
            catch (error) {
                this.logger.warning(`Failed to get manifest for ${packageName}@${version.digest}: ${error instanceof Error ? error.message : 'Unknown error'}`);
            }
        }
        return manifests;
    }
    async getPackageVersions(packageName) {
        const url = `${this.githubApiUrl}/users/${this.owner}/packages/container/${packageName}/versions`;
        const response = await this.httpClient.get(url, this.getAuthHeaders());
        if (!response.data) {
            return [];
        }
        // Extract digests from package versions
        // Note: GitHub API doesn't directly provide digests, we need to get them from manifests
        const versions = [];
        for (const version of response.data) {
            // Try to get digest from tags
            if (version.metadata?.container?.tags && version.metadata.container.tags.length > 0) {
                try {
                    const tags = await this.listTags(packageName);
                    const tag = tags.find(t => version.metadata.container.tags.includes(t.name));
                    if (tag) {
                        versions.push({
                            id: version.id,
                            digest: tag.digest,
                            created_at: version.created_at,
                        });
                    }
                }
                catch (error) {
                    this.logger.debug(`Could not get digest for version ${version.id}: ${error instanceof Error ? error.message : 'Unknown error'}`);
                }
            }
        }
        return versions;
    }
    async listTags(packageName) {
        if (!this.authenticated) {
            await this.authenticate();
        }
        const url = this.getTagsUrl(packageName);
        const response = await this.httpClient.get(url, this.getRegistryAuthHeaders());
        if (!response.data || !response.data.tags) {
            return [];
        }
        const tags = [];
        for (const tagName of response.data.tags) {
            try {
                const manifest = await this.getManifest(packageName, tagName);
                tags.push({
                    name: tagName,
                    digest: manifest.digest,
                    createdAt: manifest.createdAt,
                    updatedAt: manifest.updatedAt,
                });
            }
            catch (error) {
                this.logger.debug(`Could not get manifest for tag ${tagName}: ${error instanceof Error ? error.message : 'Unknown error'}`);
            }
        }
        return tags;
    }
    async deleteTag(packageName, tag) {
        if (!this.authenticated) {
            await this.authenticate();
        }
        // Get manifest digest for the tag
        const manifest = await this.getManifest(packageName, tag);
        // Delete the package version via GitHub API
        const packageVersions = await this.getPackageVersions(packageName);
        const version = packageVersions.find(v => v.digest === manifest.digest);
        if (version) {
            const url = `${this.githubApiUrl}/users/${this.owner}/packages/container/${packageName}/versions/${version.id}`;
            await this.httpClient.delete(url, this.getAuthHeaders());
            this.logger.info(`Deleted tag ${tag} (version ${version.id}) from package ${packageName}`);
        }
        else {
            // Fallback: delete via registry API
            await this.deleteManifest(packageName, manifest.digest);
        }
    }
    async getManifest(packageName, reference) {
        if (!this.authenticated) {
            await this.authenticate();
        }
        const url = this.getManifestUrl(packageName, reference);
        const headers = {
            ...this.getRegistryAuthHeaders(),
            Accept: 'application/vnd.oci.image.manifest.v1+json, application/vnd.oci.image.index.v1+json, application/vnd.docker.distribution.manifest.v2+json, application/vnd.docker.distribution.manifest.list.v2+json',
        };
        const response = await this.httpClient.get(url, headers);
        if (!response.data || typeof response.data !== 'string') {
            throw new Error('Invalid manifest response');
        }
        const ociManifest = this.parseOCIManifest(response.data);
        const digest = response.headers?.['docker-content-digest'] || reference;
        return this.convertToManifest(digest, ociManifest);
    }
    async deleteManifest(packageName, digest) {
        if (!this.authenticated) {
            await this.authenticate();
        }
        const url = this.getManifestUrl(packageName, digest);
        await this.httpClient.delete(url, this.getRegistryAuthHeaders());
        this.logger.info(`Deleted manifest ${digest} from package ${packageName}`);
    }
    async getReferrers(packageName, digest) {
        if (!this.supportsFeature('REFERRERS')) {
            return [];
        }
        if (!this.authenticated) {
            await this.authenticate();
        }
        try {
            const url = this.getReferrersUrl(packageName, digest);
            const response = await this.httpClient.get(url, this.getRegistryAuthHeaders());
            if (!response.data || !response.data.manifests) {
                return [];
            }
            return response.data.manifests.map(m => ({
                digest: m.digest,
                artifactType: m.artifactType,
                mediaType: m.mediaType,
                size: m.size,
                annotations: m.annotations,
            }));
        }
        catch (error) {
            // Referrers API may not be supported, return empty array
            this.logger.debug(`Referrers API not available for ${packageName}@${digest}: ${error instanceof Error ? error.message : 'Unknown error'}`);
            return [];
        }
    }
    supportsFeature(feature) {
        switch (feature) {
            case 'MULTI_ARCH':
                return true;
            case 'REFERRERS':
                return true; // GHCR supports OCI referrers
            case 'ATTESTATION':
                return true; // GHCR supports attestations
            case 'COSIGN':
                return true; // GHCR supports cosign
            default:
                return false;
        }
    }
    getKnownRegistryUrls() {
        return ['ghcr.io'];
    }
}
exports.GHCRProvider = GHCRProvider;
//# sourceMappingURL=ghcr.js.map