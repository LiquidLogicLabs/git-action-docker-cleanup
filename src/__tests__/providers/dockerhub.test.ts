import { DockerHubProvider } from '../../providers/dockerhub';
import { Logger } from '../../logger';
import { HttpClient } from '../../utils/api';
import { ProviderConfig } from '../../types';

// Mock HttpClient
jest.mock('../../utils/api');
const MockedHttpClient = HttpClient as jest.MockedClass<typeof HttpClient>;

describe('DockerHubProvider', () => {
  let logger: Logger;
  let httpClient: jest.Mocked<HttpClient>;
  let provider: DockerHubProvider;
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
      registryType: 'docker-hub',
      registryUrl: 'docker.io',
      owner: 'test-owner',
      repository: 'test-repo',
      token: undefined,
      username: 'test-user',
      password: 'test-password',
      expandPackages: false,
      useRegex: false,
    };

    provider = new DockerHubProvider(logger, config, httpClient as any);
  });

  describe('constructor', () => {
    it('should require username and password', () => {
      const invalidConfig: ProviderConfig = {
        ...config,
        username: undefined,
        password: undefined,
      };
      expect(() => new DockerHubProvider(logger, invalidConfig, httpClient as any)).toThrow(
        'Docker Hub provider requires registry-username and registry-password'
      );
    });

    it('should accept token as password', () => {
      const tokenConfig: ProviderConfig = {
        ...config,
        password: undefined,
        token: 'test-token',
      };
      expect(() => new DockerHubProvider(logger, tokenConfig, httpClient as any)).not.toThrow();
    });
  });

  describe('authenticate', () => {
    it('should authenticate with Docker Hub API', async () => {
      httpClient.post.mockResolvedValueOnce({
        data: { token: 'hub-token' },
        status: 200,
        statusText: 'OK',
        headers: {},
      });

      await provider.authenticate();

      expect(httpClient.post).toHaveBeenCalledWith(
        expect.stringContaining('hub.docker.com/v2/users/login'),
        { username: 'test-user', password: 'test-password' },
        { 'Content-Type': 'application/json' }
      );
    });

    it('should use token as password when password is not provided', async () => {
      const tokenConfig: ProviderConfig = {
        ...config,
        password: undefined,
        token: 'test-token',
      };
      const tokenProvider = new DockerHubProvider(logger, tokenConfig, httpClient as any);

      httpClient.post.mockResolvedValueOnce({
        data: { token: 'hub-token' },
        status: 200,
        statusText: 'OK',
        headers: {},
      });

      await tokenProvider.authenticate();

      expect(httpClient.post).toHaveBeenCalledWith(
        expect.stringContaining('hub.docker.com/v2/users/login'),
        { username: 'test-user', password: 'test-token' },
        expect.any(Object)
      );
    });
  });

  describe('listTags', () => {
    it('should list tags for a package', async () => {
      // Mock authentication (Hub API token - called during authenticate())
      httpClient.post.mockResolvedValueOnce({
        data: { token: 'hub-token-auth' },
        status: 200,
        statusText: 'OK',
        headers: {},
      });

      // Mock Hub API token for listTags() (called again during listTags())
      httpClient.post.mockResolvedValueOnce({
        data: { token: 'hub-token' },
        status: 200,
        statusText: 'OK',
        headers: {},
      });

      httpClient.get.mockResolvedValueOnce({
        data: {
          results: [
            {
              name: 'v1.0',
              last_updated: '2024-01-01T00:00:00Z',
              images: [{ digest: 'sha256:digest1' }],
            },
            {
              name: 'v2.0',
              last_updated: '2024-01-02T00:00:00Z',
              images: [{ digest: 'sha256:digest2' }],
            },
            {
              name: 'latest',
              last_updated: '2024-01-03T00:00:00Z',
              images: [{ digest: 'sha256:digest3' }],
            },
          ],
        },
        status: 200,
        statusText: 'OK',
        headers: {},
      });

      const tags = await provider.listTags('test-user/package1');

      expect(tags).toHaveLength(3);
      expect(tags[0].name).toBe('v1.0');
      expect(tags[0].digest).toBe('sha256:digest1');
    });
  });

  describe('deleteTag', () => {
    it('should delete a tag via Hub API', async () => {
      // Mock authentication (Hub API token)
      httpClient.post.mockResolvedValueOnce({
        data: { token: 'hub-token-auth' },
        status: 200,
        statusText: 'OK',
        headers: {},
      });

      // Mock Hub API tag delete
      httpClient.delete.mockResolvedValueOnce({
        data: undefined,
        status: 204,
        statusText: 'No Content',
        headers: {},
      });

      await provider.deleteTag('test-user/package1', 'v1.0');

      expect(httpClient.delete).toHaveBeenCalledWith(
        expect.stringContaining('hub.docker.com/v2/repositories/test-user/package1/tags/v1.0'),
        expect.objectContaining({ Authorization: 'JWT hub-token-auth' })
      );
    });
  });

  describe('getManifest', () => {
    it('should construct manifest from Hub API tag data', async () => {
      // Mock authentication
      httpClient.post.mockResolvedValueOnce({
        data: { token: 'hub-token-auth' },
        status: 200,
        statusText: 'OK',
        headers: {},
      });

      // Mock listTags (called by getManifest)
      httpClient.post.mockResolvedValueOnce({
        data: { token: 'hub-token' },
        status: 200,
        statusText: 'OK',
        headers: {},
      });

      httpClient.get.mockResolvedValueOnce({
        data: {
          results: [
            {
              name: 'v1.0',
              last_updated: '2024-01-01T00:00:00Z',
              images: [{ digest: 'sha256:digest1' }],
            },
          ],
        },
        status: 200,
        statusText: 'OK',
        headers: {},
      });

      const manifest = await provider.getManifest('test-user/package1', 'v1.0');

      expect(manifest.digest).toBe('sha256:digest1');
      expect(manifest.mediaType).toBe('application/vnd.docker.distribution.manifest.v2+json');
    });

    it('should find manifest by digest', async () => {
      // Mock authentication
      httpClient.post.mockResolvedValueOnce({
        data: { token: 'hub-token-auth' },
        status: 200,
        statusText: 'OK',
        headers: {},
      });

      // Mock listTags
      httpClient.post.mockResolvedValueOnce({
        data: { token: 'hub-token' },
        status: 200,
        statusText: 'OK',
        headers: {},
      });

      httpClient.get.mockResolvedValueOnce({
        data: {
          results: [
            {
              name: 'v1.0',
              last_updated: '2024-01-01T00:00:00Z',
              images: [{ digest: 'sha256:digest1' }],
            },
          ],
        },
        status: 200,
        statusText: 'OK',
        headers: {},
      });

      const manifest = await provider.getManifest('test-user/package1', 'sha256:digest1');

      expect(manifest.digest).toBe('sha256:digest1');
    });

    it('should throw error if tag or digest not found', async () => {
      // Mock authentication
      httpClient.post.mockResolvedValueOnce({
        data: { token: 'hub-token-auth' },
        status: 200,
        statusText: 'OK',
        headers: {},
      });

      // Mock listTags returning empty results
      httpClient.post.mockResolvedValueOnce({
        data: { token: 'hub-token' },
        status: 200,
        statusText: 'OK',
        headers: {},
      });

      httpClient.get.mockResolvedValueOnce({
        data: { results: [] },
        status: 200,
        statusText: 'OK',
        headers: {},
      });

      await expect(provider.getManifest('test-user/package1', 'nonexistent')).rejects.toThrow(
        'Tag or digest not found: nonexistent'
      );
    });
  });

  describe('getPackageManifests', () => {
    it('should construct manifests from Hub API tag data', async () => {
      // Mock authentication
      httpClient.post.mockResolvedValueOnce({
        data: { token: 'hub-token-auth' },
        status: 200,
        statusText: 'OK',
        headers: {},
      });

      // Mock listTags (called by getPackageManifests)
      httpClient.post.mockResolvedValueOnce({
        data: { token: 'hub-token' },
        status: 200,
        statusText: 'OK',
        headers: {},
      });

      httpClient.get.mockResolvedValueOnce({
        data: {
          results: [
            {
              name: 'v1.0',
              last_updated: '2024-01-01T00:00:00Z',
              images: [{ digest: 'sha256:digest1' }],
            },
            {
              name: 'v2.0',
              last_updated: '2024-01-02T00:00:00Z',
              images: [{ digest: 'sha256:digest1' }], // Same digest
            },
            {
              name: 'latest',
              last_updated: '2024-01-03T00:00:00Z',
              images: [{ digest: 'sha256:digest2' }],
            },
          ],
        },
        status: 200,
        statusText: 'OK',
        headers: {},
      });

      const manifests = await provider.getPackageManifests('test-user/package1');

      // Should group tags by digest, so 2 unique manifests
      expect(manifests).toHaveLength(2);
      expect(manifests[0].digest).toBe('sha256:digest1');
      expect(manifests[1].digest).toBe('sha256:digest2');
    });
  });

  describe('deleteManifest', () => {
    it('should throw error as Hub API does not support manifest deletion', async () => {
      await expect(provider.deleteManifest('test-user/package1', 'sha256:digest1')).rejects.toThrow(
        'Docker Hub API does not support direct manifest deletion'
      );
    });
  });

  describe('getReferrers', () => {
    it('should return empty array as Hub API does not support referrers', async () => {
      const referrers = await provider.getReferrers('test-user/package1', 'sha256:digest1');
      expect(referrers).toEqual([]);
    });
  });

  describe('supportsFeature', () => {
    it('should report supported features', () => {
      expect(provider.supportsFeature('MULTI_ARCH')).toBe(true);
      expect(provider.supportsFeature('REFERRERS')).toBe(false);
      expect(provider.supportsFeature('ATTESTATION')).toBe(false);
      expect(provider.supportsFeature('COSIGN')).toBe(false);
    });
  });
});
