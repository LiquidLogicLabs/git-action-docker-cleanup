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

export type ParsedInputs = {
  providerConfig: ProviderConfig;
  cleanupConfig: CleanupConfig;
  packages: string[];
  skipCertificateCheck: boolean;
};

export function getInputs(): ParsedInputs {
  const registryType = validateRegistryType(core.getInput('registryType', { required: true }));
  const registryUrl = core.getInput('registryUrl');
  const registryUsername = core.getInput('registryUsername');
  const registryPassword = core.getInput('registryPassword');
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
  const expandPackages = core.getBooleanInput('expandPackages');
  const useRegex = core.getBooleanInput('useRegex');
  const dryRun = core.getBooleanInput('dryRun');
  const keepNTagged = core.getInput('keepNTagged') ? parseInt(core.getInput('keepNTagged'), 10) : undefined;
  const keepNUntagged = core.getInput('keepNUntagged') ? parseInt(core.getInput('keepNUntagged'), 10) : undefined;
  const deleteUntagged = core.getBooleanInput('deleteUntagged');
  const deleteTags = core.getInput('deleteTags')
    ? core.getInput('deleteTags').split(',').map((t) => t.trim())
    : undefined;
  const excludeTags = core.getInput('excludeTags')
    ? core.getInput('excludeTags').split(',').map((t) => t.trim())
    : undefined;
  const olderThan = core.getInput('olderThan');
  const deleteGhostImages = core.getBooleanInput('deleteGhostImages');
  const deletePartialImages = core.getBooleanInput('deletePartialImages');
  const deleteOrphanedImages = core.getBooleanInput('deleteOrphanedImages');
  const validate = core.getBooleanInput('validate');
  const retry = parseInt(core.getInput('retry') || '3', 10);
  const throttle = parseInt(core.getInput('throttle') || '1000', 10);
  const skipCertificateCheck = core.getBooleanInput('skipCertificateCheck');
  const verboseInput = core.getBooleanInput('verbose');
  const envStepDebug = (process.env.ACTIONS_STEP_DEBUG || '').toLowerCase();
  const stepDebugEnabled = core.isDebug() || envStepDebug === 'true' || envStepDebug === '1';
  const verbose = verboseInput || stepDebugEnabled;

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
  };
}
