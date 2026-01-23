import { Package, Manifest, Tag, Referrer, RegistryFeature, ProviderConfig } from '../types';
import { BaseProvider } from './base';
import { Logger } from '../logger';
import { HttpClient } from '../utils/api';
/**
 * Docker Hub provider
 * Uses Docker Hub API exclusively (no OCI Registry V2 API)
 */
export declare class DockerHubProvider extends BaseProvider {
    private readonly username?;
    private readonly password?;
    private readonly token?;
    private readonly hubApiUrl;
    private hubToken?;
    private hubTokenExpiry?;
    constructor(logger: Logger, config: ProviderConfig, httpClient: HttpClient);
    protected getAuthHeaders(): Record<string, string>;
    private getRepositoryParts;
    private getHubToken;
    authenticate(): Promise<void>;
    listPackages(): Promise<Package[]>;
    getPackageManifests(packageName: string): Promise<Manifest[]>;
    listTags(packageName: string): Promise<Tag[]>;
    deleteTag(packageName: string, tag: string): Promise<void>;
    getManifest(packageName: string, reference: string): Promise<Manifest>;
    deleteManifest(packageName: string, digest: string): Promise<void>;
    getReferrers(packageName: string, digest: string): Promise<Referrer[]>;
    supportsFeature(feature: RegistryFeature): boolean;
    getKnownRegistryUrls(): string[];
    protected getRegistryApiUrl(): string;
}
//# sourceMappingURL=dockerhub.d.ts.map