import { GenericOCIProvider } from '../../providers/generic-oci';
import { Logger } from '../../logger';
import { HttpClient } from '../../utils/api';
import { ProviderConfig } from '../../types';

// Mock HttpClient
jest.mock('../../utils/api');
const MockedHttpClient = HttpClient as jest.MockedClass<typeof HttpClient>;

describe('GenericOCIProvider', () => {
  let logger: Logger;
  let httpClient: jest.Mocked<HttpClient>;
  let provider: GenericOCIProvider;
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
      registryType: 'oci',
      registryUrl: 'https://registry.example.com',
      owner: 'test-owner',
      repository: 'test-repo',
      token: 'test-token',
      expandPackages: false,
      useRegex: false,
    };

    provider = new GenericOCIProvider(logger, config, httpClient as any);
  });

  describe('constructor', () => {
    it('should require authentication', () => {
      const invalidConfig: ProviderConfig = {
        registryType: 'oci',
        registryUrl: 'https://registry.example.com',
        expandPackages: false,
        useRegex: false,
      };

      expect(() => new GenericOCIProvider(logger, invalidConfig, httpClient as any)).toThrow(
        'Authentication required'
      );
    });

    it('should require password when username is provided', () => {
      const invalidConfig: ProviderConfig = {
        registryType: 'oci',
        registryUrl: 'https://registry.example.com',
        username: 'test-user',
        expandPackages: false,
        useRegex: false,
      };

      expect(() => new GenericOCIProvider(logger, invalidConfig, httpClient as any)).toThrow(
        'registry-password is required'
      );
    });
  });

  describe('authenticate', () => {
    it('should authenticate with Bearer token', async () => {
      httpClient.get.mockResolvedValueOnce({
        data: {},
        status: 200,
        statusText: 'OK',
        headers: {},
      });

      await provider.authenticate();

      expect(httpClient.get).toHaveBeenCalledWith(
        expect.stringContaining('/v2/'),
        expect.objectContaining({
          Authorization: 'Bearer test-token',
        })
      );
    });

    it('should authenticate with Basic auth', async () => {
      const basicConfig: ProviderConfig = {
        ...config,
        token: undefined,
        username: 'test-user',
        password: 'test-password',
      };
      const basicProvider = new GenericOCIProvider(logger, basicConfig, httpClient as any);

      httpClient.get.mockResolvedValueOnce({
        data: {},
        status: 200,
        statusText: 'OK',
        headers: {},
      });

      await basicProvider.authenticate();

      expect(httpClient.get).toHaveBeenCalledWith(
        expect.stringContaining('/v2/'),
        expect.objectContaining({
          Authorization: expect.stringContaining('Basic'),
        })
      );
    });

    it('should accept 401/403 as valid authentication responses', async () => {
      httpClient.get.mockResolvedValueOnce({
        data: {},
        status: 401,
        statusText: 'Unauthorized',
        headers: {},
      });

      await provider.authenticate();

      expect(provider).toBeDefined();
    });
  });

  describe('listPackages', () => {
    it('should return empty array with warning', async () => {
      httpClient.get.mockResolvedValueOnce({
        data: {},
        status: 200,
        statusText: 'OK',
        headers: {},
      });

      const packages = await provider.listPackages();

      expect(packages).toEqual([]);
    });
  });

  describe('listTags', () => {
    it('should list tags for a package', async () => {
      httpClient.get
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

      const tags = await provider.listTags('test/pkg');

      expect(tags).toHaveLength(3);
      expect(tags[0].name).toBe('v1.0');
    });
  });

  describe('deleteTag', () => {
    it('should delete tag by deleting manifest', async () => {
      httpClient.get
        .mockResolvedValueOnce({
          data: {},
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
        });

      httpClient.delete.mockResolvedValueOnce({
        data: undefined,
        status: 202,
        statusText: 'Accepted',
        headers: {},
      });

      await provider.deleteTag('test/pkg', 'v1.0');

      expect(httpClient.delete).toHaveBeenCalled();
    });
  });

  describe('getReferrers', () => {
    it('should get referrers for a manifest', async () => {
      httpClient.get
        .mockResolvedValueOnce({
          data: {},
          status: 200,
          statusText: 'OK',
          headers: {},
        })
        .mockResolvedValueOnce({
          data: {
            manifests: [
              {
                digest: 'sha256:ref1',
                mediaType: 'application/vnd.oci.artifact.manifest.v1+json',
                size: 100,
                artifactType: 'application/vnd.example.attestation',
              },
            ],
          },
          status: 200,
          statusText: 'OK',
          headers: {},
        });

      const referrers = await provider.getReferrers('test/pkg', 'sha256:digest1');

      expect(referrers).toHaveLength(1);
      expect(referrers[0].digest).toBe('sha256:ref1');
    });
  });

  describe('supportsFeature', () => {
    it('should report supported features', () => {
      expect(provider.supportsFeature('MULTI_ARCH')).toBe(true);
      expect(provider.supportsFeature('REFERRERS')).toBe(true);
      expect(provider.supportsFeature('ATTESTATION')).toBe(true);
      expect(provider.supportsFeature('COSIGN')).toBe(true);
    });
  });

  describe('getKnownRegistryUrls', () => {
    it('should return empty array', () => {
      const urls = provider.getKnownRegistryUrls();
      expect(urls).toEqual([]);
    });
  });
});
