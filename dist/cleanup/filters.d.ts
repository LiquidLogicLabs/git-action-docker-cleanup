import { Image, CleanupConfig } from '../types';
/**
 * Filter images based on cleanup configuration
 */
export declare class ImageFilter {
    private readonly config;
    constructor(config: CleanupConfig);
    /**
     * Apply all filters to images
     */
    filterImages(images: Image[], allImages: Image[]): Image[];
    /**
     * Remove child images from multi-arch images
     */
    private removeChildImages;
    /**
     * Filter images by exclude-tags
     */
    private filterExcludeTags;
    /**
     * Filter images older than specified time
     */
    private filterOlderThan;
    /**
     * Filter images by delete-tags
     */
    private filterDeleteTags;
    /**
     * Filter ghost images
     */
    private filterGhostImages;
    /**
     * Filter partial multi-arch images
     */
    private filterPartialImages;
    /**
     * Filter orphaned images
     */
    private filterOrphanedImages;
    /**
     * Apply keep-n-tagged filter
     */
    keepNTagged(images: Image[]): Image[];
    /**
     * Apply keep-n-untagged filter or delete-untagged
     */
    filterUntagged(images: Image[]): Image[];
}
//# sourceMappingURL=filters.d.ts.map