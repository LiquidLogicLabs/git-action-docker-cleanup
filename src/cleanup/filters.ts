import { Image, CleanupConfig } from '../types';
import { parseOlderThan, expandPackages } from '../utils/validation';
import {
  isMultiArchManifest,
  isPartialMultiArchImage,
  isOrphanedImage,
  isGhostImage,
  isReferrerImage,
} from './manifest';

/**
 * Filter images based on cleanup configuration
 */
export class ImageFilter {
  private readonly config: CleanupConfig;

  constructor(config: CleanupConfig) {
    this.config = config;
  }

  /**
   * Apply all filters to images
   */
  filterImages(images: Image[], allImages: Image[]): Image[] {
    let filtered = [...images];

    // Remove child images from multi-arch images
    filtered = this.removeChildImages(filtered, allImages);

    // Apply exclude-tags filter
    if (this.config.excludeTags && this.config.excludeTags.length > 0) {
      filtered = this.filterExcludeTags(filtered);
    }

    // Apply older-than filter
    if (this.config.olderThan) {
      filtered = this.filterOlderThan(filtered);
    }

    // Apply delete-tags filter
    if (this.config.deleteTags && this.config.deleteTags.length > 0) {
      filtered = this.filterDeleteTags(filtered);
    }

    // Apply ghost/partial/orphaned filters
    if (this.config.deleteGhostImages) {
      filtered = this.filterGhostImages(filtered, allImages);
    }

    if (this.config.deletePartialImages) {
      filtered = this.filterPartialImages(filtered);
    }

    if (this.config.deleteOrphanedImages) {
      filtered = this.filterOrphanedImages(filtered, allImages);
    }

    return filtered;
  }

  /**
   * Remove child images from multi-arch images
   */
  private removeChildImages(images: Image[], allImages: Image[]): Image[] {
    const childDigests = new Set<string>();

    // Collect all child digests from multi-arch images
    for (const image of images) {
      if (isMultiArchManifest(image.manifest)) {
        const childImages = image.childImages || [];
        for (const child of childImages) {
          childDigests.add(child.manifest.digest);
        }
      }
    }

    // Remove child images from the list
    return images.filter(image => !childDigests.has(image.manifest.digest));
  }

  /**
   * Filter images by exclude-tags
   */
  private filterExcludeTags(images: Image[]): Image[] {
    const excludePatterns = this.config.excludeTags || [];
    
    return images.filter(image => {
      for (const tag of image.tags) {
        for (const pattern of excludePatterns) {
          // Simple wildcard matching
          const regex = new RegExp('^' + pattern.replace(/\*/g, '.*').replace(/\?/g, '.') + '$');
          if (regex.test(tag.name)) {
            return false; // Exclude this image
          }
        }
      }
      return true; // Keep this image
    });
  }

  /**
   * Filter images older than specified time
   */
  private filterOlderThan(images: Image[]): Image[] {
    if (!this.config.olderThan) {
      return images;
    }

    const cutoffDate = parseOlderThan(this.config.olderThan);

    return images.filter(image => {
      const imageDate = image.createdAt || image.updatedAt;
      if (!imageDate) {
        return false; // No date, exclude
      }
      return imageDate < cutoffDate;
    });
  }

  /**
   * Filter images by delete-tags
   */
  private filterDeleteTags(images: Image[]): Image[] {
    const deletePatterns = this.config.deleteTags || [];
    const matchingImages: Image[] = [];

    for (const image of images) {
      for (const tag of image.tags) {
        for (const pattern of deletePatterns) {
          // Simple wildcard matching
          const regex = new RegExp('^' + pattern.replace(/\*/g, '.*').replace(/\?/g, '.') + '$');
          if (regex.test(tag.name)) {
            matchingImages.push(image);
            break; // Found a match, no need to check other tags
          }
        }
      }
    }

    return matchingImages;
  }

  /**
   * Filter ghost images
   */
  private filterGhostImages(images: Image[], allImages: Image[]): Image[] {
    return images.filter(image => isGhostImage(image, allImages));
  }

  /**
   * Filter partial multi-arch images
   */
  private filterPartialImages(images: Image[]): Image[] {
    return images.filter(image => isPartialMultiArchImage(image));
  }

  /**
   * Filter orphaned images
   */
  private filterOrphanedImages(images: Image[], allImages: Image[]): Image[] {
    return images.filter(image => isOrphanedImage(image, allImages));
  }

  /**
   * Apply keep-n-tagged filter
   */
  keepNTagged(images: Image[]): Image[] {
    if (this.config.keepNTagged === undefined) {
      return images;
    }

    // Sort by date (newest first)
    const sorted = images
      .filter(img => img.tags.length > 0)
      .sort((a, b) => {
        const dateA = a.updatedAt || a.createdAt || new Date(0);
        const dateB = b.updatedAt || b.createdAt || new Date(0);
        return dateB.getTime() - dateA.getTime();
      });

    // Keep N latest
    const toKeep = sorted.slice(0, this.config.keepNTagged);
    const toDelete = sorted.slice(this.config.keepNTagged);

    return toDelete;
  }

  /**
   * Apply keep-n-untagged filter or delete-untagged
   */
  filterUntagged(images: Image[]): Image[] {
    const untagged = images.filter(img => img.tags.length === 0);

    if (this.config.deleteUntagged) {
      return untagged;
    }

    if (this.config.keepNUntagged !== undefined) {
      // Sort by date (newest first)
      const sorted = untagged.sort((a, b) => {
        const dateA = a.updatedAt || a.createdAt || new Date(0);
        const dateB = b.updatedAt || b.createdAt || new Date(0);
        return dateB.getTime() - dateA.getTime();
      });

      // Keep N latest, delete the rest
      return sorted.slice(this.config.keepNUntagged);
    }

    return [];
  }
}
