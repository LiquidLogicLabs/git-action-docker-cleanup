import { GiteaProvider } from '../../providers/gitea';
import { Logger } from '../../logger';
import { HttpClient } from '../../utils/api';
import { ProviderConfig } from '../../types';

// Mock HttpClient
jest.mock('../../utils/api');
const MockedHttpClient = HttpClient as jest.MockedClass<typeof HttpClient>;

describe('GiteaProvider', () => {
  let logger: Logger;
  let httpClient: jest.Mocked<HttpClient>;
  let provider: GiteaProvider;
  let config: ProviderConfig;

  beforeEach(() => {
    jest.clearAllMocks();
    logger = new Logger(false);
    httpClient = {
      get: jest.fn(),
      post: jest.fn(),
      delete: jest.fn(),
      put: jest.fn(),
      request: jest.fn(),
    } as any;
    MockedHttpClient.mockImplementation(() => httpClient as any);

    config = {
      registryType: 'gitea',
      registryUrl: 'https://gitea.example.com',
      owner: 'test-owner',
      repository: 'test-repo',
      token: 'test-token',
      expandPackages: false,
      useRegex: false,
    };

    provider = new GiteaProvider(logger, config, httpClient as any);
  });

  describe('authenticate', () => {
    it('should authenticate successfully', async () => {
      httpClient.get.mockResolvedValueOnce({
        data: { id: 1, login: 'test-owner' },
        status: 200,
        statusText: 'OK',
        headers: {},
      });

      await provider.authenticate();

      expect(httpClient.get).toHaveBeenCalledWith(
        expect.stringContaining('/api/v1/user'),
        expect.objectContaining({
          Authorization: expect.stringContaining('test-token'),
        })
      );
    });
  });

  describe('listPackages', () => {
    it('should list packages', async () => {
      httpClient.get
        .mockResolvedValueOnce({
          data: { id: 1, login: 'test-owner' },
          status: 200,
          statusText: 'OK',
          headers: {},
        })
        .mockResolvedValueOnce({
          data: [
            {
              id: 1,
              name: 'package1',
              type: 'container',
              owner: { id: 1, login: 'test-owner' },
              created_at: '2024-01-01T00:00:00Z',
              updated_at: '2024-01-01T00:00:00Z',
            },
          ],
          status: 200,
          statusText: 'OK',
          headers: {},
        });

      const packages = await provider.listPackages();

      expect(packages).toHaveLength(1);
      expect(packages[0].name).toBe('package1');
    });
  });

  describe('listTags', () => {
    it('should list tags for a package', async () => {
      httpClient.get
        .mockResolvedValueOnce({
          data: { id: 1, login: 'test-owner' },
          status: 200,
          statusText: 'OK',
          headers: {},
        })
        .mockResolvedValueOnce({
          data: { tags: ['v1.0', 'v2.0'] },
          status: 200,
          statusText: 'OK',
          headers: {},
        })
        .mockResolvedValueOnce({
          data: JSON.stringify({
            schemaVersion: 2,
            mediaType: 'application/vnd.docker.distribution.manifest.v2+json',
            config: { digest: 'sha256:config1', size: 100 },
            layers: [],
          }),
          status: 200,
          statusText: 'OK',
          headers: { 'docker-content-digest': 'sha256:digest1' },
        })
        .mockResolvedValueOnce({
          data: JSON.stringify({
            schemaVersion: 2,
            mediaType: 'application/vnd.docker.distribution.manifest.v2+json',
            config: { digest: 'sha256:config2', size: 100 },
            layers: [],
          }),
          status: 200,
          statusText: 'OK',
          headers: { 'docker-content-digest': 'sha256:digest2' },
        });

      const tags = await provider.listTags('test-owner/package1');

      expect(tags.length).toBeGreaterThan(0);
      expect(tags[0].name).toBe('v1.0');
    });
  });

  describe('deleteTag', () => {
    it('should delete a tag via Package API', async () => {
      httpClient.get
        .mockResolvedValueOnce({
          data: { id: 1, login: 'test-owner' },
          status: 200,
          statusText: 'OK',
          headers: {},
        });

      httpClient.delete.mockResolvedValueOnce({
        data: undefined,
        status: 204,
        statusText: 'No Content',
        headers: {},
      });

      await provider.deleteTag('test-owner/package1', 'v1.0');

      expect(httpClient.delete).toHaveBeenCalledWith(
        expect.stringContaining('/api/v1/packages/test-owner/container/package1/v1.0'),
        expect.objectContaining({
          Authorization: expect.stringContaining('test-token'),
        })
      );
    });

    it('should fall back to OCI Registry API when Package API returns 403 and all tags are being deleted', async () => {
      // Mock authentication
      httpClient.get
        .mockResolvedValueOnce({
          data: { id: 1, login: 'test-owner' },
          status: 200,
          statusText: 'OK',
          headers: {},
        });

      // Mock Package API deletion failure (403)
      httpClient.delete.mockRejectedValueOnce({
        message: 'user should have specific permission or be a site admin',
        statusCode: 403,
      });

      // Mock getManifest for the tag
      httpClient.get
        .mockResolvedValueOnce({
          data: JSON.stringify({
            schemaVersion: 2,
            mediaType: 'application/vnd.docker.distribution.manifest.v2+json',
            config: { digest: 'sha256:config1', size: 100 },
            layers: [],
          }),
          status: 200,
          statusText: 'OK',
          headers: { 'docker-content-digest': 'sha256:digest1' },
        });

      // Mock listTags to return multiple tags pointing to the same manifest
      httpClient.get
        .mockResolvedValueOnce({
          data: { tags: ['v1.0', 'v2.0', 'latest'] },
          status: 200,
          statusText: 'OK',
          headers: {},
        })
        // Mock getManifest for each tag (all pointing to same digest)
        .mockResolvedValueOnce({
          data: JSON.stringify({
            schemaVersion: 2,
            mediaType: 'application/vnd.docker.distribution.manifest.v2+json',
            config: { digest: 'sha256:config1', size: 100 },
            layers: [],
          }),
          status: 200,
          statusText: 'OK',
          headers: { 'docker-content-digest': 'sha256:digest1' },
        })
        .mockResolvedValueOnce({
          data: JSON.stringify({
            schemaVersion: 2,
            mediaType: 'application/vnd.docker.distribution.manifest.v2+json',
            config: { digest: 'sha256:config1', size: 100 },
            layers: [],
          }),
          status: 200,
          statusText: 'OK',
          headers: { 'docker-content-digest': 'sha256:digest1' },
        })
        .mockResolvedValueOnce({
          data: JSON.stringify({
            schemaVersion: 2,
            mediaType: 'application/vnd.docker.distribution.manifest.v2+json',
            config: { digest: 'sha256:config1', size: 100 },
            layers: [],
          }),
          status: 200,
          statusText: 'OK',
          headers: { 'docker-content-digest': 'sha256:digest1' },
        });

      // Mock OCI Registry API manifest deletion
      httpClient.delete.mockResolvedValueOnce({
        data: undefined,
        status: 202,
        statusText: 'Accepted',
        headers: {},
      });

      // All tags pointing to the manifest are being deleted
      await provider.deleteTag('test-owner/package1', 'v1.0', ['v1.0', 'v2.0', 'latest']);

      // Should have tried Package API first
      expect(httpClient.delete).toHaveBeenCalledWith(
        expect.stringContaining('/api/v1/packages/test-owner/container/package1/v1.0'),
        expect.objectContaining({
          Authorization: expect.stringContaining('test-token'),
        })
      );

      // Should have deleted manifest via OCI Registry API
      expect(httpClient.delete).toHaveBeenCalledWith(
        expect.stringContaining('/v2/test-owner/package1/manifests/sha256:digest1'),
        expect.objectContaining({
          Authorization: expect.stringContaining('Basic'),
        })
      );
    });

    it('should not allow OCI Registry API deletion when Package API returns 403 and not all tags are being deleted', async () => {
      // Mock authentication
      httpClient.get
        .mockResolvedValueOnce({
          data: { id: 1, login: 'test-owner' },
          status: 200,
          statusText: 'OK',
          headers: {},
        });

      // Mock Package API deletion failure (403)
      httpClient.delete.mockRejectedValueOnce({
        message: 'user should have specific permission or be a site admin',
        statusCode: 403,
      });

      // Mock getManifest for the tag
      httpClient.get
        .mockResolvedValueOnce({
          data: JSON.stringify({
            schemaVersion: 2,
            mediaType: 'application/vnd.docker.distribution.manifest.v2+json',
            config: { digest: 'sha256:config1', size: 100 },
            layers: [],
          }),
          status: 200,
          statusText: 'OK',
          headers: { 'docker-content-digest': 'sha256:digest1' },
        });

      // Mock listTags to return multiple tags pointing to the same manifest
      httpClient.get
        .mockResolvedValueOnce({
          data: { tags: ['v1.0', 'v2.0', 'latest'] },
          status: 200,
          statusText: 'OK',
          headers: {},
        })
        // Mock getManifest for each tag (all pointing to same digest)
        .mockResolvedValueOnce({
          data: JSON.stringify({
            schemaVersion: 2,
            mediaType: 'application/vnd.docker.distribution.manifest.v2+json',
            config: { digest: 'sha256:config1', size: 100 },
            layers: [],
          }),
          status: 200,
          statusText: 'OK',
          headers: { 'docker-content-digest': 'sha256:digest1' },
        })
        .mockResolvedValueOnce({
          data: JSON.stringify({
            schemaVersion: 2,
            mediaType: 'application/vnd.docker.distribution.manifest.v2+json',
            config: { digest: 'sha256:config1', size: 100 },
            layers: [],
          }),
          status: 200,
          statusText: 'OK',
          headers: { 'docker-content-digest': 'sha256:digest1' },
        })
        .mockResolvedValueOnce({
          data: JSON.stringify({
            schemaVersion: 2,
            mediaType: 'application/vnd.docker.distribution.manifest.v2+json',
            config: { digest: 'sha256:config1', size: 100 },
            layers: [],
          }),
          status: 200,
          statusText: 'OK',
          headers: { 'docker-content-digest': 'sha256:digest1' },
        });

      // Only v1.0 is being deleted, not all tags
      await expect(
        provider.deleteTag('test-owner/package1', 'v1.0', ['v1.0'])
      ).rejects.toThrow('Cannot delete tag v1.0 via OCI Registry API');

      // Should have tried Package API first
      expect(httpClient.delete).toHaveBeenCalledWith(
        expect.stringContaining('/api/v1/packages/test-owner/container/package1/v1.0'),
        expect.objectContaining({
          Authorization: expect.stringContaining('test-token'),
        })
      );

      // Should NOT have deleted manifest via OCI Registry API
      expect(httpClient.delete).not.toHaveBeenCalledWith(
        expect.stringContaining('/v2/test-owner/package1/manifests/sha256:digest1'),
        expect.anything()
      );
    });
  });

  describe('supportsFeature', () => {
    it('should report supported features', () => {
      expect(provider.supportsFeature('MULTI_ARCH')).toBe(true);
      expect(provider.supportsFeature('REFERRERS')).toBe(true);
    });
  });

  describe('getKnownRegistryUrls', () => {
    it('should return empty array (self-hosted)', () => {
      const urls = provider.getKnownRegistryUrls();
      expect(urls).toEqual([]);
    });
  });
});
