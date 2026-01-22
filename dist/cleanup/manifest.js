"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isMultiArchManifest = isMultiArchManifest;
exports.getChildImageDigests = getChildImageDigests;
exports.buildImageGraph = buildImageGraph;
exports.findParentImages = findParentImages;
exports.hasReferrers = hasReferrers;
exports.getReferrerDigests = getReferrerDigests;
exports.isReferrerImage = isReferrerImage;
exports.isPartialMultiArchImage = isPartialMultiArchImage;
exports.isOrphanedImage = isOrphanedImage;
exports.isGhostImage = isGhostImage;
exports.parseOCIManifest = parseOCIManifest;
exports.calculateDigest = calculateDigest;
/**
 * Check if manifest is multi-architecture
 */
function isMultiArchManifest(manifest) {
    return manifest.manifests !== undefined && manifest.manifests.length > 0;
}
/**
 * Get child image digests from multi-arch manifest
 */
function getChildImageDigests(manifest) {
    if (!isMultiArchManifest(manifest)) {
        return [];
    }
    return manifest.manifests?.map(m => m.digest) ?? [];
}
/**
 * Build image dependency graph
 */
function buildImageGraph(images) {
    const graph = new Map();
    for (const image of images) {
        const childDigests = getChildImageDigests(image.manifest);
        const childImages = [];
        for (const digest of childDigests) {
            const childImage = images.find(img => img.manifest.digest === digest);
            if (childImage) {
                childImages.push(childImage);
            }
        }
        if (childImages.length > 0) {
            graph.set(image.manifest.digest, childImages);
            image.childImages = childImages;
            image.isMultiArch = true;
        }
        else {
            image.isMultiArch = false;
        }
    }
    return graph;
}
/**
 * Find parent images (images that reference this image as a child)
 */
function findParentImages(image, allImages) {
    const parents = [];
    for (const candidate of allImages) {
        if (isMultiArchManifest(candidate.manifest)) {
            const childDigests = getChildImageDigests(candidate.manifest);
            if (childDigests.includes(image.manifest.digest)) {
                parents.push(candidate);
            }
        }
    }
    return parents;
}
/**
 * Check if image has referrers
 */
function hasReferrers(image) {
    return image.referrers !== undefined && image.referrers.length > 0;
}
/**
 * Get referrer digests
 */
function getReferrerDigests(image) {
    if (!hasReferrers(image)) {
        return [];
    }
    return image.referrers?.map(r => r.digest) ?? [];
}
/**
 * Check if image is a referrer (attestation, cosign, etc.)
 */
function isReferrerImage(image, allImages) {
    for (const candidate of allImages) {
        if (hasReferrers(candidate)) {
            const referrerDigests = getReferrerDigests(candidate);
            if (referrerDigests.includes(image.manifest.digest)) {
                return true;
            }
        }
    }
    return false;
}
/**
 * Check if multi-arch image is partial (missing some child images)
 */
function isPartialMultiArchImage(image) {
    if (!isMultiArchManifest(image.manifest)) {
        return false;
    }
    const expectedChildren = getChildImageDigests(image.manifest);
    const actualChildren = image.childImages?.map(child => child.manifest.digest) ?? [];
    return expectedChildren.length > actualChildren.length;
}
/**
 * Check if image is orphaned (no tags, not a child of multi-arch, not a referrer)
 */
function isOrphanedImage(image, allImages) {
    // Has tags, not orphaned
    if (image.tags.length > 0) {
        return false;
    }
    // Check if it's a child of a multi-arch image
    const parents = findParentImages(image, allImages);
    if (parents.length > 0) {
        return false;
    }
    // Check if it's a referrer
    if (isReferrerImage(image, allImages)) {
        return false;
    }
    return true;
}
/**
 * Check if image is a ghost image (referenced but doesn't exist)
 */
function isGhostImage(image, allImages) {
    // Check if any multi-arch image references this digest but image doesn't exist
    for (const candidate of allImages) {
        if (isMultiArchManifest(candidate.manifest)) {
            const childDigests = getChildImageDigests(candidate.manifest);
            if (childDigests.includes(image.manifest.digest)) {
                // This digest is referenced, check if the actual image exists
                const actualImage = allImages.find(img => img.manifest.digest === image.manifest.digest);
                if (!actualImage) {
                    return true;
                }
            }
        }
    }
    return false;
}
/**
 * Parse OCI manifest JSON
 */
function parseOCIManifest(json) {
    const data = JSON.parse(json);
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
 * Calculate manifest digest (SHA256)
 */
function calculateDigest(content) {
    // In a real implementation, this would use crypto.createHash('sha256')
    // For now, we'll assume the digest is provided by the registry
    // This is a placeholder - actual implementation would hash the content
    return content;
}
//# sourceMappingURL=manifest.js.map