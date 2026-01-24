import { Package, Manifest, Tag, Referrer, RegistryFeature, ProviderConfig } from '../types';
import { BaseProvider } from './base';
import { Logger } from '../logger';
import { HttpClient } from '../utils/api';
/**
 * Generic OCI Registry V2 Provider
 *
 * Works with any OCI-compliant registry (Harbor, Quay.io, Azure Container Registry, Artifactory, etc.)
 *
 * Limitations:
 * - Cannot list all packages (must provide package names explicitly)
 * - Cannot delete individual tags (only deletes manifests, which deletes all tags pointing to that manifest)
 * - Limited metadata (must fetch manifests to get creation dates)
 *
 * Authentication:
 * - Supports Bearer token authentication
 * - Supports Basic authentication (username/password)
 * - Token can be provided directly or via username/password
 */
export declare class GenericOCIProvider extends BaseProvider {
    private readonly token?;
    private readonly username?;
    private readonly password?;
    constructor(logger: Logger, config: ProviderConfig, httpClient: HttpClient);
    protected getAuthHeaders(): Record<string, string>;
    protected getRegistryAuthHeaders(): Record<string, string>;
    authenticate(): Promise<void>;
    listPackages(): Promise<Package[]>;
    getPackageManifests(packageName: string): Promise<Manifest[]>;
    listTags(packageName: string): Promise<Tag[]>;
    deleteTag(packageName: string, tag: string, _tagsBeingDeleted?: string[]): Promise<void>;
    getManifest(packageName: string, reference: string): Promise<Manifest>;
    deleteManifest(packageName: string, digest: string): Promise<void>;
    getReferrers(packageName: string, digest: string): Promise<Referrer[]>;
    supportsFeature(feature: RegistryFeature): boolean;
    getKnownRegistryUrls(): string[];
}
//# sourceMappingURL=generic-oci.d.ts.map