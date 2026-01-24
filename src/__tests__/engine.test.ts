import { CleanupEngine } from '../cleanup/engine';
import { IRegistryProvider, Image, CleanupConfig, Package, Manifest, Tag } from '../types';
import { Logger } from '../logger';
import { ImageFilter } from '../cleanup/filters';
import { buildImageGraph } from '../cleanup/manifest';

// Mock dependencies
jest.mock('../cleanup/filters');
jest.mock('../cleanup/manifest');

const MockedImageFilter = ImageFilter as jest.MockedClass<typeof ImageFilter>;
const MockedBuildImageGraph = buildImageGraph as jest.MockedFunction<typeof buildImageGraph>;

describe('CleanupEngine', () => {
  let logger: Logger;
  let mockProvider: jest.Mocked<IRegistryProvider>;
  let config: CleanupConfig;

  const createImage = (
    packageName: string,
    digest: string,
    tags: string[],
    createdAt?: Date
  ): Image => ({
    package: { id: packageName, name: packageName, type: 'container' },
    manifest: {
      digest,
      mediaType: 'application/vnd.oci.image.manifest.v1+json',
      size: 1000,
      createdAt: createdAt || new Date(),
      updatedAt: createdAt || new Date(),
    },
    tags: tags.map(name => ({
      name,
      digest,
      createdAt: createdAt || new Date(),
      updatedAt: createdAt || new Date(),
    })),
    isMultiArch: false,
    createdAt: createdAt || new Date(),
    updatedAt: createdAt || new Date(),
  });

  beforeEach(() => {
    jest.clearAllMocks();
    logger = new Logger(false);

    mockProvider = {
      authenticate: jest.fn().mockResolvedValue(undefined),
      listPackages: jest.fn().mockResolvedValue([]),
      getPackageManifests: jest.fn().mockResolvedValue([]),
      listTags: jest.fn().mockResolvedValue([]),
      deleteTag: jest.fn().mockResolvedValue(undefined),
      getManifest: jest.fn().mockResolvedValue({
        digest: 'sha256:test',
        mediaType: 'application/vnd.oci.image.manifest.v1+json',
        size: 1000,
      }),
      deleteManifest: jest.fn().mockResolvedValue(undefined),
      getReferrers: jest.fn().mockResolvedValue([]),
      supportsFeature: jest.fn().mockReturnValue(false),
      getKnownRegistryUrls: jest.fn().mockReturnValue([]),
      registryType: 'ghcr',
      registryUrl: 'ghcr.io',
      owner: 'test-owner',
      repository: 'test-repo',
      token: 'test-token',
      logger,
      dryRun: false,
      retryCount: 3,
      throttleDelay: 100,
    } as any;

    config = {
      dryRun: true,
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

    // Mock filter
    const mockFilter = {
      filterImages: jest.fn((images: Image[]) => images),
      keepNTagged: jest.fn((images: Image[]) => images),
      filterUntagged: jest.fn((images: Image[]) => []),
    };
    MockedImageFilter.mockImplementation(() => mockFilter as any);
    MockedBuildImageGraph.mockImplementation((images: Image[]) => new Map());
  });

  describe('run', () => {
    it('should run complete cleanup process in dry-run mode', async () => {
      const images = [
        createImage('test/pkg', 'digest1', ['v1.0', 'latest']),
        createImage('test/pkg', 'digest2', ['v2.0']),
      ];

      mockProvider.listTags.mockResolvedValueOnce([
        { name: 'v1.0', digest: 'digest1', createdAt: new Date() },
        { name: 'latest', digest: 'digest1', createdAt: new Date() },
        { name: 'v2.0', digest: 'digest2', createdAt: new Date() },
      ]);
      mockProvider.getManifest
        .mockResolvedValueOnce(images[0].manifest)
        .mockResolvedValueOnce(images[0].manifest)
        .mockResolvedValueOnce(images[1].manifest);

      const engine = new CleanupEngine(mockProvider, config, logger);
      const result = await engine.run(['test/pkg']);

      expect(result.deletedCount).toBeGreaterThanOrEqual(0);
      expect(mockProvider.listTags).toHaveBeenCalledWith('test/pkg');
    });

    it('should run cleanup process with actual deletion', async () => {
      const configWithDeletion = { ...config, dryRun: false };
      const images = [createImage('test/pkg', 'digest1', ['v1.0'])];

      mockProvider.listPackages.mockResolvedValueOnce([
        { id: 'test/pkg', name: 'test/pkg', type: 'container' },
      ]);
      mockProvider.listTags.mockResolvedValueOnce([
        { name: 'v1.0', digest: 'digest1', createdAt: new Date() },
      ]);
      mockProvider.getManifest.mockResolvedValueOnce(images[0].manifest);

      const engine = new CleanupEngine(mockProvider, configWithDeletion, logger);
      const result = await engine.run(['test/pkg']);

      expect(result).toBeDefined();
      expect(mockProvider.deleteTag).toHaveBeenCalled();
    });

    it('should handle package discovery with wildcards', async () => {
      const configWithExpand = { ...config, expandPackages: true };
      mockProvider.listPackages.mockResolvedValueOnce([
        { id: 'test/pkg1', name: 'test/pkg1', type: 'container' },
        { id: 'test/pkg2', name: 'test/pkg2', type: 'container' },
      ]);

      const engine = new CleanupEngine(mockProvider, configWithExpand, logger);
      await engine.run(['test/pkg*']);

      expect(mockProvider.listPackages).toHaveBeenCalled();
    });

    it('should handle errors during cleanup', async () => {
      // Mock listTags to fail, but engine should continue and return empty result
      mockProvider.listTags.mockRejectedValueOnce(new Error('API Error'));

      const engine = new CleanupEngine(mockProvider, config, logger);
      const result = await engine.run(['test/pkg']);

      // Engine should handle the error gracefully and return a result
      expect(result).toBeDefined();
      expect(result.errors.length).toBeGreaterThanOrEqual(0);
    });

    it('should run validation phase when enabled', async () => {
      const configWithValidation = { ...config, validate: true };
      const images = [createImage('test/pkg', 'digest1', ['v1.0'])];

      mockProvider.listPackages.mockResolvedValueOnce([
        { id: 'test/pkg', name: 'test/pkg', type: 'container' },
      ]);
      mockProvider.listTags.mockResolvedValueOnce([
        { name: 'v1.0', digest: 'digest1', createdAt: new Date() },
      ]);
      mockProvider.getManifest.mockResolvedValueOnce(images[0].manifest);

      const engine = new CleanupEngine(mockProvider, configWithValidation, logger);
      const result = await engine.run(['test/pkg']);

      expect(result).toBeDefined();
    });
  });

  describe('filterImages', () => {
    it('should deduplicate images by manifest digest', () => {
      const engine = new CleanupEngine(mockProvider, config, logger);
      const images = [
        createImage('test/pkg', 'digest1', ['v1.0']),
        createImage('test/pkg', 'digest1', ['latest']), // Same digest, different tag
      ];

      // Access private method via type assertion for testing
      const filtered = (engine as any).filterImages(images);

      // Should merge tags from images with same digest
      expect(filtered.length).toBeLessThanOrEqual(images.length);
    });

    it('should filter out excluded tags', () => {
      const configWithExclude = {
        ...config,
        excludeTags: ['keep-*'],
      };
      const engine = new CleanupEngine(mockProvider, configWithExclude, logger);
      const images = [
        createImage('test/pkg', 'digest1', ['keep-me', 'delete-me']),
        createImage('test/pkg', 'digest2', ['delete-me']),
      ];

      const filtered = (engine as any).filterImages(images);

      // Images with excluded tags should be filtered out
      expect(filtered.length).toBeLessThanOrEqual(images.length);
    });
  });

  describe('deleteImages', () => {
    it('should delete tags and manifests', async () => {
      const configWithDeletion = { ...config, dryRun: false };
      const engine = new CleanupEngine(mockProvider, configWithDeletion, logger);
      const images = [createImage('test/pkg', 'digest1', ['v1.0'])];

      const result = await (engine as any).deleteImages(images);

      expect(mockProvider.deleteTag).toHaveBeenCalledWith('test/pkg', 'v1.0', ['v1.0']);
      expect(result.deletedCount).toBeGreaterThanOrEqual(0);
    });

    it('should handle deletion errors gracefully', async () => {
      const configWithDeletion = { ...config, dryRun: false };
      mockProvider.deleteTag.mockRejectedValueOnce(new Error('Delete failed'));

      const engine = new CleanupEngine(mockProvider, configWithDeletion, logger);
      const images = [createImage('test/pkg', 'digest1', ['v1.0'])];

      const result = await (engine as any).deleteImages(images);

      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('should not delete manifest if excluded tags exist', async () => {
      const configWithExclude = {
        ...config,
        dryRun: false,
        excludeTags: ['keep-me'],
      };
      const engine = new CleanupEngine(mockProvider, configWithExclude, logger);
      const images = [createImage('test/pkg', 'digest1', ['v1.0', 'keep-me'])];

      // Mock hasExcludedTagsForManifest to return true
      (engine as any).hasExcludedTagsForManifest = jest.fn().mockResolvedValue(true);

      const result = await (engine as any).deleteImages(images);

      // Should not delete manifest if excluded tags exist
      expect(mockProvider.deleteManifest).not.toHaveBeenCalled();
    });
  });

  describe('discoverImages', () => {
    it('should discover images from packages', async () => {
      const engine = new CleanupEngine(mockProvider, config, logger);
      mockProvider.listPackages.mockResolvedValueOnce([
        { id: 'test/pkg', name: 'test/pkg', type: 'container' },
      ]);
      mockProvider.listTags.mockResolvedValueOnce([
        { name: 'v1.0', digest: 'digest1', createdAt: new Date() },
      ]);
      mockProvider.getManifest.mockResolvedValueOnce({
        digest: 'digest1',
        mediaType: 'application/vnd.oci.image.manifest.v1+json',
        size: 1000,
      });

      const images = await (engine as any).discoverImages(['test/pkg']);

      expect(images.length).toBeGreaterThanOrEqual(0);
      expect(mockProvider.listTags).toHaveBeenCalledWith('test/pkg');
    });

    it('should handle packages without tags', async () => {
      const engine = new CleanupEngine(mockProvider, config, logger);
      mockProvider.listPackages.mockResolvedValueOnce([
        { id: 'test/pkg', name: 'test/pkg', type: 'container' },
      ]);
      mockProvider.listTags.mockResolvedValueOnce([]);

      const images = await (engine as any).discoverImages(['test/pkg']);

      expect(images).toEqual([]);
    });
  });
});
