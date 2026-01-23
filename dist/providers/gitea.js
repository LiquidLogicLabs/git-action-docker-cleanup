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
        // Gitea's OCI Registry V2 API uses Basic auth with username:token
        // Use the owner as username and token as password
        const authString = Buffer.from(`${this.owner}:${this.giteaToken}`).toString('base64');
        return {
            Authorization: `Basic ${authString}`,
            Accept: 'application/vnd.oci.image.manifest.v1+json, application/vnd.docker.distribution.manifest.v2+json',
        };
    }
    async authenticate() {
        this.logger.debug(`[Gitea] authenticate: Starting authentication with Gitea API at ${this.giteaApiUrl}`);
        try {
            // Test authentication by calling Gitea API
            const url = `${this.giteaApiUrl}/user`;
            this.logger.debug(`[Gitea] authenticate: Calling ${url}`);
            const response = await this.httpClient.get(url, this.getAuthHeaders());
            this.logger.debug(`[Gitea] authenticate: Response status ${response.status}`);
            if (response.status === 200) {
                this.authenticated = true;
                this.logger.debug('[Gitea] authenticate: Successfully authenticated with Gitea');
            }
            else {
                this.logger.debug(`[Gitea] authenticate: Authentication failed with status ${response.status}`);
                throw new types_1.AuthenticationError('Failed to authenticate with Gitea', 'gitea');
            }
        }
        catch (error) {
            const errorMsg = error instanceof Error ? error.message : 'Unknown error';
            const statusCode = error instanceof Error && 'statusCode' in error ? error.statusCode : 'unknown';
            this.logger.debug(`[Gitea] authenticate: Error - Status: ${statusCode}, Message: ${errorMsg}`);
            if (error instanceof types_1.AuthenticationError) {
                throw error;
            }
            throw new types_1.AuthenticationError(`Authentication failed: ${errorMsg}`, 'gitea');
        }
    }
    async listPackages() {
        this.logger.debug(`[Gitea] listPackages: Starting package discovery for owner ${this.owner}`);
        if (!this.authenticated) {
            this.logger.debug(`[Gitea] listPackages: Not authenticated, authenticating...`);
            await this.authenticate();
        }
        const packages = [];
        let page = 1;
        const limit = 50;
        while (true) {
            const url = `${this.giteaApiUrl}/packages/${this.owner}?type=container&page=${page}&limit=${limit}`;
            this.logger.debug(`[Gitea] listPackages: Fetching page ${page} from ${url}`);
            try {
                const response = await this.httpClient.get(url, this.getAuthHeaders());
                this.logger.debug(`[Gitea] listPackages: Response status ${response.status}, received ${response.data?.length || 0} packages`);
                if (!response.data || response.data.length === 0) {
                    this.logger.debug(`[Gitea] listPackages: No more packages, stopping pagination`);
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
        this.logger.debug(`[Gitea] getPackageManifests: Starting for package ${packageName}`);
        if (!this.authenticated) {
            this.logger.debug(`[Gitea] getPackageManifests: Not authenticated, authenticating...`);
            await this.authenticate();
        }
        const manifests = [];
        try {
            const packageVersions = await this.getPackageVersions(packageName);
            this.logger.debug(`[Gitea] getPackageManifests: Found ${packageVersions.length} package versions`);
            for (const version of packageVersions) {
                this.logger.debug(`[Gitea] getPackageManifests: Fetching manifest for version ${version.id} (digest: ${version.digest})`);
                try {
                    const manifest = await this.getManifest(packageName, version.digest);
                    manifests.push(manifest);
                    this.logger.debug(`[Gitea] getPackageManifests: Successfully fetched manifest ${manifest.digest}`);
                }
                catch (error) {
                    const errorMsg = error instanceof Error ? error.message : 'Unknown error';
                    this.logger.debug(`[Gitea] getPackageManifests: Failed to get manifest for ${packageName}@${version.digest}: ${errorMsg}`);
                }
            }
        }
        catch (error) {
            // If getPackageVersions fails (e.g., package not found), return empty array
            // This is expected for packages that don't exist or have no versions
            const errorMsg = error instanceof Error ? error.message : 'Unknown error';
            this.logger.debug(`[Gitea] getPackageManifests: Could not get package versions for ${packageName}: ${errorMsg}`);
        }
        this.logger.debug(`[Gitea] getPackageManifests: Completed, returning ${manifests.length} manifests`);
        return manifests;
    }
    /**
     * Extract package name from full package path (e.g., "owner/package-name" -> "package-name")
     */
    extractPackageName(packageName) {
        // If package name includes owner prefix (e.g., "owner/package-name"), extract just the package name
        if (packageName.includes('/')) {
            const parts = packageName.split('/');
            return parts.slice(1).join('/'); // Handle nested packages
        }
        return packageName;
    }
    async getPackageVersions(packageName) {
        this.logger.debug(`[Gitea] getPackageVersions: Starting for package ${packageName}`);
        // Extract just the package name (without owner prefix)
        const packageNameOnly = this.extractPackageName(packageName);
        this.logger.debug(`[Gitea] getPackageVersions: Extracted package name: ${packageNameOnly} (from ${packageName})`);
        // Try the package endpoint - Gitea API might return a single package object with versions
        const url = `${this.giteaApiUrl}/packages/${this.owner}/${packageNameOnly}?type=container`;
        this.logger.debug(`[Gitea] getPackageVersions: Attempting single package endpoint: ${url}`);
        try {
            // First try as a single package object with versions array
            const response = await this.httpClient.get(url, this.getAuthHeaders());
            this.logger.debug(`[Gitea] getPackageVersions: Single package endpoint response status ${response.status}`);
            if (response.data?.versions) {
                this.logger.debug(`[Gitea] getPackageVersions: Found ${response.data.versions.length} versions in single package response`);
                // Extract digests from package versions
                const versions = [];
                for (const version of response.data.versions) {
                    this.logger.debug(`[Gitea] getPackageVersions: Processing version ${version.id} (tag: ${version.version})`);
                    // Try to get digest from tags
                    try {
                        const tags = await this.listTags(packageName); // listTags handles full package name
                        const tag = tags.find(t => t.name === version.version);
                        if (tag) {
                            versions.push({
                                id: version.id,
                                digest: tag.digest,
                                created_at: version.created_at,
                            });
                            this.logger.debug(`[Gitea] getPackageVersions: Mapped version ${version.id} to digest ${tag.digest}`);
                        }
                        else {
                            this.logger.debug(`[Gitea] getPackageVersions: Could not find tag ${version.version} in tags list`);
                        }
                    }
                    catch (error) {
                        const errorMsg = error instanceof Error ? error.message : 'Unknown error';
                        this.logger.debug(`[Gitea] getPackageVersions: Could not get digest for version ${version.id}: ${errorMsg}`);
                    }
                }
                this.logger.debug(`[Gitea] getPackageVersions: Returning ${versions.length} versions with digests`);
                return versions;
            }
            else {
                this.logger.debug(`[Gitea] getPackageVersions: Single package response has no versions array`);
            }
        }
        catch (error) {
            // If single package endpoint fails, try listing all packages and finding the one we need
            const errorMsg = error instanceof Error ? error.message : 'Unknown error';
            const statusCode = error instanceof Error && 'statusCode' in error ? error.statusCode : 'unknown';
            this.logger.debug(`[Gitea] getPackageVersions: Single package endpoint failed - Status: ${statusCode}, Message: ${errorMsg}`);
            try {
                this.logger.debug(`[Gitea] getPackageVersions: Falling back to listPackages approach`);
                // List all packages and find the one matching our package name
                const allPackages = await this.listPackages();
                this.logger.debug(`[Gitea] getPackageVersions: Listed ${allPackages.length} packages, searching for ${packageNameOnly}`);
                const matchingPackage = allPackages.find(pkg => {
                    const pkgNameOnly = this.extractPackageName(pkg.name);
                    return pkgNameOnly === packageNameOnly || pkg.name === packageName || pkg.name === packageNameOnly;
                });
                if (matchingPackage) {
                    this.logger.debug(`[Gitea] getPackageVersions: Found matching package: ${matchingPackage.name} (id: ${matchingPackage.id})`);
                    // Try to get versions using the package ID or name from listPackages
                    const packageIdUrl = `${this.giteaApiUrl}/packages/${this.owner}/${matchingPackage.name}?type=container`;
                    this.logger.debug(`[Gitea] getPackageVersions: Attempting package endpoint with matched name: ${packageIdUrl}`);
                    const packageResponse = await this.httpClient.get(packageIdUrl, this.getAuthHeaders());
                    this.logger.debug(`[Gitea] getPackageVersions: Package response status ${packageResponse.status}, versions: ${packageResponse.data?.versions?.length || 0}`);
                    if (packageResponse.data?.versions) {
                        this.logger.debug(`[Gitea] getPackageVersions: Processing ${packageResponse.data.versions.length} versions from matched package`);
                        // Extract digests from package versions
                        const versions = [];
                        for (const version of packageResponse.data.versions) {
                            this.logger.debug(`[Gitea] getPackageVersions: Processing version ${version.id} (tag: ${version.version})`);
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
                                    this.logger.debug(`[Gitea] getPackageVersions: Mapped version ${version.id} to digest ${tag.digest}`);
                                }
                                else {
                                    this.logger.debug(`[Gitea] getPackageVersions: Could not find tag ${version.version} in tags list`);
                                }
                            }
                            catch (error) {
                                const errorMsg = error instanceof Error ? error.message : 'Unknown error';
                                this.logger.debug(`[Gitea] getPackageVersions: Could not get digest for version ${version.id}: ${errorMsg}`);
                            }
                        }
                        this.logger.debug(`[Gitea] getPackageVersions: Returning ${versions.length} versions with digests (via listPackages fallback)`);
                        return versions;
                    }
                    else {
                        this.logger.debug(`[Gitea] getPackageVersions: Matched package response has no versions array`);
                    }
                }
                else {
                    this.logger.debug(`[Gitea] getPackageVersions: No matching package found in ${allPackages.length} packages`);
                }
            }
            catch (listError) {
                const errorMsg = listError instanceof Error ? listError.message : 'Unknown error';
                const statusCode = listError instanceof Error && 'statusCode' in listError ? listError.statusCode : 'unknown';
                this.logger.debug(`[Gitea] getPackageVersions: listPackages fallback failed - Status: ${statusCode}, Message: ${errorMsg}`);
            }
        }
        this.logger.debug(`[Gitea] getPackageVersions: No versions found, returning empty array`);
        return [];
    }
    async listTags(packageName) {
        this.logger.debug(`[Gitea] listTags: Starting for package ${packageName}`);
        if (!this.authenticated) {
            this.logger.debug(`[Gitea] listTags: Not authenticated, authenticating...`);
            await this.authenticate();
        }
        const url = this.getTagsUrl(packageName);
        this.logger.debug(`[Gitea] listTags: Fetching tags from ${url}`);
        try {
            const response = await this.httpClient.get(url, this.getRegistryAuthHeaders());
            this.logger.debug(`[Gitea] listTags: Response status ${response.status}, received ${response.data?.tags?.length || 0} tag names`);
            if (!response.data || !response.data.tags) {
                this.logger.debug(`[Gitea] listTags: No tags in response, returning empty array`);
                return [];
            }
            const tags = [];
            for (const tagName of response.data.tags) {
                this.logger.debug(`[Gitea] listTags: Processing tag ${tagName}`);
                try {
                    const manifest = await this.getManifest(packageName, tagName);
                    tags.push({
                        name: tagName,
                        digest: manifest.digest,
                        createdAt: manifest.createdAt,
                        updatedAt: manifest.updatedAt,
                    });
                    this.logger.debug(`[Gitea] listTags: Tag ${tagName} mapped to digest ${manifest.digest}`);
                }
                catch (error) {
                    const errorMsg = error instanceof Error ? error.message : 'Unknown error';
                    this.logger.debug(`[Gitea] listTags: Could not get manifest for tag ${tagName}: ${errorMsg}`);
                }
            }
            this.logger.debug(`[Gitea] listTags: Completed, returning ${tags.length} tags`);
            return tags;
        }
        catch (error) {
            const errorMsg = error instanceof Error ? error.message : 'Unknown error';
            const statusCode = error instanceof Error && 'statusCode' in error ? error.statusCode : 'unknown';
            this.logger.debug(`[Gitea] listTags: Error fetching tags - Status: ${statusCode}, Message: ${errorMsg}`);
            this.logger.warning(`Failed to list tags for ${packageName}: ${errorMsg}`);
            return [];
        }
    }
    async deleteTag(packageName, tag) {
        this.logger.debug(`[Gitea] deleteTag: Starting deletion of tag ${tag} from package ${packageName}`);
        if (!this.authenticated) {
            this.logger.debug(`[Gitea] deleteTag: Not authenticated, authenticating...`);
            await this.authenticate();
        }
        try {
            // Get manifest digest for the tag
            this.logger.debug(`[Gitea] deleteTag: Fetching manifest for tag ${tag}`);
            const manifest = await this.getManifest(packageName, tag);
            this.logger.debug(`[Gitea] deleteTag: Manifest digest: ${manifest.digest}`);
            // Try to delete via Gitea Package API first
            // In Gitea, each tag is a separate package version, so we need to find the version by tag name
            try {
                this.logger.debug(`[Gitea] deleteTag: Attempting deletion via Gitea Package API`);
                const packageVersions = await this.getPackageVersions(packageName);
                this.logger.debug(`[Gitea] deleteTag: Found ${packageVersions.length} package versions`);
                const version = packageVersions.find(v => {
                    // Try to match by tag name - we need to get the tag for this version
                    // Since we stored digest in getPackageVersions, we can match by digest
                    return v.digest === manifest.digest;
                });
                if (version) {
                    this.logger.debug(`[Gitea] deleteTag: Found version ${version.id} matching manifest digest ${manifest.digest}`);
                    // Find the version by tag name by checking all versions
                    const packageNameOnly = this.extractPackageName(packageName);
                    const packageUrl = `${this.giteaApiUrl}/packages/${this.owner}/${packageNameOnly}?type=container`;
                    this.logger.debug(`[Gitea] deleteTag: Fetching package details from ${packageUrl}`);
                    const packageResponse = await this.httpClient.get(packageUrl, this.getAuthHeaders());
                    this.logger.debug(`[Gitea] deleteTag: Package response status ${packageResponse.status}, versions: ${packageResponse.data?.versions?.length || 0}`);
                    if (packageResponse.data?.versions) {
                        // Find version by tag name (version.version contains the tag name)
                        const versionByTag = packageResponse.data.versions.find(v => v.version === tag);
                        if (versionByTag) {
                            const url = `${this.giteaApiUrl}/packages/${this.owner}/${packageNameOnly}/versions/${versionByTag.id}`;
                            this.logger.debug(`[Gitea] deleteTag: Deleting version ${versionByTag.id} via Package API: ${url}`);
                            await this.httpClient.delete(url, this.getAuthHeaders());
                            this.logger.info(`Deleted tag ${tag} (version ${versionByTag.id}) from package ${packageName}`);
                            this.logger.debug(`[Gitea] deleteTag: Successfully deleted via Package API`);
                            return;
                        }
                        else {
                            this.logger.debug(`[Gitea] deleteTag: Version with tag name ${tag} not found in package versions`);
                        }
                    }
                    else {
                        this.logger.debug(`[Gitea] deleteTag: Package response has no versions array`);
                    }
                }
                else {
                    this.logger.debug(`[Gitea] deleteTag: No version found matching manifest digest ${manifest.digest}`);
                }
            }
            catch (error) {
                const errorMsg = error instanceof Error ? error.message : 'Unknown error';
                const statusCode = error instanceof Error && 'statusCode' in error ? error.statusCode : 'unknown';
                this.logger.debug(`[Gitea] deleteTag: Package API deletion failed - Status: ${statusCode}, Message: ${errorMsg}`);
                this.logger.debug(`[Gitea] deleteTag: Falling back to OCI Registry API (with safety check)`);
            }
            // Fallback: delete via OCI Registry V2 API
            // WARNING: This will delete the entire manifest and ALL tags pointing to it
            // Only use this fallback if we're sure there are no other tags we want to keep
            // Check if there are other tags pointing to this manifest
            try {
                this.logger.debug(`[Gitea] deleteTag: Checking for other tags pointing to manifest ${manifest.digest}`);
                const allTags = await this.listTags(packageName);
                const tagsForThisManifest = allTags.filter(t => t.digest === manifest.digest);
                this.logger.debug(`[Gitea] deleteTag: Found ${tagsForThisManifest.length} tags pointing to manifest ${manifest.digest}: ${tagsForThisManifest.map(t => t.name).join(', ')}`);
                if (tagsForThisManifest.length > 1) {
                    // There are other tags pointing to this manifest
                    // Deleting via OCI Registry API would delete all tags, which we don't want
                    const errorMsg = `Cannot delete tag ${tag} via OCI Registry API: Manifest ${manifest.digest} has ${tagsForThisManifest.length} tags. ` +
                        `Deleting the manifest would delete all tags. Gitea Package API deletion failed, and OCI Registry API fallback is not safe.`;
                    this.logger.debug(`[Gitea] deleteTag: ${errorMsg}`);
                    throw new Error(errorMsg);
                }
                // Only one tag points to this manifest, safe to delete via OCI Registry API
                this.logger.debug(`[Gitea] deleteTag: Only one tag points to manifest, safe to delete via OCI Registry API`);
                await this.deleteManifest(packageName, manifest.digest);
                this.logger.info(`Deleted tag ${tag} via OCI Registry API from package ${packageName}`);
                this.logger.debug(`[Gitea] deleteTag: Successfully deleted via OCI Registry API`);
            }
            catch (deleteError) {
                // If manifest is already deleted (Resource not found), the tag is effectively deleted
                const errorMsg = deleteError instanceof Error ? deleteError.message : 'Unknown error';
                const statusCode = deleteError instanceof Error && 'statusCode' in deleteError ? deleteError.statusCode : 'unknown';
                this.logger.debug(`[Gitea] deleteTag: OCI Registry API deletion error - Status: ${statusCode}, Message: ${errorMsg}`);
                if (errorMsg.includes('Resource not found') || errorMsg.includes('404') || errorMsg.includes('Not Found')) {
                    this.logger.info(`Tag ${tag} already deleted (manifest not found)`);
                    this.logger.debug(`[Gitea] deleteTag: Tag already deleted, returning successfully`);
                    return;
                }
                throw deleteError;
            }
        }
        catch (error) {
            const errorMsg = error instanceof Error ? error.message : 'Unknown error';
            const statusCode = error instanceof Error && 'statusCode' in error ? error.statusCode : 'unknown';
            this.logger.debug(`[Gitea] deleteTag: Overall error - Status: ${statusCode}, Message: ${errorMsg}`);
            // If the error is "Resource not found", the tag/manifest is already deleted
            if (errorMsg.includes('Resource not found') || errorMsg.includes('404') || errorMsg.includes('Not Found')) {
                this.logger.info(`Tag ${tag} already deleted`);
                this.logger.debug(`[Gitea] deleteTag: Tag already deleted, returning successfully`);
                return;
            }
            this.logger.error(`[Gitea] deleteTag: Failed to delete tag ${tag}: ${errorMsg}`);
            throw new Error(`Failed to delete tag ${tag}: ${errorMsg}`);
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
        if (!response.data) {
            throw new Error('Invalid manifest response');
        }
        // Parse JSON string to object
        let manifestData;
        if (typeof response.data === 'string') {
            try {
                manifestData = JSON.parse(response.data);
            }
            catch (error) {
                throw new Error(`Failed to parse manifest JSON: ${error instanceof Error ? error.message : 'Unknown error'}`);
            }
        }
        else {
            manifestData = response.data;
        }
        const ociManifest = this.parseOCIManifest(manifestData);
        const digest = response.headers?.['docker-content-digest'] || reference;
        return this.convertToManifest(digest, ociManifest);
    }
    async deleteManifest(packageName, digest) {
        if (!this.authenticated) {
            await this.authenticate();
        }
        const url = this.getManifestUrl(packageName, digest);
        try {
            await this.httpClient.delete(url, this.getRegistryAuthHeaders());
            this.logger.info(`Deleted manifest ${digest} from package ${packageName}`);
        }
        catch (error) {
            const errorMsg = error instanceof Error ? error.message : 'Unknown error';
            // If manifest is already deleted (Resource not found), that's okay
            if (errorMsg.includes('Resource not found') || errorMsg.includes('404') || errorMsg.includes('Not Found')) {
                this.logger.debug(`Manifest ${digest} already deleted`);
                return;
            }
            throw error;
        }
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