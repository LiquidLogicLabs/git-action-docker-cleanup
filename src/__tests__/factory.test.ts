import { createProvider } from '../providers/factory';
import { Logger } from '../logger';
import { HttpClient } from '../utils/api';
import { GHCRProvider } from '../providers/ghcr';
import { GiteaProvider } from '../providers/gitea';
import { DockerHubProvider } from '../providers/dockerhub';
import { DockerCLIProvider } from '../providers/docker-cli';
import { GenericOCIProvider } from '../providers/generic-oci';
import { ProviderConfig } from '../types';

// Mock providers
jest.mock('../providers/ghcr');
jest.mock('../providers/gitea');
jest.mock('../providers/dockerhub');
jest.mock('../providers/docker-cli');
jest.mock('../providers/generic-oci');

describe('Provider Factory', () => {
  let logger: Logger;
  let httpClient: HttpClient;

  beforeEach(() => {
    jest.clearAllMocks();
    logger = new Logger(false);
    httpClient = new HttpClient(logger);
  });

  describe('createProvider', () => {
    it('should create GHCR provider', () => {
      const config: ProviderConfig = {
        registryType: 'ghcr',
        registryUrl: 'ghcr.io',
        owner: 'test-owner',
        repository: 'test-repo',
        token: 'test-token',
        expandPackages: false,
        useRegex: false,
      };

      createProvider(logger, config, httpClient);

      expect(GHCRProvider).toHaveBeenCalledWith(logger, config, httpClient);
    });

    it('should create Gitea provider', () => {
      const config: ProviderConfig = {
        registryType: 'gitea',
        registryUrl: 'https://gitea.example.com',
        owner: 'test-owner',
        repository: 'test-repo',
        token: 'test-token',
        expandPackages: false,
        useRegex: false,
      };

      createProvider(logger, config, httpClient);

      expect(GiteaProvider).toHaveBeenCalledWith(logger, config, httpClient);
    });

    it('should create Docker Hub provider', () => {
      const config: ProviderConfig = {
        registryType: 'docker-hub',
        registryUrl: 'docker.io',
        owner: 'test-owner',
        repository: 'test-repo',
        token: 'test-token',
        username: 'test-user',
        password: 'test-password',
        expandPackages: false,
        useRegex: false,
      };

      createProvider(logger, config, httpClient);

      expect(DockerHubProvider).toHaveBeenCalledWith(logger, config, httpClient);
    });

    it('should create Docker CLI provider', () => {
      const config: ProviderConfig = {
        registryType: 'docker',
        registryUrl: 'registry.example.com',
        owner: 'test-owner',
        repository: 'test-repo',
        token: 'test-token',
        expandPackages: false,
        useRegex: false,
      };

      createProvider(logger, config, httpClient);

      expect(DockerCLIProvider).toHaveBeenCalledWith(logger, config, httpClient);
    });

    it('should auto-detect GHCR from URL', () => {
      const config: ProviderConfig = {
        registryType: 'auto',
        registryUrl: 'ghcr.io',
        owner: 'test-owner',
        repository: 'test-repo',
        token: 'test-token',
        expandPackages: false,
        useRegex: false,
      };

      createProvider(logger, config, httpClient);

      expect(GHCRProvider).toHaveBeenCalled();
    });

    it('should auto-detect Docker Hub from URL', () => {
      const config: ProviderConfig = {
        registryType: 'auto',
        registryUrl: 'docker.io',
        owner: 'test-owner',
        repository: 'test-repo',
        token: 'test-token',
        username: 'test-user',
        password: 'test-password',
        expandPackages: false,
        useRegex: false,
      };

      createProvider(logger, config, httpClient);

      expect(DockerHubProvider).toHaveBeenCalled();
    });

    it('should fall back to Generic OCI for unknown URLs', () => {
      const config: ProviderConfig = {
        registryType: 'auto',
        registryUrl: 'unknown-registry.com',
        owner: 'test-owner',
        repository: 'test-repo',
        token: 'test-token',
        expandPackages: false,
        useRegex: false,
      };

      createProvider(logger, config, httpClient);

      expect(GenericOCIProvider).toHaveBeenCalled();
    });

    it('should create Generic OCI provider', () => {
      const config: ProviderConfig = {
        registryType: 'oci',
        registryUrl: 'https://registry.example.com',
        owner: 'test-owner',
        repository: 'test-repo',
        token: 'test-token',
        expandPackages: false,
        useRegex: false,
      };

      createProvider(logger, config, httpClient);

      expect(GenericOCIProvider).toHaveBeenCalledWith(logger, config, httpClient);
    });

    it('should throw error for invalid registry type', () => {
      const config: ProviderConfig = {
        registryType: 'invalid' as any,
        registryUrl: 'example.com',
        owner: 'test-owner',
        repository: 'test-repo',
        token: 'test-token',
        expandPackages: false,
        useRegex: false,
      };

      expect(() => createProvider(logger, config, httpClient)).toThrow('Unknown registry type');
    });

    it('should throw error for auto without registry-url', () => {
      const config: ProviderConfig = {
        registryType: 'auto',
        registryUrl: undefined,
        owner: 'test-owner',
        repository: 'test-repo',
        token: 'test-token',
        expandPackages: false,
        useRegex: false,
      };

      expect(() => createProvider(logger, config, httpClient)).toThrow('registry-url is required');
    });
  });
});
