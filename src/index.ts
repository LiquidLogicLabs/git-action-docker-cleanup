import * as core from '@actions/core';
import { Logger } from './logger';
import { HttpClient } from './utils/api';
import { createProvider } from './providers/factory';
import { CleanupEngine } from './cleanup/engine';
import {
  ProviderConfig,
  CleanupConfig,
  RegistryType,
} from './types';
import {
  validateProviderConfig,
  validateCleanupConfig,
  validateRegistryType,
} from './utils/validation';

/**
 * Main entry point for the action
 */
async function run(): Promise<void> {
  try {
    // Parse inputs
    const registryType = validateRegistryType(core.getInput('registry-type', { required: true }));
    const registryUrl = core.getInput('registry-url');
    const registryUsername = core.getInput('registry-username');
    const registryPassword = core.getInput('registry-password');
    const token = core.getInput('token');
    const owner = core.getInput('owner');
    const repository = core.getInput('repository');
    const packageInput = core.getInput('package');
    const packagesInput = core.getInput('packages');
    const expandPackages = core.getBooleanInput('expand-packages');
    const useRegex = core.getBooleanInput('use-regex');
    const dryRun = core.getBooleanInput('dry-run');
    const keepNTagged = core.getInput('keep-n-tagged') ? parseInt(core.getInput('keep-n-tagged'), 10) : undefined;
    const keepNUntagged = core.getInput('keep-n-untagged') ? parseInt(core.getInput('keep-n-untagged'), 10) : undefined;
    const deleteUntagged = core.getBooleanInput('delete-untagged');
    const deleteTags = core.getInput('delete-tags') ? core.getInput('delete-tags').split(',').map(t => t.trim()) : undefined;
    const excludeTags = core.getInput('exclude-tags') ? core.getInput('exclude-tags').split(',').map(t => t.trim()) : undefined;
    const olderThan = core.getInput('older-than');
    const deleteGhostImages = core.getBooleanInput('delete-ghost-images');
    const deletePartialImages = core.getBooleanInput('delete-partial-images');
    const deleteOrphanedImages = core.getBooleanInput('delete-orphaned-images');
    const validate = core.getBooleanInput('validate');
    const retry = parseInt(core.getInput('retry') || '3', 10);
    const throttle = parseInt(core.getInput('throttle') || '1000', 10);
    const verbose = core.getBooleanInput('verbose');

    // Parse package names
    const packages: string[] = [];
    if (packageInput) {
      packages.push(packageInput);
    }
    if (packagesInput) {
      packages.push(...packagesInput.split(',').map(p => p.trim()));
    }

    // Build configuration
    const providerConfig: ProviderConfig = {
      registryType: registryType as RegistryType,
      registryUrl,
      token,
      username: registryUsername,
      password: registryPassword,
      owner,
      repository,
      packages: packages.length > 0 ? packages : undefined,
      expandPackages,
      useRegex,
    };

    const cleanupConfig: CleanupConfig = {
      dryRun,
      keepNTagged,
      keepNUntagged,
      deleteUntagged,
      deleteTags,
      excludeTags,
      olderThan,
      deleteGhostImages,
      deletePartialImages,
      deleteOrphanedImages,
      validate,
      retry,
      throttle,
      verbose,
    };

    // Validate configuration
    validateProviderConfig(providerConfig);
    validateCleanupConfig(cleanupConfig);

    // Initialize logger
    const logger = new Logger(verbose);

    // Initialize HTTP client
    const httpClient = new HttpClient(logger, {
      retry,
      throttle,
    });

    // Create provider
    logger.info(`Creating ${registryType} provider...`);
    const provider = createProvider(logger, providerConfig, httpClient);

    // Authenticate
    logger.info('Authenticating with registry...');
    await provider.authenticate();

    // Create cleanup engine
    const engine = new CleanupEngine(provider, cleanupConfig, logger);

    // Run cleanup
    logger.info('Starting cleanup process...');
    const result = await engine.run(packages);

    // Set outputs
    core.setOutput('deleted-count', result.deletedCount);
    core.setOutput('kept-count', result.keptCount);
    core.setOutput('deleted-tags', result.deletedTags.join(','));
    core.setOutput('kept-tags', result.keptTags.join(','));

    // Log results
    logger.info(`Cleanup complete: ${result.deletedCount} deleted, ${result.keptCount} kept`);
    
    if (result.errors.length > 0) {
      logger.warning(`Encountered ${result.errors.length} errors during cleanup`);
      for (const error of result.errors) {
        logger.warning(`  - ${error}`);
      }
    }

    if (result.errors.length > 0 && !dryRun) {
      core.setFailed(`Cleanup completed with ${result.errors.length} errors`);
    }
  } catch (error) {
    if (error instanceof Error) {
      core.setFailed(error.message);
    } else {
      core.setFailed('Unknown error occurred');
    }
  }
}

// Run the action
run();
