import { Package, Manifest, Tag, Referrer, RegistryFeature, ProviderConfig } from '../types';
import { BaseProvider } from './base';
import { Logger } from '../logger';
import { HttpClient } from '../utils/api';
/**
 * Gitea Container Registry provider
 * Uses Gitea Package API + OCI Registry V2 API
 */
export declare class GiteaProvider extends BaseProvider {
    private readonly giteaToken;
    private readonly owner;
    private readonly repository;
    private readonly giteaApiUrl;
    constructor(logger: Logger, config: ProviderConfig, httpClient: HttpClient);
    protected getAuthHeaders(): Record<string, string>;
    protected getRegistryAuthHeaders(): Record<string, string>;
    authenticate(): Promise<void>;
    listPackages(): Promise<Package[]>;
    getPackageManifests(packageName: string): Promise<Manifest[]>;
    private getPackageVersions;
    listTags(packageName: string): Promise<Tag[]>;
    deleteTag(packageName: string, tag: string): Promise<void>;
    getManifest(packageName: string, reference: string): Promise<Manifest>;
    deleteManifest(packageName: string, digest: string): Promise<void>;
    getReferrers(packageName: string, digest: string): Promise<Referrer[]>;
    supportsFeature(feature: RegistryFeature): boolean;
    getKnownRegistryUrls(): string[];
}
//# sourceMappingURL=gitea.d.ts.map