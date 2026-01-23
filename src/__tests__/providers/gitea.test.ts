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
          data: [
            { id: 1, digest: 'sha256:digest1', created_at: '2024-01-01T00:00:00Z' },
          ],
          status: 200,
          statusText: 'OK',
          headers: {},
        })
        .mockResolvedValueOnce({
          data: {
            id: 1,
            name: 'package1',
            versions: [
              {
                id: 1,
                version: 'v1.0',
                created_at: '2024-01-01T00:00:00Z',
              },
            ],
          },
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

      expect(httpClient.delete).toHaveBeenCalled();
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
