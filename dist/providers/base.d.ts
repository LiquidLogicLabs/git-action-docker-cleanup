import { IRegistryProvider, Package, Manifest, Tag, Referrer, RegistryFeature, ProviderConfig, OCIManifest, OCIIndex } from '../types';
import { Logger } from '../logger';
import { HttpClient } from '../utils/api';
/**
 * Base provider class with common OCI Registry V2 API utilities
 */
export declare abstract class BaseProvider implements IRegistryProvider {
    protected readonly logger: Logger;
    protected readonly config: ProviderConfig;
    protected readonly httpClient: HttpClient;
    protected readonly registryUrl: string;
    protected authenticated: boolean;
    constructor(logger: Logger, config: ProviderConfig, httpClient: HttpClient);
    /**
     * Normalize registry URL
     */
    protected normalizeRegistryUrl(url: string): string;
    /**
     * Get OCI Registry V2 API base URL
     */
    protected getRegistryApiUrl(): string;
    /**
     * Get manifest URL
     */
    protected getManifestUrl(packageName: string, reference: string): string;
    /**
     * Get tags URL
     */
    protected getTagsUrl(packageName: string): string;
    /**
     * Get referrers URL (OCI referrers API)
     */
    protected getReferrersUrl(packageName: string, digest: string): string;
    /**
     * Get blob URL
     */
    protected getBlobUrl(packageName: string, digest: string): string;
    /**
     * Parse OCI manifest
     */
    protected parseOCIManifest(data: unknown): OCIManifest | OCIIndex;
    /**
     * Check if manifest is multi-arch (index)
     */
    protected isMultiArchManifest(manifest: OCIManifest | OCIIndex): manifest is OCIIndex;
    /**
     * Convert OCI manifest to internal Manifest format
     */
    protected convertToManifest(digest: string, ociManifest: OCIManifest | OCIIndex, createdAt?: Date): Manifest;
    /**
     * Get authentication headers
     */
    protected abstract getAuthHeaders(): Record<string, string>;
    /**
     * Abstract methods that must be implemented by subclasses
     */
    abstract authenticate(): Promise<void>;
    abstract listPackages(): Promise<Package[]>;
    abstract getPackageManifests(packageName: string): Promise<Manifest[]>;
    abstract listTags(packageName: string): Promise<Tag[]>;
    abstract deleteTag(packageName: string, tag: string): Promise<void>;
    abstract getManifest(packageName: string, reference: string): Promise<Manifest>;
    abstract deleteManifest(packageName: string, digest: string): Promise<void>;
    abstract getReferrers(packageName: string, digest: string): Promise<Referrer[]>;
    abstract supportsFeature(feature: RegistryFeature): boolean;
    abstract getKnownRegistryUrls(): string[];
}
//# sourceMappingURL=base.d.ts.map