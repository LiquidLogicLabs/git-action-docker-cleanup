import { ImageFilter } from '../cleanup/filters';
import { Image, CleanupConfig, Package, Manifest, Tag } from '../types';

// Mock manifest functions
jest.mock('../cleanup/manifest', () => ({
  isMultiArchManifest: jest.fn((manifest: Manifest) => 
    manifest.mediaType?.includes('index') || manifest.manifests !== undefined
  ),
  isPartialMultiArchImage: jest.fn((image: Image) => {
    if (!image.isMultiArch || !image.childImages) return false;
    return image.childImages.length < (image.manifest.manifests?.length || 0);
  }),
  isOrphanedImage: jest.fn((image: Image, allImages: Image[]) => {
    if (!image.isMultiArch) return false;
    // Check if parent multi-arch image exists
    return !allImages.some(img => 
      img.isMultiArch && 
      img.childImages?.some(child => child.manifest.digest === image.manifest.digest)
    );
  }),
  isGhostImage: jest.fn((image: Image, allImages: Image[]) => {
    // Ghost image has no tags
    return image.tags.length === 0;
  }),
  isReferrerImage: jest.fn(() => false),
}));

describe('ImageFilter', () => {
  const createImage = (
    packageName: string,
    digest: string,
    tags: string[],
    createdAt?: Date,
    isMultiArch = false
  ): Image => ({
    package: { id: packageName, name: packageName, type: 'container' },
    manifest: {
      digest,
      mediaType: isMultiArch ? 'application/vnd.oci.image.index.v1+json' : 'application/vnd.oci.image.manifest.v1+json',
      size: 1000,
      manifests: isMultiArch ? [{ digest: 'child-digest', mediaType: 'application/vnd.oci.image.manifest.v1+json', size: 500 }] : undefined,
    },
    tags: tags.map(name => ({ name, digest, createdAt: createdAt || new Date() })),
    isMultiArch,
    createdAt: createdAt || new Date(),
    updatedAt: createdAt || new Date(),
  });

  describe('filterExcludeTags', () => {
    it('should exclude images with matching tags', () => {
      const config: CleanupConfig = {
        dryRun: false,
        excludeTags: ['keep-*', 'latest'],
        deleteUntagged: false,
        deleteGhostImages: false,
        deletePartialImages: false,
        deleteOrphanedImages: false,
        validate: false,
        retry: 3,
        throttle: 100,
        verbose: false,
        expandPackages: false,
        useRegex: false,
      };

      const filter = new ImageFilter(config);
      const images = [
        createImage('test/pkg', 'digest1', ['keep-me', 'v1.0']),
        createImage('test/pkg', 'digest2', ['delete-me', 'v2.0']),
        createImage('test/pkg', 'digest3', ['latest']),
      ];

      const filtered = filter.filterImages(images, images);

      expect(filtered).toHaveLength(1);
      expect(filtered[0].manifest.digest).toBe('digest2');
    });

    it('should handle wildcard patterns', () => {
      const config: CleanupConfig = {
        dryRun: false,
        excludeTags: ['prod-*'],
        deleteUntagged: false,
        deleteGhostImages: false,
        deletePartialImages: false,
        deleteOrphanedImages: false,
        validate: false,
        retry: 3,
        throttle: 100,
        verbose: false,
        expandPackages: false,
        useRegex: false,
      };

      const filter = new ImageFilter(config);
      const images = [
        createImage('test/pkg', 'digest1', ['prod-v1', 'dev-v1']),
        createImage('test/pkg', 'digest2', ['prod-v2']),
        createImage('test/pkg', 'digest3', ['dev-v2']),
      ];

      const filtered = filter.filterImages(images, images);

      expect(filtered).toHaveLength(1);
      expect(filtered[0].tags[0].name).toBe('dev-v2');
    });
  });

  describe('filterOlderThan', () => {
    it('should filter images older than specified time', () => {
      const now = new Date();
      const oldDate = new Date(now.getTime() - 8 * 24 * 60 * 60 * 1000); // 8 days ago
      const recentDate = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000); // 2 days ago

      const config: CleanupConfig = {
        dryRun: false,
        olderThan: '7d',
        deleteUntagged: false,
        deleteGhostImages: false,
        deletePartialImages: false,
        deleteOrphanedImages: false,
        validate: false,
        retry: 3,
        throttle: 100,
        verbose: false,
        expandPackages: false,
        useRegex: false,
      };

      const filter = new ImageFilter(config);
      const images = [
        createImage('test/pkg', 'digest1', ['tag1'], oldDate),
        createImage('test/pkg', 'digest2', ['tag2'], recentDate),
      ];

      const filtered = filter.filterImages(images, images);

      expect(filtered).toHaveLength(1);
      expect(filtered[0].manifest.digest).toBe('digest1');
    });
  });

  describe('filterDeleteTags', () => {
    it('should filter images with matching delete-tags patterns', () => {
      const config: CleanupConfig = {
        dryRun: false,
        deleteTags: ['test-*', 'temp-*'],
        deleteUntagged: false,
        deleteGhostImages: false,
        deletePartialImages: false,
        deleteOrphanedImages: false,
        validate: false,
        retry: 3,
        throttle: 100,
        verbose: false,
        expandPackages: false,
        useRegex: false,
      };

      const filter = new ImageFilter(config);
      const images = [
        createImage('test/pkg', 'digest1', ['test-v1', 'keep-v1']),
        createImage('test/pkg', 'digest2', ['temp-v1']),
        createImage('test/pkg', 'digest3', ['keep-v2']),
      ];

      const filtered = filter.filterImages(images, images);

      expect(filtered.length).toBeGreaterThan(0);
      expect(filtered.some(img => img.manifest.digest === 'digest1')).toBe(true);
      expect(filtered.some(img => img.manifest.digest === 'digest2')).toBe(true);
      expect(filtered.some(img => img.manifest.digest === 'digest3')).toBe(false);
    });
  });

  describe('keepNTagged', () => {
    it('should keep N latest tagged images', () => {
      const now = new Date();
      const dates = [
        new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000),
        new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000),
        new Date(now.getTime() - 1 * 24 * 60 * 60 * 1000),
      ];

      const config: CleanupConfig = {
        dryRun: false,
        keepNTagged: 2,
        deleteUntagged: false,
        deleteGhostImages: false,
        deletePartialImages: false,
        deleteOrphanedImages: false,
        validate: false,
        retry: 3,
        throttle: 100,
        verbose: false,
        expandPackages: false,
        useRegex: false,
      };

      const filter = new ImageFilter(config);
      const images = [
        createImage('test/pkg', 'digest1', ['tag1'], dates[0]),
        createImage('test/pkg', 'digest2', ['tag2'], dates[1]),
        createImage('test/pkg', 'digest3', ['tag3'], dates[2]),
      ];

      const filtered = filter.keepNTagged(images);

      expect(filtered).toHaveLength(1);
      expect(filtered[0].manifest.digest).toBe('digest1'); // Oldest should be deleted
    });

    it('should return all images if keepNTagged is 0', () => {
      const config: CleanupConfig = {
        dryRun: false,
        keepNTagged: 0,
        deleteUntagged: false,
        deleteGhostImages: false,
        deletePartialImages: false,
        deleteOrphanedImages: false,
        validate: false,
        retry: 3,
        throttle: 100,
        verbose: false,
        expandPackages: false,
        useRegex: false,
      };

      const filter = new ImageFilter(config);
      const images = [
        createImage('test/pkg', 'digest1', ['tag1']),
        createImage('test/pkg', 'digest2', ['tag2']),
      ];

      const filtered = filter.keepNTagged(images);

      expect(filtered).toHaveLength(2);
    });
  });

  describe('filterUntagged', () => {
    it('should return untagged images when deleteUntagged is true', () => {
      const config: CleanupConfig = {
        dryRun: false,
        deleteUntagged: true,
        deleteGhostImages: false,
        deletePartialImages: false,
        deleteOrphanedImages: false,
        validate: false,
        retry: 3,
        throttle: 100,
        verbose: false,
        expandPackages: false,
        useRegex: false,
      };

      const filter = new ImageFilter(config);
      const images = [
        createImage('test/pkg', 'digest1', ['tag1']),
        createImage('test/pkg', 'digest2', []), // Untagged
        createImage('test/pkg', 'digest3', ['tag3']),
      ];

      const filtered = filter.filterUntagged(images);

      expect(filtered).toHaveLength(1);
      expect(filtered[0].manifest.digest).toBe('digest2');
    });

    it('should keep N latest untagged images', () => {
      const now = new Date();
      const dates = [
        new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000),
        new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000),
        new Date(now.getTime() - 1 * 24 * 60 * 60 * 1000),
      ];

      const config: CleanupConfig = {
        dryRun: false,
        keepNUntagged: 2,
        deleteUntagged: false,
        deleteGhostImages: false,
        deletePartialImages: false,
        deleteOrphanedImages: false,
        validate: false,
        retry: 3,
        throttle: 100,
        verbose: false,
        expandPackages: false,
        useRegex: false,
      };

      const filter = new ImageFilter(config);
      const images = [
        createImage('test/pkg', 'digest1', [], dates[0]),
        createImage('test/pkg', 'digest2', [], dates[1]),
        createImage('test/pkg', 'digest3', [], dates[2]),
      ];

      const filtered = filter.filterUntagged(images);

      expect(filtered).toHaveLength(1);
      expect(filtered[0].manifest.digest).toBe('digest1'); // Oldest should be deleted
    });
  });

  describe('removeChildImages', () => {
    it('should remove child images from multi-arch images', () => {
      const config: CleanupConfig = {
        dryRun: false,
        deleteUntagged: false,
        deleteGhostImages: false,
        deletePartialImages: false,
        deleteOrphanedImages: false,
        validate: false,
        retry: 3,
        throttle: 100,
        verbose: false,
        expandPackages: false,
        useRegex: false,
      };

      const filter = new ImageFilter(config);
      const childImage = createImage('test/pkg', 'child-digest', ['child-tag'], undefined, false);
      const parentImage = createImage('test/pkg', 'parent-digest', ['parent-tag'], undefined, true);
      parentImage.childImages = [childImage];

      const images = [parentImage, childImage];
      const filtered = filter.filterImages(images, images);

      // Child image should be removed
      expect(filtered.some(img => img.manifest.digest === 'child-digest')).toBe(false);
      expect(filtered.some(img => img.manifest.digest === 'parent-digest')).toBe(true);
    });
  });
});
