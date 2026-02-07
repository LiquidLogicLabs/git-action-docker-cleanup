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
exports.getInputs = getInputs;
const core = __importStar(require("@actions/core"));
const validation_1 = require("./utils/validation");
function getInputs() {
    const registryType = (0, validation_1.validateRegistryType)(core.getInput('registryType', { required: true }));
    const registryUrl = core.getInput('registryUrl');
    const registryUsername = core.getInput('registryUsername');
    const registryPassword = core.getInput('registryPassword');
    const token = core.getInput('token');
    const owner = core.getInput('owner') ||
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
    const packages = [];
    if (packageInput) {
        packages.push(packageInput);
    }
    if (packagesInput) {
        packages.push(...packagesInput.split(',').map((p) => p.trim()));
    }
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
        expandPackages,
        useRegex,
    };
    (0, validation_1.validateProviderConfig)(providerConfig);
    (0, validation_1.validateCleanupConfig)(cleanupConfig);
    return {
        providerConfig,
        cleanupConfig,
        packages,
        skipCertificateCheck,
    };
}
//# sourceMappingURL=config.js.map