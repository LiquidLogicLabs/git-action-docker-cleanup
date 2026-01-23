"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DockerHubProvider = void 0;
const types_1 = require("../types");
const base_1 = require("./base");
/**
 * Docker Hub provider
 * Uses OCI Registry V2 API
 */
class DockerHubProvider extends base_1.BaseProvider {
    username;
    password;
    token;
    registryUrl = 'https://registry-1.docker.io';
    cachedToken;
    tokenExpiry;
    constructor(logger, config, httpClient) {
        super(logger, config, httpClient);
        this.username = config.username;
        this.password = config.password;
        this.token = config.token;
        if (!this.token && !this.username) {
            throw new Error('Authentication required: provide either token or username/password for Docker Hub');
        }
        if (this.username && !this.password) {
            throw new Error('registry-password is required when registry-username is provided');
        }
    }
    getAuthHeaders() {
        if (this.token) {
            return {
                Authorization: `Bearer ${this.token}`,
            };
        }
        return {};
    }
    async getDockerHubToken(packageName) {
        this.logger.debug(`[DockerHub] getDockerHubToken: Starting token acquisition${packageName ? ` for package ${packageName}` : ''}`);
        // If a static token is provided, use it directly
        if (this.token) {
            this.logger.debug(`[DockerHub] getDockerHubToken: Using static token`);
            return this.token;
        }
        // Check if we have a cached token that's still valid
        if (this.cachedToken && this.tokenExpiry && this.tokenExpiry.getTime() > Date.now()) {
            this.logger.debug(`[DockerHub] getDockerHubToken: Using cached token (expires: ${this.tokenExpiry.toISOString()})`);
            return this.cachedToken;
        }
        if (!this.username || !this.password) {
            this.logger.debug(`[DockerHub] getDockerHubToken: No credentials available`);
            throw new types_1.AuthenticationError('Docker Hub credentials required', 'docker-hub');
        }
        // Get token from Docker Hub auth service
        const authUrl = 'https://auth.docker.io/token';
        const service = 'registry.docker.io';
        // Use repository-specific scope if package name is provided, otherwise use catalog scope
        // Format: repository:username/repo:pull,push,delete
        let scope = 'registry:catalog:*';
        if (packageName && this.username) {
            // Extract repo name from packageName (might be username/repo or just repo)
            const repoName = packageName.includes('/') ? packageName : `${this.username}/${packageName}`;
            scope = `repository:${repoName}:pull,repository:${repoName}:push,repository:${repoName}:delete`;
            this.logger.debug(`[DockerHub] getDockerHubToken: Using repository-specific scope: ${scope}`);
        }
        else {
            this.logger.debug(`[DockerHub] getDockerHubToken: Using catalog scope: ${scope}`);
        }
        const tokenUrl = `${authUrl}?service=${service}&scope=${scope}`;
        this.logger.debug(`[DockerHub] getDockerHubToken: Requesting token from ${tokenUrl}`);
        try {
            const response = await this.httpClient.get(tokenUrl, {
                Authorization: `Basic ${Buffer.from(`${this.username}:${this.password}`).toString('base64')}`,
            });
            this.logger.debug(`[DockerHub] getDockerHubToken: Response status ${response.status}`);
            if (!response.data || !response.data.token) {
                this.logger.debug(`[DockerHub] getDockerHubToken: No token in response`);
                throw new types_1.AuthenticationError('Failed to get Docker Hub token', 'docker-hub');
            }
            // Cache the token with expiration (default to 5 minutes if not provided)
            this.cachedToken = response.data.token;
            const expiresIn = response.data.expires_in || 300; // Default to 5 minutes
            this.tokenExpiry = new Date(Date.now() + (expiresIn - 60) * 1000); // Subtract 60s for safety
            this.logger.debug(`[DockerHub] getDockerHubToken: Successfully obtained token, expires in ${expiresIn}s (cached until ${this.tokenExpiry.toISOString()})`);
            return this.cachedToken;
        }
        catch (error) {
            const errorMsg = error instanceof Error ? error.message : 'Unknown error';
            const statusCode = error instanceof Error && 'statusCode' in error ? error.statusCode : 'unknown';
            this.logger.debug(`[DockerHub] getDockerHubToken: Error - Status: ${statusCode}, Message: ${errorMsg}`);
            throw error;
        }
    }
    getRegistryAuthHeaders() {
        // This will be set after authentication
        return {
            Accept: 'application/vnd.oci.image.manifest.v1+json, application/vnd.docker.distribution.manifest.v2+json',
        };
    }
    async authenticate() {
        this.logger.debug(`[DockerHub] authenticate: Starting authentication with Docker Hub`);
        try {
            // Get token (will use cached token if available and valid)
            const token = await this.getDockerHubToken();
            if (!token) {
                this.logger.debug(`[DockerHub] authenticate: Failed to obtain token`);
                throw new types_1.AuthenticationError('Failed to obtain Docker Hub token', 'docker-hub');
            }
            // Test authentication by calling registry API
            // Use a simple endpoint that requires authentication
            const url = `${this.registryUrl}/v2/`;
            this.logger.debug(`[DockerHub] authenticate: Testing authentication with ${url}`);
            const response = await this.httpClient.get(url, {
                ...this.getRegistryAuthHeaders(),
                Authorization: `Bearer ${token}`,
            });
            this.logger.debug(`[DockerHub] authenticate: Response status ${response.status}`);
            // 200 = success, 401 = unauthorized (but token format is valid)
            // 403 = forbidden (token valid but insufficient permissions)
            // Any of these means the token was processed correctly
            if (response.status === 200 || response.status === 401 || response.status === 403) {
                this.authenticated = true;
                this.logger.debug(`[DockerHub] authenticate: Successfully authenticated with Docker Hub (status: ${response.status})`);
            }
            else {
                this.logger.debug(`[DockerHub] authenticate: Unexpected response status ${response.status}`);
                throw new types_1.AuthenticationError(`Unexpected response status: ${response.status}`, 'docker-hub');
            }
        }
        catch (error) {
            // Clear cached token on authentication failure
            this.cachedToken = undefined;
            this.tokenExpiry = undefined;
            this.logger.debug(`[DockerHub] authenticate: Cleared cached token due to authentication failure`);
            if (error instanceof types_1.AuthenticationError) {
                throw error;
            }
            // Provide more detailed error message
            const errorMsg = error instanceof Error ? error.message : 'Unknown error';
            const statusCode = error instanceof Error && 'statusCode' in error ? error.statusCode : 'unknown';
            this.logger.debug(`[DockerHub] authenticate: Error - Status: ${statusCode}, Message: ${errorMsg}`);
            if (errorMsg.includes('401') || errorMsg.includes('Unauthorized')) {
                throw new types_1.AuthenticationError('Docker Hub authentication failed: Invalid credentials. Please check your username and password/token.', 'docker-hub');
            }
            throw new types_1.AuthenticationError(`Docker Hub authentication failed: ${errorMsg}`, 'docker-hub');
        }
    }
    async listPackages() {
        this.logger.debug(`[DockerHub] listPackages: Starting package discovery`);
        if (!this.authenticated) {
            this.logger.debug(`[DockerHub] listPackages: Not authenticated, authenticating...`);
            await this.authenticate();
        }
        // Docker Hub doesn't provide a simple way to list all packages for a user
        // We'll return an empty array and rely on package name being provided
        this.logger.debug(`[DockerHub] listPackages: Docker Hub does not support listing all packages`);
        this.logger.warning('Docker Hub does not support listing all packages. Please specify package names explicitly.');
        return [];
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
        this.logger.debug(`[DockerHub] listTags: Starting for package ${packageName}`);
        if (!this.authenticated) {
            this.logger.debug(`[DockerHub] listTags: Not authenticated, authenticating...`);
            await this.authenticate();
        }
        const token = await this.getDockerHubToken(packageName);
        const url = this.getTagsUrl(packageName);
        this.logger.debug(`[DockerHub] listTags: Fetching tags from ${url}`);
        try {
            const response = await this.httpClient.get(url, {
                ...this.getRegistryAuthHeaders(),
                Authorization: `Bearer ${token}`,
            });
            this.logger.debug(`[DockerHub] listTags: Response status ${response.status}, received ${response.data?.tags?.length || 0} tag names`);
            if (!response.data || !response.data.tags) {
                this.logger.debug(`[DockerHub] listTags: No tags in response, returning empty array`);
                return [];
            }
            const tags = [];
            for (const tagName of response.data.tags) {
                this.logger.debug(`[DockerHub] listTags: Processing tag ${tagName}`);
                try {
                    const manifest = await this.getManifest(packageName, tagName);
                    tags.push({
                        name: tagName,
                        digest: manifest.digest,
                        createdAt: manifest.createdAt,
                        updatedAt: manifest.updatedAt,
                    });
                    this.logger.debug(`[DockerHub] listTags: Tag ${tagName} mapped to digest ${manifest.digest}`);
                }
                catch (error) {
                    const errorMsg = error instanceof Error ? error.message : 'Unknown error';
                    this.logger.debug(`[DockerHub] listTags: Could not get manifest for tag ${tagName}: ${errorMsg}`);
                }
            }
            this.logger.debug(`[DockerHub] listTags: Completed, returning ${tags.length} tags`);
            return tags;
        }
        catch (error) {
            // If token expired, clear cache and retry once
            if (error instanceof Error && (error.message.includes('401') || error.message.includes('Unauthorized'))) {
                this.logger.debug('Token may have expired, clearing cache and retrying');
                this.cachedToken = undefined;
                this.tokenExpiry = undefined;
                const newToken = await this.getDockerHubToken(packageName);
                const response = await this.httpClient.get(url, {
                    ...this.getRegistryAuthHeaders(),
                    Authorization: `Bearer ${newToken}`,
                });
                if (!response.data || !response.data.tags) {
                    return [];
                }
                // Process tags as above
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
                    catch (err) {
                        this.logger.debug(`Could not get manifest for tag ${tagName}: ${err instanceof Error ? err.message : 'Unknown error'}`);
                    }
                }
                return tags;
            }
            throw error;
        }
    }
    async deleteTag(packageName, tag) {
        this.logger.debug(`[DockerHub] deleteTag: Starting deletion of tag ${tag} from package ${packageName}`);
        if (!this.authenticated) {
            this.logger.debug(`[DockerHub] deleteTag: Not authenticated, authenticating...`);
            await this.authenticate();
        }
        // Get manifest digest for the tag
        this.logger.debug(`[DockerHub] deleteTag: Fetching manifest for tag ${tag}`);
        const manifest = await this.getManifest(packageName, tag);
        this.logger.debug(`[DockerHub] deleteTag: Manifest digest: ${manifest.digest}`);
        // Delete via registry API
        this.logger.debug(`[DockerHub] deleteTag: Deleting manifest via deleteManifest`);
        await this.deleteManifest(packageName, manifest.digest);
        this.logger.debug(`[DockerHub] deleteTag: Successfully deleted tag ${tag}`);
    }
    async getManifest(packageName, reference) {
        if (!this.authenticated) {
            await this.authenticate();
        }
        const token = await this.getDockerHubToken(packageName);
        const url = this.getManifestUrl(packageName, reference);
        const headers = {
            ...this.getRegistryAuthHeaders(),
            Authorization: `Bearer ${token}`,
            Accept: 'application/vnd.oci.image.manifest.v1+json, application/vnd.oci.image.index.v1+json, application/vnd.docker.distribution.manifest.v2+json, application/vnd.docker.distribution.manifest.list.v2+json',
        };
        try {
            const response = await this.httpClient.get(url, headers);
            if (!response.data || typeof response.data !== 'string') {
                throw new Error('Invalid manifest response');
            }
            // Parse JSON string to object
            const manifestData = typeof response.data === 'string' ? JSON.parse(response.data) : response.data;
            const ociManifest = this.parseOCIManifest(manifestData);
            const digest = response.headers?.['docker-content-digest'] || reference;
            return this.convertToManifest(digest, ociManifest);
        }
        catch (error) {
            // If token expired, clear cache and retry once
            if (error instanceof Error && (error.message.includes('401') || error.message.includes('Unauthorized'))) {
                this.logger.debug('Token may have expired, clearing cache and retrying');
                this.cachedToken = undefined;
                this.tokenExpiry = undefined;
                const newToken = await this.getDockerHubToken(packageName);
                const response = await this.httpClient.get(url, {
                    ...headers,
                    Authorization: `Bearer ${newToken}`,
                });
                if (!response.data || typeof response.data !== 'string') {
                    throw new Error('Invalid manifest response');
                }
                // Parse JSON string to object
                const manifestData = typeof response.data === 'string' ? JSON.parse(response.data) : response.data;
                const ociManifest = this.parseOCIManifest(manifestData);
                const digest = response.headers?.['docker-content-digest'] || reference;
                return this.convertToManifest(digest, ociManifest);
            }
            throw error;
        }
    }
    async deleteManifest(packageName, digest) {
        this.logger.debug(`[DockerHub] deleteManifest: Starting deletion of manifest ${digest} from package ${packageName}`);
        if (!this.authenticated) {
            this.logger.debug(`[DockerHub] deleteManifest: Not authenticated, authenticating...`);
            await this.authenticate();
        }
        const token = await this.getDockerHubToken(packageName);
        const url = this.getManifestUrl(packageName, digest);
        this.logger.debug(`[DockerHub] deleteManifest: Deleting manifest from ${url}`);
        try {
            const response = await this.httpClient.delete(url, {
                ...this.getRegistryAuthHeaders(),
                Authorization: `Bearer ${token}`,
            });
            this.logger.debug(`[DockerHub] deleteManifest: Response status ${response.status}`);
            this.logger.info(`Deleted manifest ${digest} from package ${packageName}`);
        }
        catch (error) {
            const errorMsg = error instanceof Error ? error.message : 'Unknown error';
            const statusCode = error instanceof Error && 'statusCode' in error ? error.statusCode : 'unknown';
            this.logger.debug(`[DockerHub] deleteManifest: Error - Status: ${statusCode}, Message: ${errorMsg}`);
            // If token expired, clear cache and retry once
            if (error instanceof Error && (error.message.includes('401') || error.message.includes('Unauthorized'))) {
                this.logger.debug('[DockerHub] deleteManifest: Token may have expired, clearing cache and retrying');
                this.cachedToken = undefined;
                this.tokenExpiry = undefined;
                const newToken = await this.getDockerHubToken(packageName);
                this.logger.debug(`[DockerHub] deleteManifest: Retrying deletion with new token`);
                const retryResponse = await this.httpClient.delete(url, {
                    ...this.getRegistryAuthHeaders(),
                    Authorization: `Bearer ${newToken}`,
                });
                this.logger.debug(`[DockerHub] deleteManifest: Retry response status ${retryResponse.status}`);
                this.logger.info(`Deleted manifest ${digest} from package ${packageName}`);
            }
            else {
                throw error;
            }
        }
    }
    async getReferrers(packageName, digest) {
        this.logger.debug(`[DockerHub] getReferrers: Starting for package ${packageName}, digest ${digest}`);
        if (!this.supportsFeature('REFERRERS')) {
            this.logger.debug(`[DockerHub] getReferrers: REFERRERS feature not supported, returning empty array`);
            return [];
        }
        if (!this.authenticated) {
            this.logger.debug(`[DockerHub] getReferrers: Not authenticated, authenticating...`);
            await this.authenticate();
        }
        try {
            const token = await this.getDockerHubToken(packageName);
            const url = this.getReferrersUrl(packageName, digest);
            this.logger.debug(`[DockerHub] getReferrers: Fetching referrers from ${url}`);
            const response = await this.httpClient.get(url, {
                ...this.getRegistryAuthHeaders(),
                Authorization: `Bearer ${token}`,
            });
            this.logger.debug(`[DockerHub] getReferrers: Response status ${response.status}, referrers: ${response.data?.manifests?.length || 0}`);
            if (!response.data || !response.data.manifests) {
                this.logger.debug(`[DockerHub] getReferrers: No referrers in response, returning empty array`);
                return [];
            }
            const referrers = response.data.manifests.map(m => ({
                digest: m.digest,
                artifactType: m.artifactType,
                mediaType: m.mediaType,
                size: m.size,
                annotations: m.annotations,
            }));
            this.logger.debug(`[DockerHub] getReferrers: Returning ${referrers.length} referrers`);
            return referrers;
        }
        catch (error) {
            // Referrers API may not be supported, return empty array
            const errorMsg = error instanceof Error ? error.message : 'Unknown error';
            const statusCode = error instanceof Error && 'statusCode' in error ? error.statusCode : 'unknown';
            this.logger.debug(`[DockerHub] getReferrers: Referrers API not available - Status: ${statusCode}, Message: ${errorMsg}`);
            return [];
        }
    }
    supportsFeature(feature) {
        switch (feature) {
            case 'MULTI_ARCH':
                return true;
            case 'REFERRERS':
                return false; // Docker Hub may have limited referrers support
            case 'ATTESTATION':
                return false; // Docker Hub may have limited attestation support
            case 'COSIGN':
                return false; // Docker Hub may have limited cosign support
            default:
                return false;
        }
    }
    getKnownRegistryUrls() {
        return ['docker.io', 'registry-1.docker.io', 'hub.docker.com'];
    }
    getRegistryApiUrl() {
        return `${this.registryUrl}/v2`;
    }
}
exports.DockerHubProvider = DockerHubProvider;
//# sourceMappingURL=dockerhub.js.map