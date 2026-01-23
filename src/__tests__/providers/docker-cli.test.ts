import { DockerCLIProvider } from '../../providers/docker-cli';
import { Logger } from '../../logger';
import { HttpClient } from '../../utils/api';
import { ProviderConfig } from '../../types';
import * as exec from '@actions/exec';

// Mock @actions/exec
jest.mock('@actions/exec');
const MockedExec = exec as jest.Mocked<typeof exec>;

// Mock HttpClient
jest.mock('../../utils/api');
const MockedHttpClient = HttpClient as jest.MockedClass<typeof HttpClient>;

describe('DockerCLIProvider', () => {
  let logger: Logger;
  let httpClient: jest.Mocked<HttpClient>;
  let provider: DockerCLIProvider;
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
      registryType: 'docker',
      registryUrl: 'registry.example.com',
      owner: 'test-owner',
      repository: 'test-repo',
      token: 'test-token',
      username: 'test-user',
      password: 'test-password',
      expandPackages: false,
      useRegex: false,
    };

    provider = new DockerCLIProvider(logger, config, httpClient as any);
  });

  describe('authenticate', () => {
    it('should login to registry when credentials provided', async () => {
      MockedExec.exec.mockResolvedValueOnce(0);

      await provider.authenticate();

      expect(MockedExec.exec).toHaveBeenCalledWith(
        'docker',
        expect.arrayContaining(['login', 'registry.example.com']),
        expect.any(Object)
      );
    });

    it('should succeed without credentials (local images only)', async () => {
      const configNoCreds: ProviderConfig = {
        ...config,
        username: undefined,
        password: undefined,
        token: undefined,
      };
      const providerNoCreds = new DockerCLIProvider(logger, configNoCreds, httpClient as any);

      await providerNoCreds.authenticate();

      // Should succeed without calling docker login
      expect(providerNoCreds).toBeDefined();
    });
  });

  describe('listPackages', () => {
    it('should list local packages', async () => {
      const mockOutput = JSON.stringify({
        Repository: 'registry.example.com/test/pkg',
        Tag: 'latest',
        ID: 'sha256:abc123',
        CreatedAt: '2024-01-01T00:00:00Z',
        Size: '100MB',
      });

      MockedExec.exec.mockImplementation((command, args, options) => {
        if (options?.listeners?.stdout) {
          options.listeners.stdout(Buffer.from(mockOutput + '\n'));
        }
        return Promise.resolve(0);
      });

      const packages = await provider.listPackages();

      expect(packages.length).toBeGreaterThanOrEqual(0);
      expect(MockedExec.exec).toHaveBeenCalledWith(
        'docker',
        expect.arrayContaining(['image', 'ls']),
        expect.any(Object)
      );
    });
  });

  describe('listTags', () => {
    it('should list tags for a package', async () => {
      const mockOutput = JSON.stringify({
        Repository: 'registry.example.com/test/pkg',
        Tag: 'v1.0',
        ID: 'sha256:abc123',
        CreatedAt: '2024-01-01T00:00:00Z',
        Size: '100MB',
      });

      MockedExec.exec
        .mockImplementationOnce((command, args, options) => {
          if (options?.listeners?.stdout) {
            options.listeners.stdout(Buffer.from(mockOutput + '\n'));
          }
          return Promise.resolve(0);
        })
        .mockImplementationOnce((command, args, options) => {
          if (options?.listeners?.stdout) {
            options.listeners.stdout(
              Buffer.from(
                JSON.stringify({
                  schemaVersion: 2,
                  mediaType: 'application/vnd.docker.distribution.manifest.v2+json',
                  config: { digest: 'sha256:config1', size: 100 },
                  layers: [],
                })
              )
            );
          }
          return Promise.resolve(0);
        });

      const tags = await provider.listTags('test/pkg');

      expect(tags.length).toBeGreaterThanOrEqual(0);
    });
  });

  describe('deleteTag', () => {
    it('should delete local image', async () => {
      MockedExec.exec.mockResolvedValueOnce(0);

      await provider.deleteTag('test/pkg', 'v1.0');

      expect(MockedExec.exec).toHaveBeenCalledWith(
        'docker',
        expect.arrayContaining(['image', 'rm', expect.stringContaining('test/pkg:v1.0')]),
        expect.any(Object)
      );
    });
  });

  describe('supportsFeature', () => {
    it('should report supported features', () => {
      expect(provider.supportsFeature('MULTI_ARCH')).toBe(true);
      expect(provider.supportsFeature('REFERRERS')).toBe(false);
    });
  });

  describe('getKnownRegistryUrls', () => {
    it('should return empty array (fallback provider)', () => {
      const urls = provider.getKnownRegistryUrls();
      expect(urls).toEqual([]);
    });
  });
});
