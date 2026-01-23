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

  describe('authenticate', () => {
    it('should authenticate with Docker Hub token', async () => {
      // Mock token request
      httpClient.get.mockResolvedValueOnce({
        data: { token: 'docker-hub-token', expires_in: 3600 },
        status: 200,
        statusText: 'OK',
        headers: {},
      });

      // Mock registry API test
      httpClient.get.mockResolvedValueOnce({
        data: {},
        status: 200,
        statusText: 'OK',
        headers: {},
      });

      await provider.authenticate();

      expect(httpClient.get).toHaveBeenCalledWith(
        expect.stringContaining('auth.docker.io/token'),
        expect.any(Object)
      );
    });
  });

  describe('listTags', () => {
    it('should list tags for a package', async () => {
      // Mock authentication
      httpClient.get
        .mockResolvedValueOnce({
          data: { token: 'docker-hub-token', expires_in: 3600 },
          status: 200,
          statusText: 'OK',
          headers: {},
        })
        .mockResolvedValueOnce({
          data: {},
          status: 200,
          statusText: 'OK',
          headers: {},
        })
        .mockResolvedValueOnce({
          data: { tags: ['v1.0', 'v2.0', 'latest'] },
          status: 200,
          statusText: 'OK',
          headers: {},
        })
        // Mock getManifest calls for each tag
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
        })
        .mockResolvedValueOnce({
          data: JSON.stringify({
            schemaVersion: 2,
            mediaType: 'application/vnd.docker.distribution.manifest.v2+json',
            config: { digest: 'sha256:config3', size: 100 },
            layers: [],
          }),
          status: 200,
          statusText: 'OK',
          headers: { 'docker-content-digest': 'sha256:digest3' },
        });

      const tags = await provider.listTags('test-user/package1');

      expect(tags).toHaveLength(3);
      expect(tags[0].name).toBe('v1.0');
    });
  });

  describe('deleteTag', () => {
    it('should delete a tag', async () => {
      // Mock authentication
      httpClient.get
        .mockResolvedValueOnce({
          data: { token: 'docker-hub-token', expires_in: 3600 },
          status: 200,
          statusText: 'OK',
          headers: {},
        })
        .mockResolvedValueOnce({
          data: {},
          status: 200,
          statusText: 'OK',
          headers: {},
        })
        // Mock getManifest call (returns string)
        .mockResolvedValueOnce({
          data: JSON.stringify({
            schemaVersion: 2,
            mediaType: 'application/vnd.docker.distribution.manifest.v2+json',
            config: { digest: 'sha256:config1', size: 100 },
            layers: [],
          }),
          status: 200,
          statusText: 'OK',
          headers: { 'docker-content-digest': 'sha256:abc123' },
        });

      // Mock deleteManifest call
      httpClient.delete.mockResolvedValueOnce({
        data: undefined,
        status: 202,
        statusText: 'Accepted',
        headers: {},
      });

      await provider.deleteTag('test-user/package1', 'v1.0');

      expect(httpClient.delete).toHaveBeenCalled();
    });
  });

  describe('supportsFeature', () => {
    it('should report supported features', () => {
      expect(provider.supportsFeature('MULTI_ARCH')).toBe(true);
      expect(provider.supportsFeature('REFERRERS')).toBe(false);
    });
  });
});
