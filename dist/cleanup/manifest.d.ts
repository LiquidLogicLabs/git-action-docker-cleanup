import { Manifest, Image, OCIManifest, OCIIndex } from '../types';
/**
 * Check if manifest is multi-architecture
 */
export declare function isMultiArchManifest(manifest: Manifest): boolean;
/**
 * Get child image digests from multi-arch manifest
 */
export declare function getChildImageDigests(manifest: Manifest): string[];
/**
 * Build image dependency graph
 */
export declare function buildImageGraph(images: Image[]): Map<string, Image[]>;
/**
 * Find parent images (images that reference this image as a child)
 */
export declare function findParentImages(image: Image, allImages: Image[]): Image[];
/**
 * Check if image has referrers
 */
export declare function hasReferrers(image: Image): boolean;
/**
 * Get referrer digests
 */
export declare function getReferrerDigests(image: Image): string[];
/**
 * Check if image is a referrer (attestation, cosign, etc.)
 */
export declare function isReferrerImage(image: Image, allImages: Image[]): boolean;
/**
 * Check if multi-arch image is partial (missing some child images)
 */
export declare function isPartialMultiArchImage(image: Image): boolean;
/**
 * Check if image is orphaned (no tags, not a child of multi-arch, not a referrer)
 */
export declare function isOrphanedImage(image: Image, allImages: Image[]): boolean;
/**
 * Check if image is a ghost image (referenced but doesn't exist)
 */
export declare function isGhostImage(image: Image, allImages: Image[]): boolean;
/**
 * Parse OCI manifest JSON
 */
export declare function parseOCIManifest(json: string): OCIManifest | OCIIndex;
/**
 * Calculate manifest digest (SHA256)
 */
export declare function calculateDigest(content: string): string;
//# sourceMappingURL=manifest.d.ts.map