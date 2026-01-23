import {
  IRegistryProvider,
  Package,
  Manifest,
  Tag,
  Referrer,
  RegistryFeature,
  ProviderConfig,
  OCIManifest,
  OCIIndex,
} from '../types';
import { Logger } from '../logger';
import { HttpClient } from '../utils/api';

/**
 * Base provider class with common OCI Registry V2 API utilities
 */
export abstract class BaseProvider implements IRegistryProvider {
  protected readonly logger: Logger;
  protected readonly config: ProviderConfig;
  protected readonly httpClient: HttpClient;
  protected readonly registryUrl: string;
  protected authenticated: boolean = false;

  constructor(logger: Logger, config: ProviderConfig, httpClient: HttpClient) {
    this.logger = logger;
    this.config = config;
    this.httpClient = httpClient;
    this.registryUrl = this.normalizeRegistryUrl(config.registryUrl || '');
  }

  /**
   * Normalize registry URL
   */
  protected normalizeRegistryUrl(url: string): string {
    // Ensure URL has protocol
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      url = `https://${url}`;
    }
    // Remove trailing slash
    return url.replace(/\/$/, '');
  }

  /**
   * Get OCI Registry V2 API base URL
   */
  protected getRegistryApiUrl(): string {
    return `${this.registryUrl}/v2`;
  }

  /**
   * Get manifest URL
   */
  protected getManifestUrl(packageName: string, reference: string): string {
    return `${this.getRegistryApiUrl()}/${packageName}/manifests/${reference}`;
  }

  /**
   * Get tags URL
   */
  protected getTagsUrl(packageName: string): string {
    return `${this.getRegistryApiUrl()}/${packageName}/tags/list`;
  }

  /**
   * Get referrers URL (OCI referrers API)
   */
  protected getReferrersUrl(packageName: string, digest: string): string {
    return `${this.getRegistryApiUrl()}/${packageName}/referrers/${digest}`;
  }

  /**
   * Get blob URL
   */
  protected getBlobUrl(packageName: string, digest: string): string {
    return `${this.getRegistryApiUrl()}/${packageName}/blobs/${digest}`;
  }

  /**
   * Parse OCI manifest
   */
  protected parseOCIManifest(data: unknown): OCIManifest | OCIIndex {
    if (typeof data !== 'object' || data === null) {
      throw new Error('Invalid manifest: not an object');
    }

    const manifest = data as Record<string, unknown>;

    if (!manifest.mediaType) {
      throw new Error('Invalid manifest: missing mediaType');
    }

    const mediaType = String(manifest.mediaType);

    // Check if it's an index (multi-arch)
    if (
      mediaType === 'application/vnd.oci.image.index.v1+json' ||
      mediaType === 'application/vnd.docker.distribution.manifest.list.v2+json'
    ) {
      return manifest as unknown as OCIIndex;
    }

    // Regular manifest
    return manifest as unknown as OCIManifest;
  }

  /**
   * Check if manifest is multi-arch (index)
   */
  protected isMultiArchManifest(manifest: OCIManifest | OCIIndex): manifest is OCIIndex {
    return (
      manifest.mediaType === 'application/vnd.oci.image.index.v1+json' ||
      manifest.mediaType === 'application/vnd.docker.distribution.manifest.list.v2+json'
    );
  }

  /**
   * Convert OCI manifest to internal Manifest format
   */
  protected convertToManifest(
    digest: string,
    ociManifest: OCIManifest | OCIIndex,
    createdAt?: Date
  ): Manifest {
    if (this.isMultiArchManifest(ociManifest)) {
      return {
        digest,
        mediaType: ociManifest.mediaType,
        size: JSON.stringify(ociManifest).length,
        manifests: ociManifest.manifests.map(m => ({
          digest: m.digest,
          mediaType: m.mediaType,
          size: m.size,
          platform: m.platform,
        })),
        annotations: ociManifest.annotations,
        createdAt,
      };
    }

    return {
      digest,
      mediaType: ociManifest.mediaType,
      size: ociManifest.config?.size ?? JSON.stringify(ociManifest).length,
      config: ociManifest.config
        ? {
            digest: ociManifest.config.digest,
            mediaType: ociManifest.config.mediaType,
            size: ociManifest.config.size,
          }
        : undefined,
      layers: ociManifest.layers?.map(l => ({
        digest: l.digest,
        mediaType: l.mediaType,
        size: l.size,
      })),
      annotations: ociManifest.annotations,
      createdAt,
    };
  }

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
