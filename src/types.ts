/**
 * Type definitions for the Docker Registry Cleanup Action
 */

export type RegistryType = 'ghcr' | 'gitea' | 'docker-hub' | 'docker' | 'auto';

export type RegistryFeature = 'MULTI_ARCH' | 'REFERRERS' | 'ATTESTATION' | 'COSIGN';

/**
 * Package/Repository information
 */
export interface Package {
  id: string;
  name: string;
  type: string;
  owner?: string;
  repository?: string;
  url?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

/**
 * OCI Manifest information
 */
export interface Manifest {
  digest: string;
  mediaType: string;
  size: number;
  config?: {
    digest: string;
    mediaType: string;
    size: number;
  };
  layers?: Array<{
    digest: string;
    mediaType: string;
    size: number;
  }>;
  manifests?: Array<{
    digest: string;
    mediaType: string;
    size: number;
    platform?: {
      architecture: string;
      os: string;
      variant?: string;
    };
  }>;
  annotations?: Record<string, string>;
  createdAt?: Date;
}

/**
 * Tag information
 */
export interface Tag {
  name: string;
  digest: string;
  createdAt?: Date;
  updatedAt?: Date;
}

/**
 * Referrer information (OCI referrers)
 */
export interface Referrer {
  digest: string;
  artifactType: string;
  mediaType: string;
  size: number;
  annotations?: Record<string, string>;
}

/**
 * Image information (combines package, manifest, and tags)
 */
export interface Image {
  package: Package;
  manifest: Manifest;
  tags: Tag[];
  isMultiArch: boolean;
  childImages?: Image[];
  referrers?: Referrer[];
  createdAt?: Date;
  updatedAt?: Date;
}

/**
 * Registry provider interface
 */
export interface IRegistryProvider {
  /**
   * Authenticate with the registry
   */
  authenticate(): Promise<void>;

  /**
   * List all packages/repositories
   */
  listPackages(): Promise<Package[]>;

  /**
   * Get all manifests for a package
   */
  getPackageManifests(packageName: string): Promise<Manifest[]>;

  /**
   * List all tags for a package
   */
  listTags(packageName: string): Promise<Tag[]>;

  /**
   * Delete a tag
   */
  deleteTag(packageName: string, tag: string): Promise<void>;

  /**
   * Get manifest by reference (tag or digest)
   */
  getManifest(packageName: string, reference: string): Promise<Manifest>;

  /**
   * Delete manifest by digest
   */
  deleteManifest(packageName: string, digest: string): Promise<void>;

  /**
   * Get referrers for a manifest (OCI referrers)
   */
  getReferrers(packageName: string, digest: string): Promise<Referrer[]>;

  /**
   * Check if provider supports a specific feature
   */
  supportsFeature(feature: RegistryFeature): boolean;

  /**
   * Get known registry URLs for auto-detection
   */
  getKnownRegistryUrls(): string[];
}

/**
 * Cleanup configuration
 */
export interface CleanupConfig {
  dryRun: boolean;
  keepNTagged?: number;
  keepNUntagged?: number;
  deleteUntagged: boolean;
  deleteTags?: string[];
  excludeTags?: string[];
  olderThan?: string;
  deleteGhostImages: boolean;
  deletePartialImages: boolean;
  deleteOrphanedImages: boolean;
  validate: boolean;
  retry: number;
  throttle: number;
  verbose: boolean;
}

/**
 * Cleanup result
 */
export interface CleanupResult {
  deletedCount: number;
  keptCount: number;
  deletedTags: string[];
  keptTags: string[];
  errors: string[];
}

/**
 * Provider configuration
 */
export interface ProviderConfig {
  registryType: RegistryType;
  registryUrl?: string;
  token?: string;
  username?: string;
  password?: string;
  owner?: string;
  repository?: string;
  packages?: string[];
  expandPackages: boolean;
  useRegex: boolean;
}

/**
 * HTTP client options
 */
export interface HttpClientOptions {
  retry?: number;
  throttle?: number;
  timeout?: number;
  headers?: Record<string, string>;
}

/**
 * Registry API response types
 */
export interface RegistryApiResponse<T = unknown> {
  data?: T;
  status: number;
  statusText: string;
  headers?: Record<string, string>;
}

/**
 * OCI Distribution Spec types
 */
export interface OCIManifest {
  schemaVersion: number;
  mediaType: string;
  config: OCIDescriptor;
  layers: OCIDescriptor[];
  manifests?: OCIDescriptor[];
  annotations?: Record<string, string>;
}

export interface OCIDescriptor {
  mediaType: string;
  digest: string;
  size: number;
  urls?: string[];
  annotations?: Record<string, string>;
  platform?: {
    architecture: string;
    os: string;
    variant?: string;
    'os.version'?: string;
    'os.features'?: string[];
  };
}

export interface OCIIndex {
  schemaVersion: number;
  mediaType: string;
  manifests: OCIDescriptor[];
  annotations?: Record<string, string>;
}

/**
 * Error types
 */
export class RegistryError extends Error {
  constructor(
    message: string,
    public readonly statusCode?: number,
    public readonly registryType?: string
  ) {
    super(message);
    this.name = 'RegistryError';
  }
}

export class AuthenticationError extends RegistryError {
  constructor(message: string, registryType?: string) {
    super(message, 401, registryType);
    this.name = 'AuthenticationError';
  }
}

export class NotFoundError extends RegistryError {
  constructor(message: string, registryType?: string) {
    super(message, 404, registryType);
    this.name = 'NotFoundError';
  }
}
