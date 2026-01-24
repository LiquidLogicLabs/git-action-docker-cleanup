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
    ownerApiBase;
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
        // Default owner to current actor if not specified
        // Try GITHUB_REPOSITORY_OWNER first (repository owner), then GITHUB_ACTOR (workflow actor)
        this.owner = config.owner || process.env.GITHUB_REPOSITORY_OWNER || process.env.GITHUB_ACTOR || '';
        this.repository = config.repository || process.env.GITHUB_REPOSITORY?.split('/')[1] || '';
        if (!this.owner) {
            throw new Error('Owner is required for GHCR provider. Either specify the owner input or ensure GITHUB_REPOSITORY_OWNER/GITHUB_ACTOR environment variable is set.');
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
    async getOwnerApiBase() {
        if (this.ownerApiBase) {
            return this.ownerApiBase;
        }
        const url = `${this.githubApiUrl}/users/${this.owner}`;
        this.logger.debug(`[GHCR] getOwnerApiBase: Fetching owner type from ${url}`);
        const response = await this.httpClient.get(url, this.getAuthHeaders());
        this.ownerApiBase = response.data?.type === 'Organization' ? 'orgs' : 'users';
        this.logger.debug(`[GHCR] getOwnerApiBase: Resolved owner type as ${this.ownerApiBase}`);
        return this.ownerApiBase;
    }
    async authenticate() {
        this.logger.debug(`[GHCR] Authenticating with GitHub API`);
        try {
            const url = `${this.githubApiUrl}/user`;
            this.logger.debug(`[GHCR] Testing authentication with ${url}`);
            const response = await this.httpClient.get(url, this.getAuthHeaders());
            if (response.status === 200) {
                this.authenticated = true;
                this.logger.debug(`[GHCR] Authentication successful (status: ${response.status})`);
            }
            else {
                throw new types_1.AuthenticationError('Failed to authenticate with GitHub', 'ghcr');
            }
        }
        catch (error) {
            const errorMsg = error instanceof Error ? error.message : 'Unknown error';
            const statusCode = error instanceof Error && 'statusCode' in error ? error.statusCode : 'unknown';
            this.logger.debug(`[GHCR] Authentication error - Status: ${statusCode}, Message: ${errorMsg}`);
            if (error instanceof types_1.AuthenticationError) {
                throw error;
            }
            throw new types_1.AuthenticationError(`Authentication failed: ${errorMsg}`, 'ghcr');
        }
    }
    async listPackages() {
        this.logger.debug(`[GHCR] Listing all packages for owner: ${this.owner}`);
        if (!this.authenticated) {
            await this.authenticate();
        }
        const packages = [];
        let page = 1;
        const perPage = 100;
        const ownerApiBase = await this.getOwnerApiBase();
        // eslint-disable-next-line no-constant-condition
        while (true) {
            const url = `${this.githubApiUrl}/${ownerApiBase}/${this.owner}/packages?package_type=container&page=${page}&per_page=${perPage}`;
            this.logger.debug(`[GHCR] Fetching packages page ${page}`);
            try {
                const response = await this.httpClient.get(url, this.getAuthHeaders());
                this.logger.debug(`[GHCR] Response: ${response.status}, ${response.data?.length || 0} packages`);
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
                const errorMsg = error instanceof Error ? error.message : 'Unknown error';
                const statusCode = error instanceof Error && 'statusCode' in error ? error.statusCode : 'unknown';
                this.logger.debug(`[GHCR] Error on page ${page} - Status: ${statusCode}, Message: ${errorMsg}`);
                if (error instanceof types_1.NotFoundError) {
                    break;
                }
                throw error;
            }
        }
        this.logger.debug(`[GHCR] Found ${packages.length} total packages`);
        return packages;
    }
    async getPackageManifests(packageName) {
        this.logger.debug(`[GHCR] Getting all manifests for package: ${packageName}`);
        if (!this.authenticated) {
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
        const ownerApiBase = await this.getOwnerApiBase();
        const url = `${this.githubApiUrl}/${ownerApiBase}/${this.owner}/packages/container/${packageNameOnly}/versions`;
        this.logger.debug(`[GHCR] getPackageVersions: Fetching versions from ${url}`);
        let response;
        try {
            response = await this.httpClient.get(url, this.getAuthHeaders());
            this.logger.debug(`[GHCR] getPackageVersions: Response status ${response.status}, versions: ${response.data?.length || 0}`);
        }
        catch (error) {
            const errorMsg = error instanceof Error ? error.message : 'Unknown error';
            const statusCode = error instanceof Error && 'statusCode' in error ? error.statusCode : 'unknown';
            this.logger.debug(`[GHCR] getPackageVersions: Request failed - Status: ${statusCode}, Message: ${errorMsg}`);
            return [];
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
        this.logger.debug(`[GHCR] Listing all tags for package: ${packageName}`);
        if (!this.authenticated) {
            await this.authenticate();
        }
        // Use GitHub Package API to get tags - no need for OCI Registry V2 API
        const packageNameOnly = this.extractPackageName(packageName);
        this.logger.debug(`[GHCR] listTags: Extracted package name: ${packageNameOnly}`);
        const ownerApiBase = await this.getOwnerApiBase();
        const url = `${this.githubApiUrl}/${ownerApiBase}/${this.owner}/packages/container/${packageNameOnly}/versions`;
        this.logger.debug(`[GHCR] listTags: Fetching versions from ${url}`);
        let response;
        try {
            response = await this.httpClient.get(url, this.getAuthHeaders());
            this.logger.debug(`[GHCR] listTags: Response status ${response.status}, versions: ${response.data?.length || 0}`);
        }
        catch (error) {
            const errorMsg = error instanceof Error ? error.message : 'Unknown error';
            const statusCode = error instanceof Error && 'statusCode' in error ? error.statusCode : 'unknown';
            this.logger.debug(`[GHCR] listTags: Request failed - Status: ${statusCode}, Message: ${errorMsg}`);
            this.logger.warning(`Failed to get package versions: ${errorMsg}`);
            return [];
        }
        if (!response.data) {
            this.logger.debug(`[GHCR] listTags: No data in response, returning empty array`);
            return [];
        }
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
    async deleteTag(packageName, tag, _tagsBeingDeleted) {
        this.logger.debug(`[GHCR] Deleting tag: ${tag} from package: ${packageName}`);
        if (!this.authenticated) {
            await this.authenticate();
        }
        const packageVersions = await this.getPackageVersions(packageName);
        this.logger.debug(`[GHCR] Found ${packageVersions.length} package versions`);
        const version = packageVersions.find(v => v.tags.includes(tag));
        if (!version) {
            throw new Error(`Version not found for tag ${tag} in package ${packageName}`);
        }
        this.logger.debug(`[GHCR] Version ${version.id} has ${version.tags.length} tags: ${version.tags.join(', ')}`);
        // GHCR limitation: When multiple tags point to the same version, deleting a tag deletes the entire version
        const otherVersionsWithTags = packageVersions.filter(v => v.id !== version.id && v.tags.length > 0);
        if (version.tags.length > 1 && otherVersionsWithTags.length === 0) {
            const errorMsg = `Cannot delete tag ${tag}: This is the only version and it has multiple tags. GitHub Package API does not support deleting individual tags when all tags point to the same version.`;
            this.logger.debug(`[GHCR] ${errorMsg}`);
            throw new Error(errorMsg);
        }
        const packageNameOnly = this.extractPackageName(packageName);
        const ownerApiBase = await this.getOwnerApiBase();
        const url = `${this.githubApiUrl}/${ownerApiBase}/${this.owner}/packages/container/${packageNameOnly}/versions/${version.id}`;
        this.logger.debug(`[GHCR] Deleting version ${version.id} via ${ownerApiBase} endpoint`);
        try {
            const response = await this.httpClient.delete(url, this.getAuthHeaders());
            this.logger.debug(`[GHCR] Deletion response: ${response.status}`);
            this.logger.info(`Deleted tag ${tag} (version ${version.id}) from package ${packageName}`);
        }
        catch (error) {
            const errorMsg = error instanceof Error ? error.message : 'Unknown error';
            const statusCode = error instanceof Error && 'statusCode' in error ? error.statusCode : 'unknown';
            this.logger.debug(`[GHCR] Deletion failed - Status: ${statusCode}, Message: ${errorMsg}`);
            if (errorMsg.includes('last tagged version') || errorMsg.includes('cannot delete')) {
                this.logger.warning(`Cannot delete tag ${tag}: ${errorMsg}. GitHub Package API does not support deleting individual tags when all tags point to the same version.`);
            }
            throw new Error(`Failed to delete tag ${tag}: ${errorMsg}`);
        }
    }
    async getManifest(packageName, reference) {
        this.logger.debug(`[GHCR] Fetching manifest for package: ${packageName}, reference: ${reference}`);
        if (!this.authenticated) {
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
        this.logger.debug(`[GHCR] Deleting manifest: ${digest} from package: ${packageName}`);
        if (!this.authenticated) {
            await this.authenticate();
        }
        // For GHCR, digest is actually a tag name when using GitHub Package API
        // Delete the tag (which deletes the version)
        this.logger.debug(`[GHCR] deleteManifest: Deleting via deleteTag (digest is tag name: ${digest})`);
        await this.deleteTag(packageName, digest);
        this.logger.debug(`[GHCR] deleteManifest: Successfully deleted via deleteTag`);
    }
    async getReferrers(packageName, digest) {
        this.logger.debug(`[GHCR] Fetching referrers for package: ${packageName}, digest: ${digest}`);
        if (!this.supportsFeature('REFERRERS')) {
            return [];
        }
        if (!this.authenticated) {
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