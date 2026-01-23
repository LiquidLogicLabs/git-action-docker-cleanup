import { GHCRProvider } from '../../providers/ghcr';
import { Logger } from '../../logger';
import { HttpClient } from '../../utils/api';
import { ProviderConfig } from '../../types';

// Mock HttpClient
jest.mock('../../utils/api');
const MockedHttpClient = HttpClient as jest.MockedClass<typeof HttpClient>;

describe('GHCRProvider', () => {
  let logger: Logger;
  let httpClient: jest.Mocked<HttpClient>;
  let provider: GHCRProvider;
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
      registryType: 'ghcr',
      registryUrl: 'ghcr.io',
      owner: 'test-owner',
      repository: 'test-repo',
      token: 'test-token',
      expandPackages: false,
      useRegex: false,
    };

    provider = new GHCRProvider(logger, config, httpClient as any);
  });

  describe('authenticate', () => {
    it('should authenticate successfully', async () => {
      httpClient.get.mockResolvedValueOnce({
        data: { login: 'test-owner' },
        status: 200,
        statusText: 'OK',
        headers: {},
      });

      await provider.authenticate();

      expect(httpClient.get).toHaveBeenCalledWith(
        'https://api.github.com/user',
        expect.objectContaining({
          Authorization: 'Bearer test-token',
        })
      );
    });
  });

  describe('listPackages', () => {
    it('should list packages for user', async () => {
      httpClient.get
        .mockResolvedValueOnce({
          data: { login: 'test-owner' },
          status: 200,
          statusText: 'OK',
          headers: {},
        })
        .mockResolvedValueOnce({
          data: { type: 'User' },
          status: 200,
          statusText: 'OK',
          headers: {},
        })
        .mockResolvedValueOnce({
          data: [
            {
              id: 1,
              name: 'package1',
              package_type: 'container',
              owner: { login: 'test-owner' },
              created_at: '2024-01-01T00:00:00Z',
              updated_at: '2024-01-01T00:00:00Z',
            },
            {
              id: 2,
              name: 'package2',
              package_type: 'container',
              owner: { login: 'test-owner' },
              created_at: '2024-01-01T00:00:00Z',
              updated_at: '2024-01-01T00:00:00Z',
            },
          ],
          status: 200,
          statusText: 'OK',
          headers: {},
        });

      const packages = await provider.listPackages();

      expect(packages).toHaveLength(2);
      expect(packages[0].name).toBe('package1');
    });
  });

  describe('listTags', () => {
    it('should list tags for a package', async () => {
      httpClient.get
        .mockResolvedValueOnce({
          data: { login: 'test-owner' },
          status: 200,
          statusText: 'OK',
          headers: {},
        })
        .mockResolvedValueOnce({
          data: { type: 'User' },
          status: 200,
          statusText: 'OK',
          headers: {},
        })
        .mockResolvedValueOnce({
          data: [
            {
              id: 1,
              name: 'sha256:abc123',
              metadata: { container: { tags: ['v1.0', 'latest'] } },
              created_at: '2024-01-01T00:00:00Z',
            },
          ],
          status: 200,
          statusText: 'OK',
          headers: {},
        });

      const tags = await provider.listTags('test-owner/package1');

      expect(tags).toHaveLength(2);
      expect(tags[0].name).toBe('v1.0');
      expect(tags[1].name).toBe('latest');
    });
  });

  describe('deleteTag', () => {
    it('should delete a tag', async () => {
      httpClient.get
        .mockResolvedValueOnce({
          data: { login: 'test-owner' },
          status: 200,
          statusText: 'OK',
          headers: {},
        })
        .mockResolvedValueOnce({
          data: { type: 'User' },
          status: 200,
          statusText: 'OK',
          headers: {},
        })
        .mockResolvedValueOnce({
          data: [
            {
              id: 1,
              name: 'sha256:abc123',
              metadata: { container: { tags: ['v1.0'] } },
              created_at: '2024-01-01T00:00:00Z',
            },
          ],
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
    it('should return known registry URLs', () => {
      const urls = provider.getKnownRegistryUrls();
      expect(urls).toContain('ghcr.io');
    });
  });
});
