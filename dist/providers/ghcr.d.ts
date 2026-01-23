import { Package, Manifest, Tag, Referrer, RegistryFeature, ProviderConfig } from '../types';
import { BaseProvider } from './base';
import { Logger } from '../logger';
import { HttpClient } from '../utils/api';
/**
 * GitHub Container Registry provider
 * Uses GitHub Package API + OCI Registry V2 API
 */
export declare class GHCRProvider extends BaseProvider {
    private readonly githubToken;
    private readonly owner;
    private readonly repository;
    private readonly githubApiUrl;
    private ownerApiBase?;
    constructor(logger: Logger, config: ProviderConfig, httpClient: HttpClient);
    protected getAuthHeaders(): Record<string, string>;
    protected getRegistryAuthHeaders(): Record<string, string>;
    private getOwnerApiBase;
    authenticate(): Promise<void>;
    listPackages(): Promise<Package[]>;
    getPackageManifests(packageName: string): Promise<Manifest[]>;
    /**
     * Extract package name from full package path (e.g., "owner/package-name" -> "package-name")
     */
    private extractPackageName;
    private getPackageVersions;
    listTags(packageName: string): Promise<Tag[]>;
    deleteTag(packageName: string, tag: string): Promise<void>;
    getManifest(packageName: string, reference: string): Promise<Manifest>;
    deleteManifest(packageName: string, digest: string): Promise<void>;
    getReferrers(packageName: string, digest: string): Promise<Referrer[]>;
    supportsFeature(feature: RegistryFeature): boolean;
    getKnownRegistryUrls(): string[];
}
//# sourceMappingURL=ghcr.d.ts.map