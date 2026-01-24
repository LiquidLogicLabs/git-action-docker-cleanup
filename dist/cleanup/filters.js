"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ImageFilter = void 0;
const validation_1 = require("../utils/validation");
const manifest_1 = require("./manifest");
/**
 * Filter images based on cleanup configuration
 */
class ImageFilter {
    config;
    constructor(config) {
        this.config = config;
    }
    /**
     * Apply all filters to images
     */
    filterImages(images, allImages) {
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
    removeChildImages(images, _allImages) {
        const childDigests = new Set();
        // Collect all child digests from multi-arch images
        for (const image of images) {
            if ((0, manifest_1.isMultiArchManifest)(image.manifest)) {
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
    filterExcludeTags(images) {
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
    filterOlderThan(images) {
        if (!this.config.olderThan) {
            return images;
        }
        const cutoffDate = (0, validation_1.parseOlderThan)(this.config.olderThan);
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
    filterDeleteTags(images) {
        const deletePatterns = this.config.deleteTags || [];
        const matchingImages = [];
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
    filterGhostImages(images, allImages) {
        return images.filter(image => (0, manifest_1.isGhostImage)(image, allImages));
    }
    /**
     * Filter partial multi-arch images
     */
    filterPartialImages(images) {
        return images.filter(image => (0, manifest_1.isPartialMultiArchImage)(image));
    }
    /**
     * Filter orphaned images
     */
    filterOrphanedImages(images, allImages) {
        return images.filter(image => (0, manifest_1.isOrphanedImage)(image, allImages));
    }
    /**
     * Apply keep-n-tagged filter
     */
    keepNTagged(images) {
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
        const toDelete = sorted.slice(this.config.keepNTagged);
        return toDelete;
    }
    /**
     * Apply keep-n-untagged filter or delete-untagged
     */
    filterUntagged(images) {
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
exports.ImageFilter = ImageFilter;
//# sourceMappingURL=filters.js.map