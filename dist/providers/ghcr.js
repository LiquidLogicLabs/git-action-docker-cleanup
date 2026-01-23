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
        // Set default registry URL for GHCR if not provided
        const ghcrConfig = {
            ...config,
            registryUrl: config.registryUrl || 'ghcr.io',
        };
        super(logger, ghcrConfig, httpClient);
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
        this.logger.debug(`[GHCR] authenticate: Starting authentication with GitHub API at ${this.githubApiUrl}`);
        try {
            // Test authentication by calling GitHub API
            const url = `${this.githubApiUrl}/user`;
            this.logger.debug(`[GHCR] authenticate: Calling ${url}`);
            const response = await this.httpClient.get(url, this.getAuthHeaders());
            this.logger.debug(`[GHCR] authenticate: Response status ${response.status}`);
            if (response.status === 200) {
                this.authenticated = true;
                this.logger.debug('[GHCR] authenticate: Successfully authenticated with GitHub');
            }
            else {
                this.logger.debug(`[GHCR] authenticate: Authentication failed with status ${response.status}`);
                throw new types_1.AuthenticationError('Failed to authenticate with GitHub', 'ghcr');
            }
        }
        catch (error) {
            const errorMsg = error instanceof Error ? error.message : 'Unknown error';
            const statusCode = error instanceof Error && 'statusCode' in error ? error.statusCode : 'unknown';
            this.logger.debug(`[GHCR] authenticate: Error - Status: ${statusCode}, Message: ${errorMsg}`);
            if (error instanceof types_1.AuthenticationError) {
                throw error;
            }
            throw new types_1.AuthenticationError(`Authentication failed: ${errorMsg}`, 'ghcr');
        }
    }
    async listPackages() {
        this.logger.debug(`[GHCR] listPackages: Starting package discovery for owner ${this.owner}`);
        if (!this.authenticated) {
            this.logger.debug(`[GHCR] listPackages: Not authenticated, authenticating...`);
            await this.authenticate();
        }
        const packages = [];
        let page = 1;
        const perPage = 100;
        while (true) {
            const url = `${this.githubApiUrl}/users/${this.owner}/packages?package_type=container&page=${page}&per_page=${perPage}`;
            this.logger.debug(`[GHCR] listPackages: Fetching page ${page} from ${url}`);
            try {
                const response = await this.httpClient.get(url, this.getAuthHeaders());
                this.logger.debug(`[GHCR] listPackages: Response status ${response.status}, received ${response.data?.length || 0} packages`);
                if (!response.data || response.data.length === 0) {
                    this.logger.debug(`[GHCR] listPackages: No more packages, stopping pagination`);
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
                    this.logger.debug(`[GHCR] listPackages: Found package ${pkg.name} (id: ${pkg.id})`);
                }
                if (response.data.length < perPage) {
                    this.logger.debug(`[GHCR] listPackages: Last page reached (${response.data.length} < ${perPage})`);
                    break;
                }
                page++;
            }
            catch (error) {
                const errorMsg = error instanceof Error ? error.message : 'Unknown error';
                const statusCode = error instanceof Error && 'statusCode' in error ? error.statusCode : 'unknown';
                this.logger.debug(`[GHCR] listPackages: Error on page ${page} - Status: ${statusCode}, Message: ${errorMsg}`);
                if (error instanceof types_1.NotFoundError) {
                    this.logger.debug(`[GHCR] listPackages: Not found error, stopping pagination`);
                    break;
                }
                throw error;
            }
        }
        this.logger.debug(`[GHCR] listPackages: Completed, found ${packages.length} total packages`);
        return packages;
    }
    async getPackageManifests(packageName) {
        this.logger.debug(`[GHCR] getPackageManifests: Starting for package ${packageName}`);
        if (!this.authenticated) {
            this.logger.debug(`[GHCR] getPackageManifests: Not authenticated, authenticating...`);
            await this.authenticate();
        }
        // For GHCR, we work with package versions directly via GitHub Package API
        // We don't need to fetch actual manifests - we can create minimal manifest objects from version data
        const manifests = [];
        try {
            const packageVersions = await this.getPackageVersions(packageName);
            this.logger.debug(`[GHCR] getPackageManifests: Found ${packageVersions.length} package versions`);
            for (const version of packageVersions) {
                // Create a minimal manifest from version data
                // The digest is the tag name (which we use as reference)
                if (version.tags.length > 0) {
                    const tagName = version.tags[0]; // Use first tag as reference
                    manifests.push({
                        digest: tagName,
                        mediaType: 'application/vnd.docker.distribution.manifest.v2+json',
                        size: 0, // Size not available from GitHub Package API
                        createdAt: new Date(version.created_at),
                        updatedAt: new Date(version.created_at),
                    });
                    this.logger.debug(`[GHCR] getPackageManifests: Created manifest for version ${version.id} (tag: ${tagName})`);
                }
                else {
                    this.logger.debug(`[GHCR] getPackageManifests: Version ${version.id} has no tags, skipping`);
                }
            }
        }
        catch (error) {
            const errorMsg = error instanceof Error ? error.message : 'Unknown error';
            this.logger.debug(`[GHCR] getPackageManifests: Failed to get package versions: ${errorMsg}`);
        }
        this.logger.debug(`[GHCR] getPackageManifests: Completed, returning ${manifests.length} manifests`);
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
        this.logger.debug(`[GHCR] getPackageVersions: Starting for package ${packageName}`);
        // Extract just the package name (without owner prefix) for GitHub API
        const packageNameOnly = this.extractPackageName(packageName);
        this.logger.debug(`[GHCR] getPackageVersions: Extracted package name: ${packageNameOnly} (from ${packageName})`);
        // Try user endpoint first
        let url = `${this.githubApiUrl}/users/${this.owner}/packages/container/${packageNameOnly}/versions`;
        this.logger.debug(`[GHCR] getPackageVersions: Attempting user endpoint: ${url}`);
        let response;
        try {
            response = await this.httpClient.get(url, this.getAuthHeaders());
            this.logger.debug(`[GHCR] getPackageVersions: User endpoint response status ${response.status}, versions: ${response.data?.length || 0}`);
        }
        catch (error) {
            const errorMsg = error instanceof Error ? error.message : 'Unknown error';
            const statusCode = error instanceof Error && 'statusCode' in error ? error.statusCode : 'unknown';
            this.logger.debug(`[GHCR] getPackageVersions: User endpoint failed - Status: ${statusCode}, Message: ${errorMsg}`);
            // If user endpoint fails with 404, try org endpoint
            if (error instanceof Error && (error.message.includes('404') || error.message.includes('Not Found'))) {
                url = `${this.githubApiUrl}/orgs/${this.owner}/packages/container/${packageNameOnly}/versions`;
                this.logger.debug(`[GHCR] getPackageVersions: Trying org endpoint: ${url}`);
                try {
                    response = await this.httpClient.get(url, this.getAuthHeaders());
                    this.logger.debug(`[GHCR] getPackageVersions: Org endpoint response status ${response.status}, versions: ${response.data?.length || 0}`);
                }
                catch (orgError) {
                    const orgErrorMsg = orgError instanceof Error ? orgError.message : 'Unknown error';
                    const orgStatusCode = orgError instanceof Error && 'statusCode' in orgError ? orgError.statusCode : 'unknown';
                    this.logger.debug(`[GHCR] getPackageVersions: Org endpoint also failed - Status: ${orgStatusCode}, Message: ${orgErrorMsg}`);
                    // If both fail, rethrow the original error
                    throw error;
                }
            }
            else {
                throw error;
            }
        }
        if (!response.data) {
            this.logger.debug(`[GHCR] getPackageVersions: No data in response, returning empty array`);
            return [];
        }
        // Return versions with their tags - we don't need digests when working with GitHub Package API
        const versions = response.data.map(version => ({
            id: version.id,
            tags: version.metadata?.container?.tags || [],
            created_at: version.created_at,
        }));
        this.logger.debug(`[GHCR] getPackageVersions: Returning ${versions.length} versions with tags`);
        return versions;
    }
    async listTags(packageName) {
        this.logger.debug(`[GHCR] listTags: Starting for package ${packageName}`);
        if (!this.authenticated) {
            this.logger.debug(`[GHCR] listTags: Not authenticated, authenticating...`);
            await this.authenticate();
        }
        // Use GitHub Package API to get tags - no need for OCI Registry V2 API
        const packageNameOnly = this.extractPackageName(packageName);
        this.logger.debug(`[GHCR] listTags: Extracted package name: ${packageNameOnly}`);
        let url = `${this.githubApiUrl}/users/${this.owner}/packages/container/${packageNameOnly}/versions`;
        this.logger.debug(`[GHCR] listTags: Attempting user endpoint: ${url}`);
        let response;
        try {
            response = await this.httpClient.get(url, this.getAuthHeaders());
            this.logger.debug(`[GHCR] listTags: User endpoint response status ${response.status}, versions: ${response.data?.length || 0}`);
        }
        catch (error) {
            const errorMsg = error instanceof Error ? error.message : 'Unknown error';
            const statusCode = error instanceof Error && 'statusCode' in error ? error.statusCode : 'unknown';
            this.logger.debug(`[GHCR] listTags: User endpoint failed - Status: ${statusCode}, Message: ${errorMsg}`);
            // If user endpoint fails, try org endpoint
            if (error instanceof Error && (error.message.includes('404') || error.message.includes('Not Found'))) {
                url = `${this.githubApiUrl}/orgs/${this.owner}/packages/container/${packageNameOnly}/versions`;
                this.logger.debug(`[GHCR] listTags: Trying org endpoint: ${url}`);
                try {
                    response = await this.httpClient.get(url, this.getAuthHeaders());
                    this.logger.debug(`[GHCR] listTags: Org endpoint response status ${response.status}, versions: ${response.data?.length || 0}`);
                }
                catch (orgError) {
                    const orgErrorMsg = orgError instanceof Error ? orgError.message : 'Unknown error';
                    this.logger.debug(`[GHCR] listTags: Org endpoint also failed - Status: ${statusCode}, Message: ${orgErrorMsg}`);
                    this.logger.warning(`Failed to get package versions: ${errorMsg}`);
                    return [];
                }
            }
            else {
                this.logger.warning(`Failed to get package versions: ${errorMsg}`);
                return [];
            }
        }
        if (!response.data) {
            this.logger.debug(`[GHCR] listTags: No data in response, returning empty array`);
            return [];
        }
        const tags = [];
        const tagMap = new Map();
        // Collect all tags from all versions
        // For GHCR, we use the tag name as the digest reference since we work with GitHub Package API
        // Also track which version each tag belongs to
        for (const version of response.data) {
            if (version.metadata?.container?.tags) {
                for (const tagName of version.metadata.container.tags) {
                    // Store tag with version ID - if multiple versions share the same tag, keep the first one
                    if (!tagMap.has(tagName)) {
                        tagMap.set(tagName, {
                            tag: {
                                name: tagName,
                                digest: tagName, // Use tag name as reference for GHCR
                                createdAt: new Date(version.created_at),
                                updatedAt: new Date(version.created_at),
                            },
                            versionId: version.id,
                        });
                        this.logger.debug(`[GHCR] listTags: Added tag ${tagName} from version ${version.id}`);
                    }
                    else {
                        this.logger.debug(`[GHCR] listTags: Tag ${tagName} already exists, skipping duplicate`);
                    }
                }
            }
        }
        this.logger.debug(`[GHCR] listTags: Completed, returning ${tagMap.size} unique tags`);
        return Array.from(tagMap.values()).map(item => item.tag);
    }
    async deleteTag(packageName, tag) {
        this.logger.debug(`[GHCR] deleteTag: Starting deletion of tag ${tag} from package ${packageName}`);
        if (!this.authenticated) {
            this.logger.debug(`[GHCR] deleteTag: Not authenticated, authenticating...`);
            await this.authenticate();
        }
        // Find the package version by tag name using GitHub Package API
        this.logger.debug(`[GHCR] deleteTag: Finding package version for tag ${tag}`);
        const packageVersions = await this.getPackageVersions(packageName);
        this.logger.debug(`[GHCR] deleteTag: Found ${packageVersions.length} package versions`);
        const version = packageVersions.find(v => v.tags.includes(tag));
        if (!version) {
            this.logger.debug(`[GHCR] deleteTag: Version not found for tag ${tag}`);
            throw new Error(`Version not found for tag ${tag} in package ${packageName}`);
        }
        this.logger.debug(`[GHCR] deleteTag: Found version ${version.id} with ${version.tags.length} tags: ${version.tags.join(', ')}`);
        // GHCR limitation: When multiple tags point to the same version, deleting a tag deletes the entire version
        // GitHub doesn't allow deleting the last tagged version of a package
        // If this version has multiple tags and it's the only version, we can't delete individual tags
        // Check if there are other versions with tags
        const otherVersionsWithTags = packageVersions.filter(v => v.id !== version.id && v.tags.length > 0);
        this.logger.debug(`[GHCR] deleteTag: Other versions with tags: ${otherVersionsWithTags.length}`);
        if (version.tags.length > 1 && otherVersionsWithTags.length === 0) {
            // This is the only version and it has multiple tags - can't delete individual tags
            const errorMsg = `Cannot delete tag ${tag}: This is the only version and it has multiple tags. GitHub Package API does not support deleting individual tags when all tags point to the same version.`;
            this.logger.debug(`[GHCR] deleteTag: ${errorMsg}`);
            throw new Error(errorMsg);
        }
        const packageNameOnly = this.extractPackageName(packageName);
        let url = `${this.githubApiUrl}/users/${this.owner}/packages/container/${packageNameOnly}/versions/${version.id}`;
        this.logger.debug(`[GHCR] deleteTag: Attempting deletion via user endpoint: ${url}`);
        try {
            const response = await this.httpClient.delete(url, this.getAuthHeaders());
            this.logger.debug(`[GHCR] deleteTag: User endpoint deletion response status ${response.status}`);
            this.logger.info(`Deleted tag ${tag} (version ${version.id}) from package ${packageName}`);
        }
        catch (error) {
            const errorMsg = error instanceof Error ? error.message : 'Unknown error';
            const statusCode = error instanceof Error && 'statusCode' in error ? error.statusCode : 'unknown';
            this.logger.debug(`[GHCR] deleteTag: User endpoint deletion failed - Status: ${statusCode}, Message: ${errorMsg}`);
            // If user endpoint fails, try org endpoint
            if (error instanceof Error && (error.message.includes('404') || error.message.includes('Not Found'))) {
                url = `${this.githubApiUrl}/orgs/${this.owner}/packages/container/${packageNameOnly}/versions/${version.id}`;
                this.logger.debug(`[GHCR] deleteTag: Trying org endpoint: ${url}`);
                try {
                    const orgResponse = await this.httpClient.delete(url, this.getAuthHeaders());
                    this.logger.debug(`[GHCR] deleteTag: Org endpoint deletion response status ${orgResponse.status}`);
                    this.logger.info(`Deleted tag ${tag} (version ${version.id}) from package ${packageName}`);
                }
                catch (orgError) {
                    const orgErrorMsg = orgError instanceof Error ? orgError.message : 'Unknown error';
                    const orgStatusCode = orgError instanceof Error && 'statusCode' in orgError ? orgError.statusCode : 'unknown';
                    this.logger.debug(`[GHCR] deleteTag: Org endpoint deletion failed - Status: ${orgStatusCode}, Message: ${orgErrorMsg}`);
                    // If deletion fails with "last tagged version" error, this is expected for GHCR
                    // when all tags point to the same version and it's the only version
                    if (orgErrorMsg.includes('last tagged version') || orgErrorMsg.includes('cannot delete')) {
                        this.logger.warning(`Cannot delete tag ${tag}: ${orgErrorMsg}. GitHub Package API does not support deleting individual tags when all tags point to the same version.`);
                        throw new Error(`Cannot delete tag ${tag}: ${orgErrorMsg}`);
                    }
                    throw orgError;
                }
            }
            else {
                // If deletion fails with "last tagged version" error, this is expected for GHCR
                if (errorMsg.includes('last tagged version') || errorMsg.includes('cannot delete')) {
                    this.logger.warning(`Cannot delete tag ${tag}: ${errorMsg}. GitHub Package API does not support deleting individual tags when all tags point to the same version.`);
                    throw new Error(`Cannot delete tag ${tag}: ${errorMsg}`);
                }
                throw error;
            }
        }
    }
    async getManifest(packageName, reference) {
        this.logger.debug(`[GHCR] getManifest: Starting for package ${packageName}, reference ${reference}`);
        if (!this.authenticated) {
            this.logger.debug(`[GHCR] getManifest: Not authenticated, authenticating...`);
            await this.authenticate();
        }
        // For GHCR, we work with GitHub Package API - reference is a tag name
        // Get the version information from GitHub Package API
        this.logger.debug(`[GHCR] getManifest: Finding package version for reference ${reference}`);
        const packageVersions = await this.getPackageVersions(packageName);
        const version = packageVersions.find(v => v.tags.includes(reference));
        if (version) {
            this.logger.debug(`[GHCR] getManifest: Found version ${version.id} for reference ${reference}`);
            // Return a minimal manifest based on version data
            const manifest = {
                digest: reference, // Use tag name as digest reference
                mediaType: 'application/vnd.docker.distribution.manifest.v2+json',
                size: 0, // Size not available from GitHub Package API
                createdAt: new Date(version.created_at),
                updatedAt: new Date(version.created_at),
            };
            this.logger.debug(`[GHCR] getManifest: Created minimal manifest with digest ${manifest.digest}`);
            return manifest;
        }
        else {
            this.logger.debug(`[GHCR] getManifest: Version not found for reference ${reference}`);
            throw new Error(`Version not found for reference ${reference} in package ${packageName}`);
        }
    }
    async deleteManifest(packageName, digest) {
        this.logger.debug(`[GHCR] deleteManifest: Starting deletion of manifest ${digest} from package ${packageName}`);
        if (!this.authenticated) {
            this.logger.debug(`[GHCR] deleteManifest: Not authenticated, authenticating...`);
            await this.authenticate();
        }
        // For GHCR, digest is actually a tag name when using GitHub Package API
        // Delete the tag (which deletes the version)
        this.logger.debug(`[GHCR] deleteManifest: Deleting via deleteTag (digest is tag name: ${digest})`);
        await this.deleteTag(packageName, digest);
        this.logger.debug(`[GHCR] deleteManifest: Successfully deleted via deleteTag`);
    }
    async getReferrers(packageName, digest) {
        this.logger.debug(`[GHCR] getReferrers: Starting for package ${packageName}, digest ${digest}`);
        if (!this.supportsFeature('REFERRERS')) {
            this.logger.debug(`[GHCR] getReferrers: REFERRERS feature not supported, returning empty array`);
            return [];
        }
        if (!this.authenticated) {
            this.logger.debug(`[GHCR] getReferrers: Not authenticated, authenticating...`);
            await this.authenticate();
        }
        try {
            const url = this.getReferrersUrl(packageName, digest);
            this.logger.debug(`[GHCR] getReferrers: Fetching referrers from ${url}`);
            const response = await this.httpClient.get(url, this.getRegistryAuthHeaders());
            this.logger.debug(`[GHCR] getReferrers: Response status ${response.status}, referrers: ${response.data?.manifests?.length || 0}`);
            if (!response.data || !response.data.manifests) {
                this.logger.debug(`[GHCR] getReferrers: No referrers in response, returning empty array`);
                return [];
            }
            const referrers = response.data.manifests.map(m => ({
                digest: m.digest,
                artifactType: m.artifactType,
                mediaType: m.mediaType,
                size: m.size,
                annotations: m.annotations,
            }));
            this.logger.debug(`[GHCR] getReferrers: Returning ${referrers.length} referrers`);
            return referrers;
        }
        catch (error) {
            // Referrers API may not be supported, return empty array
            const errorMsg = error instanceof Error ? error.message : 'Unknown error';
            const statusCode = error instanceof Error && 'statusCode' in error ? error.statusCode : 'unknown';
            this.logger.debug(`[GHCR] getReferrers: Referrers API not available - Status: ${statusCode}, Message: ${errorMsg}`);
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