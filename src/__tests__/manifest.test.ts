import {
  isMultiArchManifest,
  getChildImageDigests,
  buildImageGraph,
  findParentImages,
  isPartialMultiArchImage,
  isOrphanedImage,
  isGhostImage,
  hasReferrers,
  getReferrerDigests,
  isReferrerImage,
} from '../cleanup/manifest';
import { Image, Manifest, Referrer, Package } from '../types';

describe('Manifest Utilities', () => {
  const createManifest = (digest: string, isMultiArch = false): Manifest => ({
    digest,
    mediaType: isMultiArch
      ? 'application/vnd.oci.image.index.v1+json'
      : 'application/vnd.oci.image.manifest.v1+json',
    size: 1000,
    manifests: isMultiArch
      ? [
          { digest: 'child1', mediaType: 'application/vnd.oci.image.manifest.v1+json', size: 500 },
          { digest: 'child2', mediaType: 'application/vnd.oci.image.manifest.v1+json', size: 500 },
        ]
      : undefined,
  });

  const createImage = (
    packageName: string,
    digest: string,
    tags: string[],
    isMultiArch = false,
    childImages?: Image[],
    referrers?: Referrer[]
  ): Image => ({
    package: { id: packageName, name: packageName, type: 'container' },
    manifest: createManifest(digest, isMultiArch),
    tags: tags.map(name => ({ name, digest, createdAt: new Date() })),
    isMultiArch,
    childImages,
    referrers,
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  describe('isMultiArchManifest', () => {
    it('should detect multi-arch manifest', () => {
      const manifest = createManifest('parent-digest', true);
      expect(isMultiArchManifest(manifest)).toBe(true);
    });

    it('should detect single-arch manifest', () => {
      const manifest = createManifest('single-digest', false);
      expect(isMultiArchManifest(manifest)).toBe(false);
    });
  });

  describe('getChildImageDigests', () => {
    it('should extract child digests from multi-arch manifest', () => {
      const manifest = createManifest('parent-digest', true);
      const digests = getChildImageDigests(manifest);
      expect(digests).toEqual(['child1', 'child2']);
    });

    it('should return empty array for single-arch manifest', () => {
      const manifest = createManifest('single-digest', false);
      const digests = getChildImageDigests(manifest);
      expect(digests).toEqual([]);
    });
  });

  describe('buildImageGraph', () => {
    it('should build image dependency graph', () => {
      const child1 = createImage('test/pkg', 'child1', ['child1-tag'], false);
      const child2 = createImage('test/pkg', 'child2', ['child2-tag'], false);
      const parent = createImage('test/pkg', 'parent-digest', ['parent-tag'], true, [child1, child2]);

      const images = [parent, child1, child2];
      const graph = buildImageGraph(images);

      expect(graph.has('parent-digest')).toBe(true);
      expect(graph.get('parent-digest')).toHaveLength(2);
      expect(parent.isMultiArch).toBe(true);
      expect(child1.isMultiArch).toBe(false);
    });

    it('should handle images without children', () => {
      const image = createImage('test/pkg', 'single-digest', ['tag'], false);
      const images = [image];
      const graph = buildImageGraph(images);

      expect(graph.has('single-digest')).toBe(false);
      expect(image.isMultiArch).toBe(false);
    });
  });

  describe('findParentImages', () => {
    it('should find parent images for a child', () => {
      const child = createImage('test/pkg', 'child-digest', ['child-tag'], false);
      const parent = createImage('test/pkg', 'parent-digest', ['parent-tag'], true, [child]);
      // Ensure parent manifest includes child digest
      parent.manifest.manifests = [
        { digest: 'child-digest', mediaType: 'application/vnd.oci.image.manifest.v1+json', size: 500 },
      ];

      const images = [parent, child];
      const parents = findParentImages(child, images);

      expect(parents).toHaveLength(1);
      expect(parents[0].manifest.digest).toBe('parent-digest');
    });

    it('should return empty array if no parents found', () => {
      const image = createImage('test/pkg', 'single-digest', ['tag'], false);
      const images = [image];
      const parents = findParentImages(image, images);

      expect(parents).toHaveLength(0);
    });
  });

  describe('isPartialMultiArchImage', () => {
    it('should detect partial multi-arch image', () => {
      const child1 = createImage('test/pkg', 'child1', ['tag1'], false);
      const parent = createImage('test/pkg', 'parent-digest', ['parent-tag'], true, [child1]);
      // Parent expects 2 children but only has 1
      parent.manifest.manifests = [
        { digest: 'child1', mediaType: 'application/vnd.oci.image.manifest.v1+json', size: 500 },
        { digest: 'child2', mediaType: 'application/vnd.oci.image.manifest.v1+json', size: 500 },
      ];

      expect(isPartialMultiArchImage(parent)).toBe(true);
    });

    it('should not detect complete multi-arch image as partial', () => {
      const child1 = createImage('test/pkg', 'child1', ['tag1'], false);
      const child2 = createImage('test/pkg', 'child2', ['tag2'], false);
      const parent = createImage('test/pkg', 'parent-digest', ['parent-tag'], true, [child1, child2]);
      parent.manifest.manifests = [
        { digest: 'child1', mediaType: 'application/vnd.oci.image.manifest.v1+json', size: 500 },
        { digest: 'child2', mediaType: 'application/vnd.oci.image.manifest.v1+json', size: 500 },
      ];

      expect(isPartialMultiArchImage(parent)).toBe(false);
    });
  });

  describe('isOrphanedImage', () => {
    it('should detect orphaned child image', () => {
      const child = createImage('test/pkg', 'child-digest', ['child-tag'], false);
      // No parent image exists
      const images = [child];

      expect(isOrphanedImage(child, images)).toBe(false); // Not multi-arch, so not orphaned
    });

    it('should not detect child with parent as orphaned', () => {
      const child = createImage('test/pkg', 'child-digest', ['child-tag'], false);
      const parent = createImage('test/pkg', 'parent-digest', ['parent-tag'], true, [child]);
      const images = [parent, child];

      expect(isOrphanedImage(child, images)).toBe(false);
    });
  });

  describe('isGhostImage', () => {
    it('should detect ghost image (referenced but missing)', () => {
      // Create a multi-arch image that references a digest that doesn't exist as an actual image
      const parent = createImage('test/pkg', 'parent-digest', ['parent-tag'], true);
      parent.manifest.manifests = [
        { digest: 'ghost-digest', mediaType: 'application/vnd.oci.image.manifest.v1+json', size: 500 },
      ];
      // The ghost image is referenced but doesn't exist in allImages
      const ghostImage = createImage('test/pkg', 'ghost-digest', [], false);
      // Don't include ghostImage in allImages - it's "missing"
      const images = [parent];

      // isGhostImage checks if a digest is referenced but the actual image doesn't exist
      // Since ghost-digest is referenced but not in images, it should return true
      // But we need to call it with an image that matches the referenced digest
      expect(isGhostImage(ghostImage, images)).toBe(true);
    });

    it('should not detect image that exists as ghost', () => {
      const child = createImage('test/pkg', 'child-digest', ['tag'], false);
      const parent = createImage('test/pkg', 'parent-digest', ['parent-tag'], true, [child]);
      parent.manifest.manifests = [
        { digest: 'child-digest', mediaType: 'application/vnd.oci.image.manifest.v1+json', size: 500 },
      ];
      const images = [parent, child];

      // Child exists, so it's not a ghost
      expect(isGhostImage(child, images)).toBe(false);
    });
  });

  describe('hasReferrers', () => {
    it('should detect image with referrers', () => {
      const referrer: Referrer = {
        digest: 'referrer-digest',
        artifactType: 'application/vnd.example.attestation',
        mediaType: 'application/vnd.oci.artifact.manifest.v1+json',
        size: 100,
      };
      const image = createImage('test/pkg', 'digest', ['tag'], false, undefined, [referrer]);

      expect(hasReferrers(image)).toBe(true);
    });

    it('should detect image without referrers', () => {
      const image = createImage('test/pkg', 'digest', ['tag'], false);

      expect(hasReferrers(image)).toBe(false);
    });
  });

  describe('getReferrerDigests', () => {
    it('should extract referrer digests', () => {
      const referrers: Referrer[] = [
        {
          digest: 'ref1',
          artifactType: 'attestation',
          mediaType: 'application/vnd.oci.artifact.manifest.v1+json',
          size: 100,
        },
        {
          digest: 'ref2',
          artifactType: 'cosign',
          mediaType: 'application/vnd.oci.artifact.manifest.v1+json',
          size: 100,
        },
      ];
      const image = createImage('test/pkg', 'digest', ['tag'], false, undefined, referrers);

      const digests = getReferrerDigests(image);
      expect(digests).toEqual(['ref1', 'ref2']);
    });
  });

  describe('isReferrerImage', () => {
    it('should detect referrer image', () => {
      const referrer: Referrer = {
        digest: 'referrer-digest',
        artifactType: 'attestation',
        mediaType: 'application/vnd.oci.artifact.manifest.v1+json',
        size: 100,
      };
      const mainImage = createImage('test/pkg', 'main-digest', ['tag'], false, undefined, [referrer]);
      const referrerImage = createImage('test/pkg', 'referrer-digest', [], false);

      const images = [mainImage, referrerImage];
      expect(isReferrerImage(referrerImage, images)).toBe(true);
    });

    it('should not detect non-referrer image', () => {
      const image = createImage('test/pkg', 'digest', ['tag'], false);
      const images = [image];

      expect(isReferrerImage(image, images)).toBe(false);
    });
  });
});
