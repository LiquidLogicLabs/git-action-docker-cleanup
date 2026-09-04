import { RegistryType, ProviderConfig, CleanupConfig } from '../types';
/**
 * Reject a value that `docker` would read as an OPTION rather than as a value.
 *
 * Passing an argv array stops the SHELL from interpreting a value. It does NOT stop the
 * spawned program's own option parser: a leading "-" is read as an option wherever it
 * appears in argv. The proven form of this bug is git, where
 * `git push --receive-pack=<cmd>` executes <cmd>; docker has the same shape, so a hostile
 * value lands in an option slot instead of the value slot the code intended.
 *
 * Registry hosts, usernames, package names and tags never legitimately begin with "-",
 * so this guard costs nothing and is applied at the entry point, before any spawn.
 */
export declare function assertNotOptionLike(value: string | undefined, label: string): void;
/**
 * Validate and parse registry type
 */
export declare function validateRegistryType(type: string): RegistryType;
/**
 * Validate provider configuration
 */
export declare function validateProviderConfig(config: Partial<ProviderConfig>): void;
/**
 * Validate cleanup configuration
 */
export declare function validateCleanupConfig(config: Partial<CleanupConfig>): void;
/**
 * Parse older-than string to Date
 */
export declare function parseOlderThan(olderThan: string): Date;
/**
 * Normalize registry URL (remove protocol, trailing slashes)
 */
export declare function normalizeRegistryUrl(url: string): string;
/**
 * Extract hostname from URL
 */
export declare function extractHostname(url: string): string;
/**
 * Match URL against known registry URLs
 */
export declare function matchRegistryUrl(url: string, knownUrls: string[]): boolean;
/**
 * Expand package names with wildcards/regex
 */
export declare function expandPackages(packages: string[], allPackages: string[], useRegex: boolean): string[];
//# sourceMappingURL=validation.d.ts.map