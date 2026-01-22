"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.BaseProvider = void 0;
/**
 * Base provider class with common OCI Registry V2 API utilities
 */
class BaseProvider {
    logger;
    config;
    httpClient;
    registryUrl;
    authenticated = false;
    constructor(logger, config, httpClient) {
        this.logger = logger;
        this.config = config;
        this.httpClient = httpClient;
        this.registryUrl = this.normalizeRegistryUrl(config.registryUrl || '');
    }
    /**
     * Normalize registry URL
     */
    normalizeRegistryUrl(url) {
        // Ensure URL has protocol
        if (!url.startsWith('http://') && !url.startsWith('https://')) {
            url = `https://${url}`;
        }
        // Remove trailing slash
        return url.replace(/\/$/, '');
    }
    /**
     * Get OCI Registry V2 API base URL
     */
    getRegistryApiUrl() {
        return `${this.registryUrl}/v2`;
    }
    /**
     * Get manifest URL
     */
    getManifestUrl(packageName, reference) {
        return `${this.getRegistryApiUrl()}/${packageName}/manifests/${reference}`;
    }
    /**
     * Get tags URL
     */
    getTagsUrl(packageName) {
        return `${this.getRegistryApiUrl()}/${packageName}/tags/list`;
    }
    /**
     * Get referrers URL (OCI referrers API)
     */
    getReferrersUrl(packageName, digest) {
        return `${this.getRegistryApiUrl()}/${packageName}/referrers/${digest}`;
    }
    /**
     * Get blob URL
     */
    getBlobUrl(packageName, digest) {
        return `${this.getRegistryApiUrl()}/${packageName}/blobs/${digest}`;
    }
    /**
     * Parse OCI manifest
     */
    parseOCIManifest(data) {
        if (typeof data !== 'object' || data === null) {
            throw new Error('Invalid manifest: not an object');
        }
        const manifest = data;
        if (!manifest.mediaType) {
            throw new Error('Invalid manifest: missing mediaType');
        }
        const mediaType = String(manifest.mediaType);
        // Check if it's an index (multi-arch)
        if (mediaType === 'application/vnd.oci.image.index.v1+json' ||
            mediaType === 'application/vnd.docker.distribution.manifest.list.v2+json') {
            return manifest;
        }
        // Regular manifest
        return manifest;
    }
    /**
     * Check if manifest is multi-arch (index)
     */
    isMultiArchManifest(manifest) {
        return (manifest.mediaType === 'application/vnd.oci.image.index.v1+json' ||
            manifest.mediaType === 'application/vnd.docker.distribution.manifest.list.v2+json');
    }
    /**
     * Convert OCI manifest to internal Manifest format
     */
    convertToManifest(digest, ociManifest, createdAt) {
        if (this.isMultiArchManifest(ociManifest)) {
            return {
                digest,
                mediaType: ociManifest.mediaType,
                size: JSON.stringify(ociManifest).length,
                manifests: ociManifest.manifests.map(m => ({
                    digest: m.digest,
                    mediaType: m.mediaType,
                    size: m.size,
                    platform: m.platform,
                })),
                annotations: ociManifest.annotations,
                createdAt,
            };
        }
        return {
            digest,
            mediaType: ociManifest.mediaType,
            size: ociManifest.config?.size ?? JSON.stringify(ociManifest).length,
            config: ociManifest.config
                ? {
                    digest: ociManifest.config.digest,
                    mediaType: ociManifest.config.mediaType,
                    size: ociManifest.config.size,
                }
                : undefined,
            layers: ociManifest.layers?.map(l => ({
                digest: l.digest,
                mediaType: l.mediaType,
                size: l.size,
            })),
            annotations: ociManifest.annotations,
            createdAt,
        };
    }
}
exports.BaseProvider = BaseProvider;
//# sourceMappingURL=base.js.map