"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CleanupEngine = void 0;
const filters_1 = require("./filters");
const manifest_1 = require("./manifest");
const validation_1 = require("../utils/validation");
/**
 * Cleanup engine that orchestrates the cleanup process
 */
class CleanupEngine {
    provider;
    config;
    logger;
    filter;
    constructor(provider, config, logger) {
        this.provider = provider;
        this.config = config;
        this.logger = logger;
        this.filter = new filters_1.ImageFilter(config);
    }
    /**
     * Run the cleanup process
     */
    async run(packageNames) {
        const result = {
            deletedCount: 0,
            keptCount: 0,
            deletedTags: [],
            keptTags: [],
            errors: [],
        };
        try {
            // Discovery phase
            this.logger.info('Starting discovery phase...');
            const images = await this.discoverImages(packageNames);
            this.logger.info(`Discovered ${images.length} images`);
            // Build dependency graph
            (0, manifest_1.buildImageGraph)(images);
            // Filtering phase
            this.logger.info('Starting filtering phase...');
            const imagesToDelete = this.filterImages(images);
            this.logger.info(`Filtered to ${imagesToDelete.length} images for deletion`);
            // Deletion phase
            if (this.config.dryRun) {
                this.logger.info('DRY RUN: Would delete the following images:');
                for (const image of imagesToDelete) {
                    const tags = image.tags.map(t => t.name).join(', ');
                    this.logger.info(`  - ${image.package.name} (tags: ${tags || 'untagged'})`);
                }
                result.deletedCount = imagesToDelete.length;
                result.deletedTags = imagesToDelete.flatMap(img => img.tags.map(t => t.name));
            }
            else {
                this.logger.info('Starting deletion phase...');
                const deletionResult = await this.deleteImages(imagesToDelete);
                result.deletedCount = deletionResult.deletedCount;
                result.deletedTags = deletionResult.deletedTags;
                result.errors = deletionResult.errors;
            }
            // Calculate kept images
            const keptImages = images.filter(img => !imagesToDelete.includes(img));
            result.keptCount = keptImages.length;
            result.keptTags = keptImages.flatMap(img => img.tags.map(t => t.name));
            // Validation phase
            if (this.config.validate) {
                this.logger.info('Starting validation phase...');
                await this.validateImages(keptImages);
            }
            return result;
        }
        catch (error) {
            result.errors.push(error instanceof Error ? error.message : 'Unknown error');
            throw error;
        }
    }
    /**
     * Discovery phase: List packages and get all images
     */
    async discoverImages(packageNames) {
        const images = [];
        // Get all packages if not specified
        let packages = [];
        if (packageNames.length === 0) {
            packages = await this.provider.listPackages();
            packageNames = packages.map(pkg => pkg.name);
        }
        else {
            // Expand package names with wildcards/regex if enabled
            if (this.config.expandPackages) {
                const allPackages = await this.provider.listPackages();
                const allPackageNames = allPackages.map(pkg => pkg.name);
                packageNames = (0, validation_1.expandPackages)(packageNames, allPackageNames, this.config.useRegex);
            }
        }
        // For each package, get manifests and tags
        for (const packageName of packageNames) {
            try {
                this.logger.debug(`Discovering images for package: ${packageName}`);
                // Get tags
                const tags = await this.provider.listTags(packageName);
                this.logger.debug(`Found ${tags.length} tags for ${packageName}`);
                // Get manifests for each tag
                for (const tag of tags) {
                    try {
                        const manifest = await this.provider.getManifest(packageName, tag.digest);
                        // Get referrers if supported
                        let referrers = [];
                        if (this.provider.supportsFeature('REFERRERS')) {
                            try {
                                referrers = await this.provider.getReferrers(packageName, manifest.digest);
                            }
                            catch (error) {
                                this.logger.debug(`Could not get referrers for ${packageName}@${manifest.digest}: ${error instanceof Error ? error.message : 'Unknown error'}`);
                            }
                        }
                        const image = {
                            package: packages.find(p => p.name === packageName) || {
                                id: packageName,
                                name: packageName,
                                type: 'container',
                            },
                            manifest,
                            tags: [tag],
                            isMultiArch: false,
                            referrers,
                            createdAt: manifest.createdAt,
                            updatedAt: manifest.updatedAt,
                        };
                        images.push(image);
                    }
                    catch (error) {
                        this.logger.warning(`Failed to get manifest for ${packageName}@${tag.digest}: ${error instanceof Error ? error.message : 'Unknown error'}`);
                    }
                }
                // Also get untagged manifests
                const manifests = await this.provider.getPackageManifests(packageName);
                for (const manifest of manifests) {
                    // Check if this manifest is already in images (has tags)
                    const existingImage = images.find(img => img.manifest.digest === manifest.digest);
                    if (!existingImage) {
                        const image = {
                            package: packages.find(p => p.name === packageName) || {
                                id: packageName,
                                name: packageName,
                                type: 'container',
                            },
                            manifest,
                            tags: [],
                            isMultiArch: false,
                            createdAt: manifest.createdAt,
                            updatedAt: manifest.updatedAt,
                        };
                        images.push(image);
                    }
                }
            }
            catch (error) {
                this.logger.warning(`Failed to discover images for package ${packageName}: ${error instanceof Error ? error.message : 'Unknown error'}`);
            }
        }
        return images;
    }
    /**
     * Filtering phase: Apply all filters
     */
    filterImages(images) {
        let imagesToDelete = [];
        // Apply general filters
        const filtered = this.filter.filterImages(images, images);
        // Apply keep-n-tagged filter
        const taggedToDelete = this.filter.keepNTagged(filtered);
        imagesToDelete.push(...taggedToDelete);
        // Apply untagged filter
        const untaggedToDelete = this.filter.filterUntagged(filtered);
        imagesToDelete.push(...untaggedToDelete);
        // Remove duplicates
        const uniqueImages = new Map();
        for (const image of imagesToDelete) {
            uniqueImages.set(image.manifest.digest, image);
        }
        return Array.from(uniqueImages.values());
    }
    /**
     * Deletion phase: Delete images
     */
    async deleteImages(images) {
        const result = {
            deletedCount: 0,
            deletedTags: [],
            errors: [],
        };
        for (const image of images) {
            try {
                // Delete tags first
                for (const tag of image.tags) {
                    try {
                        await this.provider.deleteTag(image.package.name, tag.name);
                        result.deletedTags.push(tag.name);
                        this.logger.info(`Deleted tag ${tag.name} from ${image.package.name}`);
                    }
                    catch (error) {
                        const errorMsg = `Failed to delete tag ${tag.name}: ${error instanceof Error ? error.message : 'Unknown error'}`;
                        this.logger.warning(errorMsg);
                        result.errors.push(errorMsg);
                    }
                }
                // Delete manifest (and child images if multi-arch)
                try {
                    await this.provider.deleteManifest(image.package.name, image.manifest.digest);
                    // Delete child images if multi-arch
                    if (image.childImages) {
                        for (const child of image.childImages) {
                            try {
                                await this.provider.deleteManifest(image.package.name, child.manifest.digest);
                            }
                            catch (error) {
                                const errorMsg = `Failed to delete child manifest ${child.manifest.digest}: ${error instanceof Error ? error.message : 'Unknown error'}`;
                                this.logger.warning(errorMsg);
                                result.errors.push(errorMsg);
                            }
                        }
                    }
                    result.deletedCount++;
                    this.logger.info(`Deleted manifest ${image.manifest.digest} from ${image.package.name}`);
                }
                catch (error) {
                    const errorMsg = `Failed to delete manifest ${image.manifest.digest}: ${error instanceof Error ? error.message : 'Unknown error'}`;
                    this.logger.warning(errorMsg);
                    result.errors.push(errorMsg);
                }
            }
            catch (error) {
                const errorMsg = `Failed to delete image ${image.package.name}: ${error instanceof Error ? error.message : 'Unknown error'}`;
                this.logger.error(errorMsg);
                result.errors.push(errorMsg);
            }
        }
        return result;
    }
    /**
     * Validation phase: Validate multi-arch images
     */
    async validateImages(images) {
        for (const image of images) {
            if (image.isMultiArch && image.childImages) {
                const expectedChildren = image.manifest.manifests?.length || 0;
                const actualChildren = image.childImages.length;
                if (expectedChildren > actualChildren) {
                    this.logger.warning(`Multi-arch image ${image.package.name}@${image.manifest.digest} is missing ${expectedChildren - actualChildren} child images`);
                }
            }
        }
    }
}
exports.CleanupEngine = CleanupEngine;
//# sourceMappingURL=engine.js.map