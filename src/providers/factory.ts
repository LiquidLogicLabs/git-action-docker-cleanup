import { IRegistryProvider, RegistryType, ProviderConfig } from '../types';
import { Logger } from '../logger';
import { HttpClient } from '../utils/api';
import { GHCRProvider } from './ghcr';
import { GiteaProvider } from './gitea';
import { DockerHubProvider } from './dockerhub';
import { DockerCLIProvider } from './docker-cli';
import { matchRegistryUrl } from '../utils/validation';

/**
 * Create provider instance based on registry type
 */
export function createProvider(
  logger: Logger,
  config: ProviderConfig,
  httpClient: HttpClient
): IRegistryProvider {
  let registryType = config.registryType;

  // Handle auto-detection
  if (registryType === 'auto') {
    if (!config.registryUrl) {
      throw new Error('registry-url is required when registry-type is auto');
    }

    registryType = detectRegistryType(config.registryUrl, logger);
    logger.info(`Auto-detected registry type: ${registryType} for URL: ${config.registryUrl}`);
  }

  // Create provider based on type
  switch (registryType) {
    case 'ghcr':
      return new GHCRProvider(logger, config, httpClient);
    case 'gitea':
      return new GiteaProvider(logger, config, httpClient);
    case 'docker-hub':
      return new DockerHubProvider(logger, config, httpClient);
    case 'docker':
      return new DockerCLIProvider(logger, config, httpClient);
    default:
      throw new Error(`Unknown registry type: ${registryType}`);
  }
}

/**
 * Auto-detect registry type based on URL
 */
function detectRegistryType(registryUrl: string, logger: Logger): RegistryType {
  // Create temporary providers to check known URLs
  const providers: Array<{ type: RegistryType; knownUrls: string[] }> = [
    { type: 'ghcr', knownUrls: ['ghcr.io'] },
    { type: 'docker-hub', knownUrls: ['docker.io', 'registry-1.docker.io', 'hub.docker.com'] },
    { type: 'gitea', knownUrls: [] }, // Gitea is self-hosted, no default URLs
  ];

  // Check each provider's known URLs
  for (const provider of providers) {
    if (provider.knownUrls.length > 0 && matchRegistryUrl(registryUrl, provider.knownUrls)) {
      logger.debug(`Matched registry URL ${registryUrl} to ${provider.type} provider`);
      return provider.type;
    }
  }

  // No match found, fall back to Docker CLI provider
  logger.debug(`No provider match found for ${registryUrl}, falling back to Docker CLI provider`);
  return 'docker';
}
