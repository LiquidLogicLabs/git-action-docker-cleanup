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
exports.Logger = void 0;
const core = __importStar(require("@actions/core"));
/**
 * Logger utility with verbose/debug support
 * Provides consistent logging across the action
 */
class Logger {
    verbose;
    debugMode;
    constructor(verbose = false, debugMode = false) {
        this.verbose = verbose || debugMode; // debug implies verbose
        this.debugMode = debugMode;
    }
    /**
     * Log an info message
     */
    info(message) {
        core.info(message);
    }
    /**
     * Log a warning message
     */
    warning(message) {
        core.warning(message);
    }
    /**
     * Log an error message
     */
    error(message) {
        core.error(message);
    }
    /**
     * Log a verbose info message - only shown when verbose is true
     */
    verboseInfo(message) {
        if (this.verbose) {
            core.info(message);
        }
    }
    /**
     * Log a debug message - uses core.info() with [DEBUG] prefix when debugMode is true,
     * falls back to core.debug() otherwise (for when ACTIONS_STEP_DEBUG is set at workflow level)
     */
    debug(message) {
        if (this.debugMode) {
            core.info(`[DEBUG] ${message}`);
        }
        else {
            core.debug(message);
        }
    }
    /**
     * Check if verbose logging is enabled
     */
    isVerbose() {
        return this.verbose;
    }
    /**
     * Check if debug mode is enabled
     */
    isDebug() {
        return this.debugMode;
    }
}
exports.Logger = Logger;
//# sourceMappingURL=logger.js.map