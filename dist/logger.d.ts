/**
 * Logger utility with verbose/debug support
 * Provides consistent logging across the action
 */
export declare class Logger {
    readonly verbose: boolean;
    readonly debugMode: boolean;
    constructor(verbose?: boolean, debugMode?: boolean);
    /**
     * Log an info message
     */
    info(message: string): void;
    /**
     * Log a warning message
     */
    warning(message: string): void;
    /**
     * Log an error message
     */
    error(message: string): void;
    /**
     * Log a verbose info message - only shown when verbose is true
     */
    verboseInfo(message: string): void;
    /**
     * Log a debug message - uses core.info() with [DEBUG] prefix when debugMode is true,
     * falls back to core.debug() otherwise (for when ACTIONS_STEP_DEBUG is set at workflow level)
     */
    debug(message: string): void;
    /**
     * Check if verbose logging is enabled
     */
    isVerbose(): boolean;
    /**
     * Check if debug mode is enabled
     */
    isDebug(): boolean;
}
