"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.GiteaProvider = void 0;
const types_1 = require("../types");
const base_1 = require("./base");
/**
 * Gitea Container Registry provider
 * Uses Gitea Package API + OCI Registry V2 API
 */
class GiteaProvider extends base_1.BaseProvider {
    giteaToken;
    owner;
    repository;
    giteaApiUrl;
    constructor(logger, config, httpClient) {
        super(logger, config, httpClient);
        if (!config.registryUrl) {
            throw new Error('registry-url is required for Gitea provider');
        }
        this.giteaToken = config.token || '';
        if (!this.giteaToken) {
            throw new Error('Gitea token is required for Gitea provider');
        }
        // Extract Gitea API URL from registry URL
        // Gitea registry is typically at <gitea-url>/v2, API is at <gitea-url>/api/v1
        const baseUrl = this.registryUrl.replace(/\/v2\/?$/, '');
        this.giteaApiUrl = `${baseUrl}/api/v1`;
        this.owner = config.owner || '';
        this.repository = config.repository || '';
        if (!this.owner) {
            throw new Error('Owner is required for Gitea provider');
        }
    }
    getAuthHeaders() {
        return {
            Authorization: `token ${this.giteaToken}`,
            'Content-Type': 'application/json',
        };
    }
    getRegistryAuthHeaders() {
        return {
            Authorization: `Bearer ${this.giteaToken}`,
            Accept: 'application/vnd.oci.image.manifest.v1+json, application/vnd.docker.distribution.manifest.v2+json',
        };
    }
    async authenticate() {
        try {
            // Test authentication by calling Gitea API
            const response = await this.httpClient.get(`${this.giteaApiUrl}/user`, this.getAuthHeaders());
            if (response.status === 200) {
                this.authenticated = true;
                this.logger.debug('Successfully authenticated with Gitea');
            }
            else {
                throw new types_1.AuthenticationError('Failed to authenticate with Gitea', 'gitea');
            }
        }
        catch (error) {
            if (error instanceof types_1.AuthenticationError) {
                throw error;
            }
            throw new types_1.AuthenticationError(`Authentication failed: ${error instanceof Error ? error.message : 'Unknown error'}`, 'gitea');
        }
    }
    async listPackages() {
        if (!this.authenticated) {
            await this.authenticate();
        }
        const packages = [];
        let page = 1;
        const limit = 50;
        while (true) {
            const url = `${this.giteaApiUrl}/packages/${this.owner}?type=container&page=${page}&limit=${limit}`;
            try {
                const response = await this.httpClient.get(url, this.getAuthHeaders());
                if (!response.data || response.data.length === 0) {
                    break;
                }
                for (const pkg of response.data) {
                    packages.push({
                        id: String(pkg.id),
                        name: pkg.name,
                        type: pkg.type,
                        owner: pkg.owner.login,
                        createdAt: new Date(pkg.created_at),
                    });
                }
                if (response.data.length < limit) {
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
        const url = `${this.giteaApiUrl}/packages/${this.owner}/${packageName}?type=container`;
        const response = await this.httpClient.get(url, this.getAuthHeaders());
        if (!response.data || !response.data.versions) {
            return [];
        }
        // Extract digests from package versions
        const versions = [];
        for (const version of response.data.versions) {
            // Try to get digest from tags
            try {
                const tags = await this.listTags(packageName);
                const tag = tags.find(t => t.name === version.version);
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
        // Delete the package version via Gitea API
        const packageVersions = await this.getPackageVersions(packageName);
        const version = packageVersions.find(v => v.digest === manifest.digest);
        if (version) {
            const url = `${this.giteaApiUrl}/packages/${this.owner}/${packageName}/versions/${version.id}`;
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
                return true; // Gitea supports OCI referrers (depending on version)
            case 'ATTESTATION':
                return true; // Gitea supports attestations
            case 'COSIGN':
                return true; // Gitea supports cosign
            default:
                return false;
        }
    }
    getKnownRegistryUrls() {
        // Gitea is typically self-hosted, so no default URLs
        return [];
    }
}
exports.GiteaProvider = GiteaProvider;
//# sourceMappingURL=gitea.js.map