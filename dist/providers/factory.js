"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createProvider = createProvider;
const ghcr_1 = require("./ghcr");
const gitea_1 = require("./gitea");
const dockerhub_1 = require("./dockerhub");
const docker_cli_1 = require("./docker-cli");
const generic_oci_1 = require("./generic-oci");
const validation_1 = require("../utils/validation");
/**
 * Create provider instance based on registry type
 */
function createProvider(logger, config, httpClient) {
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
            return new ghcr_1.GHCRProvider(logger, config, httpClient);
        case 'gitea':
            return new gitea_1.GiteaProvider(logger, config, httpClient);
        case 'docker-hub':
            return new dockerhub_1.DockerHubProvider(logger, config, httpClient);
        case 'docker':
            return new docker_cli_1.DockerCLIProvider(logger, config, httpClient);
        case 'oci':
            return new generic_oci_1.GenericOCIProvider(logger, config, httpClient);
        default:
            throw new Error(`Unknown registry type: ${registryType}`);
    }
}
/**
 * Auto-detect registry type based on URL
 */
function detectRegistryType(registryUrl, logger) {
    // Create temporary providers to check known URLs
    const providers = [
        { type: 'ghcr', knownUrls: ['ghcr.io'] },
        { type: 'docker-hub', knownUrls: ['docker.io', 'registry-1.docker.io', 'hub.docker.com'] },
        { type: 'gitea', knownUrls: [] }, // Gitea is self-hosted, no default URLs
    ];
    // Check each provider's known URLs
    for (const provider of providers) {
        if (provider.knownUrls.length > 0 && (0, validation_1.matchRegistryUrl)(registryUrl, provider.knownUrls)) {
            logger.debug(`Matched registry URL ${registryUrl} to ${provider.type} provider`);
            return provider.type;
        }
    }
    // No match found, fall back to generic OCI provider
    logger.debug(`No provider match found for ${registryUrl}, falling back to generic OCI provider`);
    return 'oci';
}
//# sourceMappingURL=factory.js.map