"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.validateRegistryType = validateRegistryType;
exports.validateProviderConfig = validateProviderConfig;
exports.validateCleanupConfig = validateCleanupConfig;
exports.parseOlderThan = parseOlderThan;
exports.normalizeRegistryUrl = normalizeRegistryUrl;
exports.extractHostname = extractHostname;
exports.matchRegistryUrl = matchRegistryUrl;
exports.expandPackages = expandPackages;
/**
 * Validate and parse registry type
 */
function validateRegistryType(type) {
    const validTypes = ['ghcr', 'gitea', 'docker-hub', 'docker', 'oci', 'auto'];
    if (!validTypes.includes(type)) {
        throw new Error(`Invalid registry-type: ${type}. Must be one of: ${validTypes.join(', ')}`);
    }
    return type;
}
/**
 * Validate provider configuration
 */
function validateProviderConfig(config) {
    if (!config.registryType) {
        throw new Error('registry-type is required');
    }
    const registryType = validateRegistryType(config.registryType);
    // Validate registry-url requirements
    if (registryType === 'gitea' || registryType === 'docker' || registryType === 'oci' || registryType === 'auto') {
        if (!config.registryUrl) {
            throw new Error(`registry-url is required when registry-type is ${registryType}`);
        }
    }
    // Validate authentication
    if (registryType === 'docker' || registryType === 'docker-hub') {
        if (!config.token && !config.username) {
            throw new Error(`Authentication required: provide either token or username/password for ${registryType}`);
        }
        if (config.username && !config.password) {
            throw new Error('registry-password is required when registry-username is provided');
        }
    }
    else if (registryType !== 'auto') {
        // For ghcr and gitea, token is typically required
        if (!config.token) {
            throw new Error(`token is required for registry-type: ${registryType}`);
        }
    }
    // Validate packages
    if (!config.packages || config.packages.length === 0) {
        if (!config.owner || !config.repository) {
            throw new Error('Either packages or owner/repository must be provided');
        }
    }
}
/**
 * Validate cleanup configuration
 */
function validateCleanupConfig(config) {
    if (config.keepNTagged !== undefined && config.keepNTagged < 0) {
        throw new Error('keep-n-tagged must be a non-negative number');
    }
    if (config.keepNUntagged !== undefined && config.keepNUntagged < 0) {
        throw new Error('keep-n-untagged must be a non-negative number');
    }
    if (config.retry !== undefined && config.retry < 0) {
        throw new Error('retry must be a non-negative number');
    }
    if (config.throttle !== undefined && config.throttle < 0) {
        throw new Error('throttle must be a non-negative number');
    }
    // Validate older-than format (e.g., "30d", "2w", "1m")
    if (config.olderThan) {
        const olderThanRegex = /^(\d+)([dwmy])$/i;
        if (!olderThanRegex.test(config.olderThan)) {
            throw new Error('older-than must be in format: <number><unit> (e.g., "30d", "2w", "1m", "1y")');
        }
    }
}
/**
 * Parse older-than string to Date
 */
function parseOlderThan(olderThan) {
    const regex = /^(\d+)([dwmy])$/i;
    const match = olderThan.match(regex);
    if (!match) {
        throw new Error(`Invalid older-than format: ${olderThan}`);
    }
    const value = parseInt(match[1], 10);
    const unit = match[2].toLowerCase();
    const now = new Date();
    let date;
    switch (unit) {
        case 'd':
            date = new Date(now.getTime() - value * 24 * 60 * 60 * 1000);
            break;
        case 'w':
            date = new Date(now.getTime() - value * 7 * 24 * 60 * 60 * 1000);
            break;
        case 'm':
            date = new Date(now.getTime() - value * 30 * 24 * 60 * 60 * 1000);
            break;
        case 'y':
            date = new Date(now.getTime() - value * 365 * 24 * 60 * 60 * 1000);
            break;
        default:
            throw new Error(`Unknown time unit: ${unit}`);
    }
    return date;
}
/**
 * Normalize registry URL (remove protocol, trailing slashes)
 */
function normalizeRegistryUrl(url) {
    // Remove protocol
    let normalized = url.replace(/^https?:\/\//, '');
    // Remove trailing slash
    normalized = normalized.replace(/\/$/, '');
    return normalized;
}
/**
 * Extract hostname from URL
 */
function extractHostname(url) {
    const normalized = normalizeRegistryUrl(url);
    const parts = normalized.split('/');
    return parts[0];
}
/**
 * Match URL against known registry URLs
 */
function matchRegistryUrl(url, knownUrls) {
    const hostname = extractHostname(url);
    for (const knownUrl of knownUrls) {
        const knownHostname = extractHostname(knownUrl);
        // Exact match
        if (hostname === knownHostname) {
            return true;
        }
        // Subdomain match (e.g., registry.example.com matches example.com)
        if (hostname.endsWith(`.${knownHostname}`)) {
            return true;
        }
    }
    return false;
}
/**
 * Expand package names with wildcards/regex
 */
function expandPackages(packages, allPackages, useRegex) {
    if (!packages || packages.length === 0) {
        return allPackages;
    }
    const expanded = [];
    for (const pattern of packages) {
        if (useRegex) {
            const regex = new RegExp(pattern);
            const matches = allPackages.filter(pkg => regex.test(pkg));
            expanded.push(...matches);
        }
        else {
            // Wildcard matching
            const wildcardRegex = new RegExp('^' + pattern.replace(/\*/g, '.*').replace(/\?/g, '.') + '$');
            const matches = allPackages.filter(pkg => wildcardRegex.test(pkg));
            expanded.push(...matches);
        }
    }
    return [...new Set(expanded)]; // Remove duplicates
}
//# sourceMappingURL=validation.js.map