import {
  Package,
  Manifest,
  Tag,
  Referrer,
  RegistryFeature,
  ProviderConfig,
  AuthenticationError,
} from '../types';
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
export class GenericOCIProvider extends BaseProvider {
  private readonly token?: string;
  private readonly username?: string;
  private readonly password?: string;

  constructor(logger: Logger, config: ProviderConfig, httpClient: HttpClient) {
    super(logger, config, httpClient);
    
    this.token = config.token;
    this.username = config.username;
    this.password = config.password;

    if (!this.token && !this.username) {
      throw new Error('Authentication required: provide either token or username/password for OCI registry');
    }

    if (this.username && !this.password) {
      throw new Error('registry-password is required when registry-username is provided');
    }
  }

  protected getAuthHeaders(): Record<string, string> {
    if (this.token) {
      return {
        Authorization: `Bearer ${this.token}`,
      };
    }
    
    if (this.username && this.password) {
      return {
        Authorization: `Basic ${Buffer.from(`${this.username}:${this.password}`).toString('base64')}`,
      };
    }

    return {};
  }

  protected getRegistryAuthHeaders(): Record<string, string> {
    return {
      ...this.getAuthHeaders(),
      Accept: 'application/vnd.oci.image.manifest.v1+json, application/vnd.oci.image.index.v1+json, application/vnd.docker.distribution.manifest.v2+json, application/vnd.docker.distribution.manifest.list.v2+json',
    };
  }

