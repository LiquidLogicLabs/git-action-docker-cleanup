import { Manifest, Image, Referrer, OCIManifest, OCIIndex } from '../types';

/**
 * Check if manifest is multi-architecture
 */
export function isMultiArchManifest(manifest: Manifest): boolean {
  return manifest.manifests !== undefined && manifest.manifests.length > 0;
}

/**
 * Get child image digests from multi-arch manifest
 */
export function getChildImageDigests(manifest: Manifest): string[] {
  if (!isMultiArchManifest(manifest)) {
    return [];
  }

  return manifest.manifests?.map(m => m.digest) ?? [];
}

/**
 * Build image dependency graph
 */
export function buildImageGraph(images: Image[]): Map<string, Image[]> {
  const graph = new Map<string, Image[]>();

  for (const image of images) {
    const childDigests = getChildImageDigests(image.manifest);
    const childImages: Image[] = [];

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
    } else {
      image.isMultiArch = false;
    }
  }

  return graph;
}

/**
 * Find parent images (images that reference this image as a child)
 */
export function findParentImages(image: Image, allImages: Image[]): Image[] {
  const parents: Image[] = [];

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
export function hasReferrers(image: Image): boolean {
  return image.referrers !== undefined && image.referrers.length > 0;
}

/**
 * Get referrer digests
 */
export function getReferrerDigests(image: Image): string[] {
  if (!hasReferrers(image)) {
    return [];
  }

  return image.referrers?.map(r => r.digest) ?? [];
}

/**
 * Check if image is a referrer (attestation, cosign, etc.)
 */
export function isReferrerImage(image: Image, allImages: Image[]): boolean {
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
export function isPartialMultiArchImage(image: Image): boolean {
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
export function isOrphanedImage(image: Image, allImages: Image[]): boolean {
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
export function isGhostImage(image: Image, allImages: Image[]): boolean {
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
export function parseOCIManifest(json: string): OCIManifest | OCIIndex {
  const data = JSON.parse(json);

  if (typeof data !== 'object' || data === null) {
    throw new Error('Invalid manifest: not an object');
  }

  const manifest = data as Record<string, unknown>;

  if (!manifest.mediaType) {
    throw new Error('Invalid manifest: missing mediaType');
  }

  const mediaType = String(manifest.mediaType);

  // Check if it's an index (multi-arch)
  if (
    mediaType === 'application/vnd.oci.image.index.v1+json' ||
    mediaType === 'application/vnd.docker.distribution.manifest.list.v2+json'
  ) {
    return manifest as unknown as OCIIndex;
  }

  // Regular manifest
  return manifest as unknown as OCIManifest;
}

/**
 * Calculate manifest digest (SHA256)
 */
export function calculateDigest(content: string): string {
  // In a real implementation, this would use crypto.createHash('sha256')
  // For now, we'll assume the digest is provided by the registry
  // This is a placeholder - actual implementation would hash the content
  return content;
}
