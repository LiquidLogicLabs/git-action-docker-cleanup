import * as core from '@actions/core';
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
import { Logger } from './logger';

export type ParsedInputs = {
  providerConfig: ProviderConfig;
  cleanupConfig: CleanupConfig;
  packages: string[];
  skipCertificateCheck: boolean;
  logger: Logger;
};

function parseBoolean(val?: string): boolean {
  return val?.toLowerCase() === 'true' || val === '1';
}

export function getInputs(): ParsedInputs {
  const registryType = validateRegistryType(core.getInput('registry-type', { required: true }));
  const registryUrl = core.getInput('registry-url');
  const registryUsername = core.getInput('registry-username');
  const registryPassword = core.getInput('registry-password');
  const token = core.getInput('token');

  const owner =
    core.getInput('owner') ||
    process.env.GITEA_ACTOR ||
    process.env.GITHUB_ACTOR ||
    process.env.GITHUB_REPOSITORY_OWNER ||
    '';

  const repository = core.getInput('repository');
  const packageInput = core.getInput('package');
  const packagesInput = core.getInput('packages');
  const expandPackages = core.getBooleanInput('expand-packages');
  const useRegex = core.getBooleanInput('use-regex');
  const dryRun = core.getBooleanInput('dry-run');
  const keepNTagged = core.getInput('keep-n-tagged') ? parseInt(core.getInput('keep-n-tagged'), 10) : undefined;
  const keepNUntagged = core.getInput('keep-n-untagged') ? parseInt(core.getInput('keep-n-untagged'), 10) : undefined;
  const deleteUntagged = core.getBooleanInput('delete-untagged');
  const deleteTags = core.getInput('delete-tags')
    ? core.getInput('delete-tags').split(',').map((t) => t.trim())
    : undefined;
  const excludeTags = core.getInput('exclude-tags')
    ? core.getInput('exclude-tags').split(',').map((t) => t.trim())
    : undefined;
  const olderThan = core.getInput('older-than');
  const deleteGhostImages = core.getBooleanInput('delete-ghost-images');
  const deletePartialImages = core.getBooleanInput('delete-partial-images');
  const deleteOrphanedImages = core.getBooleanInput('delete-orphaned-images');
  const validate = core.getBooleanInput('validate');
  const retry = parseInt(core.getInput('retry') || '3', 10);
  const throttle = parseInt(core.getInput('throttle') || '1000', 10);
  const skipCertificateCheck = core.getBooleanInput('skip-certificate-check');
  const verboseInput = core.getBooleanInput('verbose');

  const debugMode =
    (typeof core.isDebug === 'function' && core.isDebug()) ||
    parseBoolean(process.env.ACTIONS_STEP_DEBUG) ||
    parseBoolean(process.env.ACTIONS_RUNNER_DEBUG) ||
    parseBoolean(process.env.RUNNER_DEBUG);

  const verbose = verboseInput || debugMode;

  const logger = new Logger(verbose, debugMode);

  const packages: string[] = [];
  if (packageInput) {
    packages.push(packageInput);
  }
  if (packagesInput) {
    packages.push(...packagesInput.split(',').map((p) => p.trim()));
  }

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
    expandPackages,
    useRegex,
  };

  validateProviderConfig(providerConfig);
  validateCleanupConfig(cleanupConfig);

  return {
    providerConfig,
    cleanupConfig,
    packages,
    skipCertificateCheck,
    logger,
  };
}
