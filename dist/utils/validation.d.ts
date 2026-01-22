import { RegistryType, ProviderConfig, CleanupConfig } from '../types';
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