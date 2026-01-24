import { IRegistryProvider, Image, CleanupConfig, CleanupResult, Package, Referrer, Tag } from '../types';
import { Logger } from '../logger';
import { ImageFilter } from './filters';
import { buildImageGraph } from './manifest';
import { expandPackages } from '../utils/validation';

/**
 * Cleanup engine that orchestrates the cleanup process
 */
export class CleanupEngine {
  private readonly provider: IRegistryProvider;
  private readonly config: CleanupConfig;
  private readonly logger: Logger;
  private readonly filter: ImageFilter;
  private allDiscoveredImages: Image[] = [];

  constructor(provider: IRegistryProvider, config: CleanupConfig, logger: Logger) {
    this.provider = provider;
    this.config = config;
    this.logger = logger;
    this.filter = new ImageFilter(config);
  }

  /**
   * Run the cleanup process
   */
  async run(packageNames: string[]): Promise<CleanupResult> {
    const result: CleanupResult = {
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
      buildImageGraph(images);

      // Store all images for checking excluded tags during deletion
      this.allDiscoveredImages = images;

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
      } else {
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
    } catch (error) {
      result.errors.push(error instanceof Error ? error.message : 'Unknown error');
      throw error;
    }
  }

  /**
   * Discovery phase: List packages and get all images
   */
  private async discoverImages(packageNames: string[]): Promise<Image[]> {
    const images: Image[] = [];

    // Get all packages if not specified
    let packages: Package[] = [];
    if (packageNames.length === 0) {
      packages = await this.provider.listPackages();
      packageNames = packages.map(pkg => pkg.name);
    } else {
      // Expand package names with wildcards/regex if enabled
      if (this.config.expandPackages) {
        const allPackages = await this.provider.listPackages();
        const allPackageNames = allPackages.map(pkg => pkg.name);
        packageNames = expandPackages(packageNames, allPackageNames, this.config.useRegex);
      }
    }

    // For each package, get manifests and tags
    for (const packageName of packageNames) {
      try {
        this.logger.debug(`Discovering images for package: ${packageName}`);

        // Get tags
        let tags: Tag[] = [];
        try {
          tags = await this.provider.listTags(packageName);
          this.logger.debug(`Found ${tags.length} tags for ${packageName}`);
        } catch (error) {
          const errorMsg = error instanceof Error ? error.message : 'Unknown error';
          this.logger.warning(`Failed to list tags for package ${packageName}: ${errorMsg}`);
          // Continue to try getPackageManifests even if listTags fails
          tags = [];
        }

        // Get manifests for each tag
        for (const tag of tags) {
          try {
            const manifest = await this.provider.getManifest(packageName, tag.digest);
            
            // Get referrers if supported
            let referrers: Referrer[] = [];
            if (this.provider.supportsFeature('REFERRERS')) {
              try {
                referrers = await this.provider.getReferrers(packageName, manifest.digest);
              } catch (error) {
                this.logger.debug(`Could not get referrers for ${packageName}@${manifest.digest}: ${error instanceof Error ? error.message : 'Unknown error'}`);
              }
            }

            const image: Image = {
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
          } catch (error) {
            this.logger.warning(`Failed to get manifest for ${packageName}@${tag.digest}: ${error instanceof Error ? error.message : 'Unknown error'}`);
          }
        }

        // Also get untagged manifests
        const manifests = await this.provider.getPackageManifests(packageName);
        for (const manifest of manifests) {
          // Check if this manifest is already in images (has tags)
          const existingImage = images.find(img => img.manifest.digest === manifest.digest);
          if (!existingImage) {
            const image: Image = {
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
      } catch (error) {
        this.logger.warning(`Failed to discover images for package ${packageName}: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }

    return images;
  }

  /**
   * Filtering phase: Apply all filters
   */
  private filterImages(images: Image[]): Image[] {
    const imagesToDelete: Image[] = [];

    // Apply general filters
    const filtered = this.filter.filterImages(images, images);

    // Apply keep-n-tagged filter
    const taggedToDelete = this.filter.keepNTagged(filtered);
    imagesToDelete.push(...taggedToDelete);

    // Apply untagged filter
    const untaggedToDelete = this.filter.filterUntagged(filtered);
    imagesToDelete.push(...untaggedToDelete);

    // Remove duplicates by manifest digest, but merge tags from images with the same manifest
    // Also filter out excluded tags from merged images
    const uniqueImages = new Map<string, Image>();
    const excludePatterns = this.config.excludeTags || [];
    
    for (const image of imagesToDelete) {
      const existing = uniqueImages.get(image.manifest.digest);
      if (existing) {
        // Merge tags from this image into the existing one
        const existingTagNames = new Set(existing.tags.map(t => t.name));
        for (const tag of image.tags) {
          if (!existingTagNames.has(tag.name)) {
            existing.tags.push(tag);
          }
        }
      } else {
        uniqueImages.set(image.manifest.digest, image);
      }
    }

    // Filter out excluded tags from merged images
    const finalImages: Image[] = [];
    for (const image of uniqueImages.values()) {
      // Filter out excluded tags
      const tagsToDelete = image.tags.filter(tag => {
        for (const pattern of excludePatterns) {
          const regex = new RegExp('^' + pattern.replace(/\*/g, '.*').replace(/\?/g, '.') + '$');
          if (regex.test(tag.name)) {
            return false; // Exclude this tag
          }
        }
        return true; // Keep this tag for deletion
      });

      // Only include image if there are tags to delete (after excluding)
      if (tagsToDelete.length > 0) {
        // Create a new image with only the tags to delete
        finalImages.push({
          ...image,
          tags: tagsToDelete,
        });
      }
    }

    return finalImages;
  }

  /**
   * Deletion phase: Delete images
   */
  private async deleteImages(images: Image[]): Promise<{ deletedCount: number; deletedTags: string[]; errors: string[] }> {
    const result = {
      deletedCount: 0,
      deletedTags: [] as string[],
      errors: [] as string[],
    };

    // Check if there are excluded tags - if so, we need to check all tags before deleting manifest
    const hasExcludedTags = this.config.excludeTags && this.config.excludeTags.length > 0;

    for (const image of images) {
      try {
        // Check if excluded tags exist for this manifest
        // If excluded tags exist, we should NOT delete the manifest (which would remove all tags)
        // But we can still delete individual tags via Package API (e.g., Gitea, GHCR)
        const hasExcludedTagsForManifest = hasExcludedTags && 
          await this.hasExcludedTagsForManifest(image.package.name, image.manifest.digest);

        let allTagsDeleted = true;
        let shouldSkipTagDeletion = false;
        
        if (hasExcludedTagsForManifest) {
          this.logger.debug(`Manifest ${image.manifest.digest} has excluded tags - will attempt individual tag deletion but prevent manifest deletion`);
        }
        
        const deletedTagNames: string[] = [];
        // Collect all tag names being deleted for this image to pass to deleteTag
        const tagsBeingDeleted = image.tags.map(t => t.name);
        for (const tag of image.tags) {
          try {
            await this.provider.deleteTag(image.package.name, tag.name, tagsBeingDeleted);
            result.deletedTags.push(tag.name);
            deletedTagNames.push(tag.name);
          } catch (error) {
            const errorMsg = `Failed to delete tag ${tag.name}: ${error instanceof Error ? error.message : 'Unknown error'}`;
            this.logger.warning(errorMsg);
            result.errors.push(errorMsg);
            allTagsDeleted = false;
          }
        }
        
        if (deletedTagNames.length > 0) {
          this.logger.info(`Deleted ${deletedTagNames.length} tag(s) from ${image.package.name}: ${deletedTagNames.join(', ')}`);
        }
        
        // After tag deletion, check again if excluded tags still exist
        // (in case the provider deleted the manifest via OCI Registry API fallback)
        if (hasExcludedTagsForManifest) {
          const stillHasExcludedTags = await this.hasExcludedTagsForManifest(image.package.name, image.manifest.digest);
          if (stillHasExcludedTags) {
            this.logger.debug(`Manifest ${image.manifest.digest} still has excluded tags after tag deletion - skipping manifest deletion`);
            shouldSkipTagDeletion = true; // Prevent manifest deletion
          }
        }

        // Only delete manifest if all tags were successfully deleted AND no excluded tags exist
        // If excluded tags exist, we must NOT delete the manifest (which would remove all tags including excluded ones)
        let shouldDeleteManifest = allTagsDeleted && image.tags.length > 0 && !shouldSkipTagDeletion;
        
        if (shouldDeleteManifest && hasExcludedTagsForManifest) {
          // Excluded tags exist for this manifest - do not delete manifest
          this.logger.debug(`Skipping manifest deletion for ${image.manifest.digest} - excluded tags exist`);
          shouldDeleteManifest = false;
        } else if (shouldDeleteManifest && hasExcludedTags) {
          // Double-check that excluded tags don't still exist after tag deletion
          const stillHasExcludedTags = await this.hasExcludedTagsForManifest(image.package.name, image.manifest.digest);
          if (stillHasExcludedTags) {
            shouldDeleteManifest = false;
          }
        }

        if (shouldDeleteManifest) {
          try {
            await this.provider.deleteManifest(image.package.name, image.manifest.digest);
            
            // Delete child images if multi-arch
            if (image.childImages) {
              for (const child of image.childImages) {
                try {
                  await this.provider.deleteManifest(image.package.name, child.manifest.digest);
                } catch (error) {
                  const errorMsg = `Failed to delete child manifest ${child.manifest.digest}: ${error instanceof Error ? error.message : 'Unknown error'}`;
                  this.logger.warning(errorMsg);
                  result.errors.push(errorMsg);
                }
              }
            }

            result.deletedCount++;
            this.logger.debug(`Deleted manifest ${image.manifest.digest} from ${image.package.name}`);
          } catch (error) {
            const errorMsg = `Failed to delete manifest ${image.manifest.digest}: ${error instanceof Error ? error.message : 'Unknown error'}`;
            this.logger.warning(errorMsg);
            result.errors.push(errorMsg);
          }
        } else if (image.tags.length === 0) {
          // Untagged manifest - delete it
          try {
            await this.provider.deleteManifest(image.package.name, image.manifest.digest);
            result.deletedCount++;
            this.logger.debug(`Deleted untagged manifest ${image.manifest.digest} from ${image.package.name}`);
          } catch (error) {
            const errorMsg = `Failed to delete untagged manifest ${image.manifest.digest}: ${error instanceof Error ? error.message : 'Unknown error'}`;
            this.logger.warning(errorMsg);
            result.errors.push(errorMsg);
          }
        } else if (hasExcludedTags) {
          this.logger.debug(`Skipping manifest deletion for ${image.manifest.digest} - excluded tags may still exist`);
        }
      } catch (error) {
        const errorMsg = `Failed to delete image ${image.package.name}: ${error instanceof Error ? error.message : 'Unknown error'}`;
        this.logger.error(errorMsg);
        result.errors.push(errorMsg);
      }
    }

    return result;
  }

  /**
   * Check if excluded tags exist for a manifest
   */
  private async hasExcludedTagsForManifest(packageName: string, digest: string): Promise<boolean> {
    if (!this.config.excludeTags || this.config.excludeTags.length === 0) {
      return false; // No excluded tags configured
    }

    // Check the discovered images to see if any excluded tags exist for this manifest
    const imagesWithSameManifest = this.allDiscoveredImages.filter((img: Image) => 
      img.manifest.digest === digest && img.package.name === packageName
    );
    
    for (const img of imagesWithSameManifest) {
      for (const tag of img.tags) {
        for (const pattern of this.config.excludeTags) {
          const regex = new RegExp('^' + pattern.replace(/\*/g, '.*').replace(/\?/g, '.') + '$');
          if (regex.test(tag.name)) {
            this.logger.debug(`Manifest ${digest} has excluded tag ${tag.name}`);
            return true; // Excluded tag exists
          }
        }
      }
    }

    return false; // No excluded tags found
  }

  /**
   * Check if manifest can be safely deleted (no excluded tags exist)
   */
  private async canDeleteManifest(packageName: string, digest: string): Promise<boolean> {
    if (!this.config.excludeTags || this.config.excludeTags.length === 0) {
      return true; // No excluded tags, safe to delete
    }

    try {
      // First check the discovered images to see if any excluded tags exist for this manifest
      const imagesWithSameManifest = this.allDiscoveredImages.filter(img => 
        img.manifest.digest === digest && img.package.name === packageName
      );
      
      for (const img of imagesWithSameManifest) {
        for (const tag of img.tags) {
          for (const pattern of this.config.excludeTags) {
            const regex = new RegExp('^' + pattern.replace(/\*/g, '.*').replace(/\?/g, '.') + '$');
            if (regex.test(tag.name)) {
              this.logger.debug(`Manifest ${digest} has excluded tag ${tag.name} in discovered images, will not delete manifest`);
              return false; // Excluded tag exists, don't delete manifest
            }
          }
        }
      }

      // Also check current tags in registry (in case tags were added after discovery)
      const tags = await this.provider.listTags(packageName);
      
      // Check if any remaining tags match excluded patterns and point to this manifest
      for (const tag of tags) {
        // Check if tag matches excluded pattern
        for (const pattern of this.config.excludeTags) {
          const regex = new RegExp('^' + pattern.replace(/\*/g, '.*').replace(/\?/g, '.') + '$');
          if (regex.test(tag.name)) {
            // This tag is excluded, check if it points to the same manifest
            try {
              const manifest = await this.provider.getManifest(packageName, tag.digest);
              if (manifest.digest === digest) {
                this.logger.debug(`Manifest ${digest} has excluded tag ${tag.name}, will not delete manifest`);
                return false; // Excluded tag exists, don't delete manifest
              }
            } catch (error) {
              // If we can't get manifest, assume it might be excluded and don't delete
              this.logger.debug(`Could not get manifest for excluded tag ${tag.name}, will not delete manifest`);
              return false;
            }
          }
        }
      }
      
      return true; // No excluded tags found, safe to delete
    } catch (error) {
      // If we can't check tags, err on the side of caution and don't delete
      this.logger.debug(`Could not verify excluded tags for manifest ${digest}: ${error instanceof Error ? error.message : 'Unknown error'}`);
      return false;
    }
  }

  /**
   * Validation phase: Validate multi-arch images
   */
  private async validateImages(images: Image[]): Promise<void> {
    for (const image of images) {
      if (image.isMultiArch && image.childImages) {
        const expectedChildren = image.manifest.manifests?.length || 0;
        const actualChildren = image.childImages.length;

        if (expectedChildren > actualChildren) {
          this.logger.warning(
            `Multi-arch image ${image.package.name}@${image.manifest.digest} is missing ${expectedChildren - actualChildren} child images`
          );
        }
      }
    }
  }
}
