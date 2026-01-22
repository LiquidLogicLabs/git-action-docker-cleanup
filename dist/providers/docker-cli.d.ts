import { Package, Manifest, Tag, Referrer, RegistryFeature, ProviderConfig } from '../types';
import { IRegistryProvider } from '../types';
import { Logger } from '../logger';
import { HttpClient } from '../utils/api';
/**
 * Docker CLI provider
 * Uses Docker CLI commands ONLY - no HTTP API calls
 *
 * This provider works with LOCAL Docker images only.
 * It uses docker image ls with JSON formatting to list and manage local images.
 * Useful for cleaning up local Docker images that match a registry pattern.
 *
 * Note: This provider does NOT interact with remote registries - it only manages
 * local images in the Docker daemon.
 */
export declare class DockerCLIProvider implements IRegistryProvider {
    private readonly logger;
    private readonly config;
    private readonly registryUrl;
    private authenticated;
    constructor(logger: Logger, config: ProviderConfig, _httpClient: HttpClient);
    private normalizeRegistryUrl;
    private getImageName;
    /**
     * Execute docker command and parse JSON output
     * Automatically adds --format json if not already present
     */
    private execDockerJson;
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
}
//# sourceMappingURL=docker-cli.d.ts.map