import * as core from '@actions/core';

/**
 * Logger utility with verbose/debug support
 * Provides consistent logging across the action
 */
export class Logger {
  public readonly verbose: boolean;
  public readonly debugMode: boolean;

  constructor(verbose: boolean = false, debugMode: boolean = false) {
    this.verbose = verbose || debugMode; // debug implies verbose
    this.debugMode = debugMode;
  }

  /**
   * Log an info message
   */
  info(message: string): void {
    core.info(message);
  }

  /**
   * Log a warning message
   */
  warning(message: string): void {
    core.warning(message);
  }

  /**
   * Log an error message
   */
  error(message: string): void {
    core.error(message);
  }

  /**
   * Log a verbose info message - only shown when verbose is true
   */
  verboseInfo(message: string): void {
    if (this.verbose) {
      core.info(message);
    }
  }

  /**
   * Log a debug message - uses core.info() with [DEBUG] prefix when debugMode is true,
   * falls back to core.debug() otherwise (for when ACTIONS_STEP_DEBUG is set at workflow level)
   */
  debug(message: string): void {
    if (this.debugMode) {
      core.info(`[DEBUG] ${message}`);
    } else {
      core.debug(message);
    }
  }

  /**
   * Check if verbose logging is enabled
   */
  isVerbose(): boolean {
    return this.verbose;
  }

  /**
   * Check if debug mode is enabled
   */
  isDebug(): boolean {
    return this.debugMode;
  }
}
