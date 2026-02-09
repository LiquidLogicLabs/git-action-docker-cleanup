import * as core from '@actions/core';
import { getInputs } from './config';
import { HttpClient } from './utils/api';
import { createProvider } from './providers/factory';
import { CleanupEngine } from './cleanup/engine';

/**
 * Main entry point for the action
 */
async function run(): Promise<void> {
  try {
    const { providerConfig, cleanupConfig, packages, skipCertificateCheck, logger } = getInputs();

    if (skipCertificateCheck) {
      logger.warning('TLS certificate verification is disabled. This is a security risk and should only be used with trusted endpoints.');
    }

    // Initialize HTTP client
    const httpClient = new HttpClient(logger, {
      retry: cleanupConfig.retry,
      throttle: cleanupConfig.throttle,
      skipCertificateCheck,
    });

    // Create provider
    const provider = createProvider(logger, providerConfig, httpClient);

    // Authenticate
    logger.info('Authenticating with registry...');
    await provider.authenticate();

    // Create cleanup engine
    const engine = new CleanupEngine(provider, cleanupConfig, logger);

    // Run cleanup
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

    if (result.errors.length > 0 && !cleanupConfig.dryRun) {
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