  async authenticate(): Promise<void> {
    this.logger.debug(`[GenericOCI] Authenticating with OCI registry at ${this.registryUrl}`);
    try {
      const url = `${this.registryUrl}/v2/`;
      this.logger.debug(`[GenericOCI] Testing authentication with ${url}`);
      const response = await this.httpClient.get(
        url,
        this.getRegistryAuthHeaders()
      );

      // 200 = success, 401 = unauthorized (but auth format is valid)
      // 403 = forbidden (auth valid but insufficient permissions)
      if (response.status === 200 || response.status === 401 || response.status === 403) {
        this.authenticated = true;
        this.logger.debug(`[GenericOCI] Authentication successful (status: ${response.status})`);
      } else {
        throw new AuthenticationError(`Unexpected response status: ${response.status}`, 'oci');
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      const statusCode = error instanceof Error && 'statusCode' in error ? (error as any).statusCode : 'unknown';
      this.logger.debug(`[GenericOCI] Authentication error - Status: ${statusCode}, Message: ${errorMsg}`);
      
      if (error instanceof AuthenticationError) {
        throw error;
      }
      
      if (errorMsg.includes('401') || errorMsg.includes('Unauthorized')) {
        throw new AuthenticationError(
          'OCI registry authentication failed: Invalid credentials. Please check your token or username/password.',
          'oci'
        );
      }
      
      throw new AuthenticationError(
        `OCI registry authentication failed: ${errorMsg}`,
        'oci'
      );
    }
  }

  async listPackages(): Promise<Package[]> {
    this.logger.debug(`[GenericOCI] Listing all packages (OCI Registry V2 API limitation: package names must be provided explicitly)`);
    if (!this.authenticated) {
      await this.authenticate();
    }

    // OCI Registry V2 API does not provide a standard way to list all packages/repositories
    // Some registries support /v2/_catalog but it's not part of the OCI spec
    // We'll return an empty array and rely on package names being provided explicitly
    this.logger.debug(`[GenericOCI] listPackages: OCI Registry V2 API does not support listing all packages`);
    this.logger.warning('OCI Registry V2 API does not support listing all packages. Please specify package names explicitly.');
    return [];
  }

  async getPackageManifests(packageName: string): Promise<Manifest[]> {
    this.logger.debug(`[GenericOCI] Getting all manifests for package: ${packageName}`);
    if (!this.authenticated) {
      await this.authenticate();
    }

    const manifests: Manifest[] = [];
    const tags = await this.listTags(packageName);
    this.logger.debug(`[GenericOCI] getPackageManifests: Found ${tags.length} tags`);

    for (const tag of tags) {
      this.logger.debug(`[GenericOCI] getPackageManifests: Fetching manifest for tag ${tag.name} (digest: ${tag.digest})`);
      try {
        const manifest = await this.getManifest(packageName, tag.digest);
        manifests.push(manifest);
        this.logger.debug(`[GenericOCI] getPackageManifests: Successfully fetched manifest ${manifest.digest}`);
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : 'Unknown error';
        this.logger.debug(`[GenericOCI] getPackageManifests: Failed to get manifest for ${packageName}@${tag.digest}: ${errorMsg}`);
        this.logger.warning(`Failed to get manifest for ${packageName}@${tag.digest}: ${errorMsg}`);
      }
    }

    this.logger.debug(`[GenericOCI] getPackageManifests: Completed, returning ${manifests.length} manifests`);
    return manifests;
  }

  async listTags(packageName: string): Promise<Tag[]> {
    this.logger.debug(`[GenericOCI] Listing all tags for package: ${packageName}`);
    if (!this.authenticated) {
      await this.authenticate();
    }

    const url = this.getTagsUrl(packageName);
    this.logger.debug(`[GenericOCI] listTags: Fetching tags from ${url}`);
    
    try {
      const response = await this.httpClient.get<{ tags: string[] }>(
        url,
        this.getRegistryAuthHeaders()
      );

      this.logger.debug(`[GenericOCI] listTags: Response status ${response.status}, received ${response.data?.tags?.length || 0} tag names`);

      if (!response.data || !response.data.tags) {
        this.logger.debug(`[GenericOCI] listTags: No tags in response, returning empty array`);
        return [];
      }

      const tags: Tag[] = [];

      // Fetch manifest for each tag to get digest and metadata
      for (const tagName of response.data.tags) {
        this.logger.debug(`[GenericOCI] listTags: Processing tag ${tagName}`);
        try {
          const manifest = await this.getManifest(packageName, tagName);
          tags.push({
            name: tagName,
            digest: manifest.digest,
            createdAt: manifest.createdAt,
            updatedAt: manifest.updatedAt,
          });
          this.logger.debug(`[GenericOCI] listTags: Tag ${tagName} mapped to digest ${manifest.digest}`);
        } catch (error) {
          const errorMsg = error instanceof Error ? error.message : 'Unknown error';
          this.logger.debug(`[GenericOCI] listTags: Could not get manifest for tag ${tagName}: ${errorMsg}`);
        }
      }

      this.logger.debug(`[GenericOCI] listTags: Completed, returning ${tags.length} tags`);
      return tags;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      const statusCode = error instanceof Error && 'statusCode' in error ? (error as any).statusCode : 'unknown';
      this.logger.debug(`[GenericOCI] listTags: Error - Status: ${statusCode}, Message: ${errorMsg}`);
      this.logger.warning(`Failed to list tags for ${packageName}: ${errorMsg}`);
      return [];
    }
  }

  async deleteTag(packageName: string, tag: string): Promise<void> {
    this.logger.debug(`[GenericOCI] Deleting tag: ${tag} from package: ${packageName} (will delete manifest and all tags pointing to it)`);
    if (!this.authenticated) {
      await this.authenticate();
    }

    // OCI V2 API limitation: Cannot delete individual tags
    // We can only delete manifests, which deletes ALL tags pointing to that manifest
    const manifest = await this.getManifest(packageName, tag);
    this.logger.debug(`[GenericOCI] Manifest digest: ${manifest.digest} - WARNING: Deleting manifest will delete ALL tags pointing to it`);
    
    await this.deleteManifest(packageName, manifest.digest);
    
    this.logger.info(`Deleted tag ${tag} (and all other tags pointing to manifest ${manifest.digest}) from package ${packageName}`);
  }

  async getManifest(packageName: string, reference: string): Promise<Manifest> {
    this.logger.debug(`[GenericOCI] Fetching manifest for package: ${packageName}, reference: ${reference}`);
    if (!this.authenticated) {
      await this.authenticate();
    }

    const url = this.getManifestUrl(packageName, reference);
    this.logger.debug(`[GenericOCI] getManifest: Fetching manifest from ${url}`);
    const headers = this.getRegistryAuthHeaders();

    try {
      const response = await this.httpClient.get<string>(url, headers);
      this.logger.debug(`[GenericOCI] getManifest: Response status ${response.status}, content-type: ${response.headers?.['content-type'] || 'unknown'}`);
      
      if (!response.data || typeof response.data !== 'string') {
        this.logger.debug(`[GenericOCI] getManifest: Invalid response data type: ${typeof response.data}`);
        throw new Error('Invalid manifest response');
      }

      // Parse JSON string to object
      const manifestData = typeof response.data === 'string' ? JSON.parse(response.data) : response.data;
      const ociManifest = this.parseOCIManifest(manifestData);
      const digest = response.headers?.['docker-content-digest'] || reference;
      this.logger.debug(`[GenericOCI] getManifest: Parsed manifest, digest: ${digest}, mediaType: ${ociManifest.mediaType}`);

      return this.convertToManifest(digest, ociManifest);
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      const statusCode = error instanceof Error && 'statusCode' in error ? (error as any).statusCode : 'unknown';
      this.logger.debug(`[GenericOCI] getManifest: Error - Status: ${statusCode}, Message: ${errorMsg}`);
      throw new Error(`Failed to get manifest for ${packageName}@${reference}: ${errorMsg}`);
    }
  }

  async deleteManifest(packageName: string, digest: string): Promise<void> {
    this.logger.debug(`[GenericOCI] Deleting manifest: ${digest} from package: ${packageName}`);
    if (!this.authenticated) {
      await this.authenticate();
    }

    const url = this.getManifestUrl(packageName, digest);
    this.logger.debug(`[GenericOCI] Deleting manifest from ${url}`);
    
    try {
      const response = await this.httpClient.delete(url, this.getRegistryAuthHeaders());
      this.logger.debug(`[GenericOCI] Manifest deletion response: ${response.status}`);
      this.logger.info(`Deleted manifest ${digest} from package ${packageName}`);
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      const statusCode = error instanceof Error && 'statusCode' in error ? (error as any).statusCode : 'unknown';
      this.logger.debug(`[GenericOCI] Manifest deletion error - Status: ${statusCode}, Message: ${errorMsg}`);
      throw new Error(`Failed to delete manifest ${digest} from ${packageName}: ${errorMsg}`);
    }
  }

  async getReferrers(packageName: string, digest: string): Promise<Referrer[]> {
    this.logger.debug(`[GenericOCI] Fetching referrers for package: ${packageName}, digest: ${digest}`);
    if (!this.supportsFeature('REFERRERS')) {
      return [];
    }

    if (!this.authenticated) {
      await this.authenticate();
    }

    try {
      const url = this.getReferrersUrl(packageName, digest);
      this.logger.debug(`[GenericOCI] getReferrers: Fetching referrers from ${url}`);
      
      const response = await this.httpClient.get<{
        manifests: Array<{
          digest: string;
          mediaType: string;
          size: number;
          artifactType?: string;
          annotations?: Record<string, string>;
        }>;
      }>(url, this.getRegistryAuthHeaders());

      this.logger.debug(`[GenericOCI] getReferrers: Response status ${response.status}, referrers: ${response.data?.manifests?.length || 0}`);

      if (!response.data || !response.data.manifests) {
        this.logger.debug(`[GenericOCI] getReferrers: No referrers in response, returning empty array`);
        return [];
      }

      const referrers = response.data.manifests.map(ref => ({
        digest: ref.digest,
        artifactType: ref.artifactType || 'unknown',
        mediaType: ref.mediaType,
        size: ref.size,
        annotations: ref.annotations,
      }));
      this.logger.debug(`[GenericOCI] getReferrers: Returning ${referrers.length} referrers`);
      return referrers;
    } catch (error) {
      // Referrers API might not be supported by all registries
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      const statusCode = error instanceof Error && 'statusCode' in error ? (error as any).statusCode : 'unknown';
      this.logger.debug(`[GenericOCI] getReferrers: Referrers API not supported or failed - Status: ${statusCode}, Message: ${errorMsg}`);
      return [];
    }
  }

  supportsFeature(feature: RegistryFeature): boolean {
    switch (feature) {
      case 'MULTI_ARCH':
        return true; // OCI index manifests are standard
      case 'REFERRERS':
        return true; // OCI referrers API is standard (though not all registries implement it)
      case 'ATTESTATION':
        return true; // Attestations use OCI referrers
      case 'COSIGN':
        return true; // Cosign signatures use OCI referrers
      default:
        return false;
    }
  }

  getKnownRegistryUrls(): string[] {
    // Generic provider doesn't have specific known URLs
    // It's used as a fallback for any OCI-compliant registry
    return [];
  }
}
