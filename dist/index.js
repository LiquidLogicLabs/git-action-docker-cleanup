"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const core = __importStar(require("@actions/core"));
const logger_1 = require("./logger");
const api_1 = require("./utils/api");
const factory_1 = require("./providers/factory");
const engine_1 = require("./cleanup/engine");
const validation_1 = require("./utils/validation");
/**
 * Main entry point for the action
 */
async function run() {
    try {
        // Parse inputs
        const registryType = (0, validation_1.validateRegistryType)(core.getInput('registry-type', { required: true }));
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
        const packages = [];
        if (packageInput) {
            packages.push(packageInput);
        }
        if (packagesInput) {
            packages.push(...packagesInput.split(',').map(p => p.trim()));
        }
        // Build configuration
        const providerConfig = {
            registryType: registryType,
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
        const cleanupConfig = {
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
        (0, validation_1.validateProviderConfig)(providerConfig);
        (0, validation_1.validateCleanupConfig)(cleanupConfig);
        // Initialize logger
        const logger = new logger_1.Logger(verbose);
        // Initialize HTTP client
        const httpClient = new api_1.HttpClient(logger, {
            retry,
            throttle,
        });
        // Create provider
        logger.info(`Creating ${registryType} provider...`);
        const provider = (0, factory_1.createProvider)(logger, providerConfig, httpClient);
        // Authenticate
        logger.info('Authenticating with registry...');
        await provider.authenticate();
        // Create cleanup engine
        const engine = new engine_1.CleanupEngine(provider, cleanupConfig, logger);
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
    }
    catch (error) {
        if (error instanceof Error) {
            core.setFailed(error.message);
        }
        else {
            core.setFailed('Unknown error occurred');
        }
    }
}
// Run the action
run();
//# sourceMappingURL=index.js.map