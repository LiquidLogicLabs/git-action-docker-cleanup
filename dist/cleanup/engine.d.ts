import { IRegistryProvider, CleanupConfig, CleanupResult } from '../types';
import { Logger } from '../logger';
/**
 * Cleanup engine that orchestrates the cleanup process
 */
export declare class CleanupEngine {
    private readonly provider;
    private readonly config;
    private readonly logger;
    private readonly filter;
    private allDiscoveredImages;
    constructor(provider: IRegistryProvider, config: CleanupConfig, logger: Logger);
    /**
     * Run the cleanup process
     */
    run(packageNames: string[]): Promise<CleanupResult>;
    /**
     * Discovery phase: List packages and get all images
     */
    private discoverImages;
    /**
     * Filtering phase: Apply all filters
     */
    private filterImages;
    /**
     * Deletion phase: Delete images
     */
    private deleteImages;
    /**
     * Check if excluded tags exist for a manifest
     */
    private hasExcludedTagsForManifest;
    /**
     * Check if manifest can be safely deleted (no excluded tags exist)
     */
    private canDeleteManifest;
    /**
     * Validation phase: Validate multi-arch images
     */
    private validateImages;
}
//# sourceMappingURL=engine.d.ts.map