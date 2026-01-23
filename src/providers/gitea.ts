import {
  Package,
  Manifest,
  Tag,
  Referrer,
  RegistryFeature,
  ProviderConfig,
  AuthenticationError,
  NotFoundError,
} from '../types';
import { BaseProvider } from './base';
import { Logger } from '../logger';
import { HttpClient } from '../utils/api';

/**
 * Gitea Container Registry provider
 * Uses Gitea Package API + OCI Registry V2 API
 */
export class GiteaProvider extends BaseProvider {
  private readonly giteaToken: string;
  private readonly owner: string;
  private readonly repository: string;
  private readonly giteaApiUrl: string;

  constructor(logger: Logger, config: ProviderConfig, httpClient: HttpClient) {
    super(logger, config, httpClient);
    
    if (!config.registryUrl) {
      throw new Error('registry-url is required for Gitea provider');
    }

    this.giteaToken = config.token || '';
    if (!this.giteaToken) {
      throw new Error('Gitea token is required for Gitea provider');
    }

    // Extract Gitea API URL from registry URL
    // Gitea registry is typically at <gitea-url>/v2, API is at <gitea-url>/api/v1
    const baseUrl = this.registryUrl.replace(/\/v2\/?$/, '');
    this.giteaApiUrl = `${baseUrl}/api/v1`;

    this.owner = config.owner || '';
    this.repository = config.repository || '';

    if (!this.owner) {
      throw new Error('Owner is required for Gitea provider');
    }
  }

  protected getAuthHeaders(): Record<string, string> {
    return {
      Authorization: `token ${this.giteaToken}`,
      'Content-Type': 'application/json',
    };
  }

  protected getRegistryAuthHeaders(): Record<string, string> {
    // Gitea's OCI Registry V2 API uses Basic auth with username:token
    // Use the owner as username and token as password
    const authString = Buffer.from(`${this.owner}:${this.giteaToken}`).toString('base64');
    return {
      Authorization: `Basic ${authString}`,
      Accept: 'application/vnd.oci.image.manifest.v1+json, application/vnd.docker.distribution.manifest.v2+json',
    };
  }

  async authenticate(): Promise<void> {
    this.logger.debug(`[Gitea] Authenticating with Gitea API at ${this.giteaApiUrl}`);
    try {
      const url = `${this.giteaApiUrl}/user`;
      this.logger.debug(`[Gitea] Testing authentication with ${url}`);
      const response = await this.httpClient.get(url, this.getAuthHeaders());
      
      if (response.status === 200) {
        this.authenticated = true;
        this.logger.debug(`[Gitea] Authentication successful (status: ${response.status})`);
      } else {
        throw new AuthenticationError('Failed to authenticate with Gitea', 'gitea');
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      const statusCode = error instanceof Error && 'statusCode' in error ? (error as any).statusCode : 'unknown';
      this.logger.debug(`[Gitea] Authentication error - Status: ${statusCode}, Message: ${errorMsg}`);
      
      if (error instanceof AuthenticationError) {
        throw error;
      }
      throw new AuthenticationError(
        `Authentication failed: ${errorMsg}`,
        'gitea'
      );
    }
  }

  async listPackages(): Promise<Package[]> {
    this.logger.debug(`[Gitea] Listing all packages for owner: ${this.owner}`);
    if (!this.authenticated) {
      await this.authenticate();
    }

    const packages: Package[] = [];
    let page = 1;
    const limit = 50;

    while (true) {
      const url = `${this.giteaApiUrl}/packages/${this.owner}?type=container&page=${page}&limit=${limit}`;
      this.logger.debug(`[Gitea] listPackages: Fetching page ${page} from ${url}`);
      
      try {
        const response = await this.httpClient.get<Array<{
          id: number;
          name: string;
          type: string;
          owner: { login: string };
          created_at: string;
          version: string;
        }>>(url, this.getAuthHeaders());

        this.logger.debug(`[Gitea] listPackages: Response status ${response.status}, received ${response.data?.length || 0} packages`);

        if (!response.data || response.data.length === 0) {
          this.logger.debug(`[Gitea] listPackages: No more packages, stopping pagination`);
          break;
        }

        for (const pkg of response.data) {
          packages.push({
            id: String(pkg.id),
            name: pkg.name,
            type: pkg.type,
            owner: pkg.owner.login,
            createdAt: new Date(pkg.created_at),
          });
        }

        if (response.data.length < limit) {
          break;
        }

        page++;
      } catch (error) {
        if (error instanceof NotFoundError) {
          break;
        }
        throw error;
      }
    }

    return packages;
  }

  async getPackageManifests(packageName: string): Promise<Manifest[]> {
    this.logger.debug(`[Gitea] Getting all manifests for package: ${packageName}`);
    if (!this.authenticated) {
      await this.authenticate();
    }

    const manifests: Manifest[] = [];
    
    try {
      const packageVersions = await this.getPackageVersions(packageName);
      this.logger.debug(`[Gitea] getPackageManifests: Found ${packageVersions.length} package versions`);

      for (const version of packageVersions) {
        const reference = version.digest || version.version;
        this.logger.debug(`[Gitea] getPackageManifests: Fetching manifest for version ${version.version} (reference: ${reference})`);
        try {
          const manifest = await this.getManifest(packageName, reference);
          manifests.push(manifest);
          this.logger.debug(`[Gitea] getPackageManifests: Successfully fetched manifest ${manifest.digest}`);
        } catch (error) {
          const errorMsg = error instanceof Error ? error.message : 'Unknown error';
          this.logger.debug(`[Gitea] getPackageManifests: Failed to get manifest for ${packageName}@${reference}: ${errorMsg}`);
        }
      }
    } catch (error) {
      // If getPackageVersions fails (e.g., package not found), return empty array
      // This is expected for packages that don't exist or have no versions
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      this.logger.debug(`[Gitea] getPackageManifests: Could not get package versions for ${packageName}: ${errorMsg}`);
    }

    this.logger.debug(`[Gitea] getPackageManifests: Completed, returning ${manifests.length} manifests`);
    return manifests;
  }

  /**
   * Extract package name from full package path (e.g., "owner/package-name" -> "package-name")
   */
  private extractPackageName(packageName: string): string {
    // If package name includes owner prefix (e.g., "owner/package-name"), extract just the package name
    if (packageName.includes('/')) {
      const parts = packageName.split('/');
      return parts.slice(1).join('/'); // Handle nested packages
    }
    return packageName;
  }

  private async getPackageVersions(packageName: string): Promise<Array<{ version: string; digest?: string; created_at: string }>> {
    this.logger.debug(`[Gitea] getPackageVersions: Starting for package ${packageName}`);
    
    // Extract just the package name (without owner prefix)
    const packageNameOnly = this.extractPackageName(packageName);
    this.logger.debug(`[Gitea] getPackageVersions: Extracted package name: ${packageNameOnly} (from ${packageName})`);

    const tags = await this.listTags(packageName);
    const tagMap = new Map(tags.map(tag => [tag.name, tag]));
    this.logger.debug(`[Gitea] getPackageVersions: Loaded ${tags.length} tags for digest mapping`);

    const versions: Array<{ version: string; digest?: string; created_at: string }> = [];
    let page = 1;
    const limit = 50;
    
    try {
      while (true) {
        const url = `${this.giteaApiUrl}/packages/${this.owner}/container/${packageNameOnly}?page=${page}&limit=${limit}`;
        this.logger.debug(`[Gitea] getPackageVersions: Fetching versions page ${page} from ${url}`);
        
        const response = await this.httpClient.get<Array<{
          id: number;
          name: string;
          type: string;
          owner: { login: string };
          version: string;
          created_at: string;
        }>>(url, this.getAuthHeaders());

        this.logger.debug(`[Gitea] getPackageVersions: Response status ${response.status}, versions: ${response.data?.length || 0}`);

        if (!response.data || response.data.length === 0) {
          this.logger.debug(`[Gitea] getPackageVersions: No more versions, stopping pagination`);
          break;
        }

        for (const pkgVersion of response.data) {
          const tag = tagMap.get(pkgVersion.version);
          versions.push({
            version: pkgVersion.version,
            digest: tag?.digest,
            created_at: pkgVersion.created_at,
          });
          
          if (tag) {
            this.logger.debug(`[Gitea] getPackageVersions: Mapped version ${pkgVersion.version} to digest ${tag.digest}`);
          } else {
            this.logger.debug(`[Gitea] getPackageVersions: No digest found for version ${pkgVersion.version}`);
          }
        }

        if (response.data.length < limit) {
          break;
        }

        page++;
      }

      this.logger.debug(`[Gitea] getPackageVersions: Returning ${versions.length} versions with digests`);
      return versions;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      const statusCode = error instanceof Error && 'statusCode' in error ? (error as any).statusCode : 'unknown';
      this.logger.debug(`[Gitea] getPackageVersions: listPackageVersions endpoint failed - Status: ${statusCode}, Message: ${errorMsg}`);
    }

    this.logger.debug(`[Gitea] getPackageVersions: No versions found, returning empty array`);
    return [];
  }

  async listTags(packageName: string): Promise<Tag[]> {
    this.logger.debug(`[Gitea] Listing all tags for package: ${packageName}`);
    if (!this.authenticated) {
      await this.authenticate();
    }

    const url = this.getTagsUrl(packageName);
    this.logger.debug(`[Gitea] listTags: Fetching tags from ${url}`);
    
    try {
      const response = await this.httpClient.get<{ tags: string[] }>(url, this.getRegistryAuthHeaders());

      this.logger.debug(`[Gitea] listTags: Response status ${response.status}, received ${response.data?.tags?.length || 0} tag names`);

      if (!response.data || !response.data.tags) {
        this.logger.debug(`[Gitea] listTags: No tags in response, returning empty array`);
        return [];
      }

      const tags: Tag[] = [];

      for (const tagName of response.data.tags) {
        this.logger.debug(`[Gitea] listTags: Processing tag ${tagName}`);
        try {
          const manifest = await this.getManifest(packageName, tagName);
          tags.push({
            name: tagName,
            digest: manifest.digest,
            createdAt: manifest.createdAt,
            updatedAt: manifest.updatedAt,
          });
          this.logger.debug(`[Gitea] listTags: Tag ${tagName} mapped to digest ${manifest.digest}`);
        } catch (error) {
          const errorMsg = error instanceof Error ? error.message : 'Unknown error';
          this.logger.debug(`[Gitea] listTags: Could not get manifest for tag ${tagName}: ${errorMsg}`);
        }
      }

      this.logger.debug(`[Gitea] listTags: Completed, returning ${tags.length} tags`);
      return tags;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      const statusCode = error instanceof Error && 'statusCode' in error ? (error as any).statusCode : 'unknown';
      this.logger.debug(`[Gitea] listTags: Error fetching tags - Status: ${statusCode}, Message: ${errorMsg}`);
      this.logger.warning(`Failed to list tags for ${packageName}: ${errorMsg}`);
      return [];
    }
  }

  async deleteTag(packageName: string, tag: string): Promise<void> {
    this.logger.debug(`[Gitea] Deleting tag: ${tag} from package: ${packageName}`);
    if (!this.authenticated) {
      await this.authenticate();
    }

    try {
      const packageNameOnly = this.extractPackageName(packageName);
      const deleteUrl = `${this.giteaApiUrl}/packages/${this.owner}/container/${packageNameOnly}/${tag}`;
      this.logger.debug(`[Gitea] Deleting version ${tag} via Package API: ${deleteUrl}`);
      await this.httpClient.delete(deleteUrl, this.getAuthHeaders());
      this.logger.info(`Deleted tag ${tag} from package ${packageName}`);
      return;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      const statusCode = error instanceof Error && 'statusCode' in error ? (error as any).statusCode : 'unknown';
      this.logger.debug(`[Gitea] Package API deletion failed - Status: ${statusCode}, Message: ${errorMsg}`);
      this.logger.debug(`[Gitea] Falling back to OCI Registry API (with safety check)`);
    }

    try {
      const manifest = await this.getManifest(packageName, tag);
      this.logger.debug(`[Gitea] Manifest digest: ${manifest.digest}`);

      // Fallback: delete via OCI Registry V2 API
      // Check if there are other tags pointing to this manifest
      try {
        const allTags = await this.listTags(packageName);
        const tagsForThisManifest = allTags.filter(t => t.digest === manifest.digest);
        this.logger.debug(`[Gitea] Found ${tagsForThisManifest.length} tags pointing to manifest ${manifest.digest}: ${tagsForThisManifest.map(t => t.name).join(', ')}`);
        
        if (tagsForThisManifest.length > 1) {
          const errorMsg = `Cannot delete tag ${tag} via OCI Registry API: Manifest ${manifest.digest} has ${tagsForThisManifest.length} tags. ` +
            `Deleting the manifest would delete all tags. Gitea Package API deletion failed, and OCI Registry API fallback is not safe.`;
          this.logger.debug(`[Gitea] ${errorMsg}`);
          throw new Error(errorMsg);
        }
        
        this.logger.debug(`[Gitea] Only one tag points to manifest, safe to delete via OCI Registry API`);
        await this.deleteManifest(packageName, manifest.digest);
        this.logger.info(`Deleted tag ${tag} via OCI Registry API from package ${packageName}`);
      } catch (deleteError) {
        const errorMsg = deleteError instanceof Error ? deleteError.message : 'Unknown error';
        const statusCode = deleteError instanceof Error && 'statusCode' in deleteError ? (deleteError as any).statusCode : 'unknown';
        this.logger.debug(`[Gitea] OCI Registry API deletion error - Status: ${statusCode}, Message: ${errorMsg}`);
        
        if (errorMsg.includes('Resource not found') || errorMsg.includes('404') || errorMsg.includes('Not Found')) {
          this.logger.info(`Tag ${tag} already deleted (manifest not found)`);
          return;
        }
        throw deleteError;
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      const statusCode = error instanceof Error && 'statusCode' in error ? (error as any).statusCode : 'unknown';
      this.logger.debug(`[Gitea] Overall error - Status: ${statusCode}, Message: ${errorMsg}`);
      
      if (errorMsg.includes('Resource not found') || errorMsg.includes('404') || errorMsg.includes('Not Found')) {
        this.logger.info(`Tag ${tag} already deleted`);
        return;
      }
      this.logger.error(`[Gitea] Failed to delete tag ${tag}: ${errorMsg}`);
      throw new Error(`Failed to delete tag ${tag}: ${errorMsg}`);
    }
  }

  async getManifest(packageName: string, reference: string): Promise<Manifest> {
    this.logger.debug(`[Gitea] Fetching manifest for package: ${packageName}, reference: ${reference}`);
    if (!this.authenticated) {
      await this.authenticate();
    }

    const url = this.getManifestUrl(packageName, reference);
    const headers = {
      ...this.getRegistryAuthHeaders(),
      Accept: 'application/vnd.oci.image.manifest.v1+json, application/vnd.oci.image.index.v1+json, application/vnd.docker.distribution.manifest.v2+json, application/vnd.docker.distribution.manifest.list.v2+json',
    };

    const response = await this.httpClient.get<string>(url, headers);
    
    if (!response.data) {
      throw new Error('Invalid manifest response');
    }

    // Parse JSON string to object
    let manifestData: unknown;
    if (typeof response.data === 'string') {
      try {
        manifestData = JSON.parse(response.data);
      } catch (error) {
        throw new Error(`Failed to parse manifest JSON: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    } else {
      manifestData = response.data;
    }

    const ociManifest = this.parseOCIManifest(manifestData);
    const digest = response.headers?.['docker-content-digest'] || reference;

    return this.convertToManifest(digest, ociManifest);
  }

  async deleteManifest(packageName: string, digest: string): Promise<void> {
    this.logger.debug(`[Gitea] Deleting manifest: ${digest} from package: ${packageName}`);
    if (!this.authenticated) {
      await this.authenticate();
    }

    const url = this.getManifestUrl(packageName, digest);
    try {
      await this.httpClient.delete(url, this.getRegistryAuthHeaders());
      this.logger.info(`Deleted manifest ${digest} from package ${packageName}`);
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      // If manifest is already deleted (Resource not found), that's okay
      if (errorMsg.includes('Resource not found') || errorMsg.includes('404') || errorMsg.includes('Not Found')) {
        this.logger.debug(`Manifest ${digest} already deleted`);
        return;
      }
      throw error;
    }
  }

  async getReferrers(packageName: string, digest: string): Promise<Referrer[]> {
    this.logger.debug(`[Gitea] Fetching referrers for package: ${packageName}, digest: ${digest}`);
    if (!this.supportsFeature('REFERRERS')) {
      return [];
    }

    if (!this.authenticated) {
      await this.authenticate();
    }

    try {
      const url = this.getReferrersUrl(packageName, digest);
      const response = await this.httpClient.get<{
        manifests: Array<{
          digest: string;
          mediaType: string;
          artifactType: string;
          size: number;
          annotations?: Record<string, string>;
        }>;
      }>(url, this.getRegistryAuthHeaders());

      if (!response.data || !response.data.manifests) {
        return [];
      }

      return response.data.manifests.map(m => ({
        digest: m.digest,
        artifactType: m.artifactType,
        mediaType: m.mediaType,
        size: m.size,
        annotations: m.annotations,
      }));
    } catch (error) {
      // Referrers API may not be supported, return empty array
      this.logger.debug(`Referrers API not available for ${packageName}@${digest}: ${error instanceof Error ? error.message : 'Unknown error'}`);
      return [];
    }
  }

  supportsFeature(feature: RegistryFeature): boolean {
    switch (feature) {
      case 'MULTI_ARCH':
        return true;
      case 'REFERRERS':
        return true; // Gitea supports OCI referrers (depending on version)
      case 'ATTESTATION':
        return true; // Gitea supports attestations
      case 'COSIGN':
        return true; // Gitea supports cosign
      default:
        return false;
    }
  }

  getKnownRegistryUrls(): string[] {
    // Gitea is typically self-hosted, so no default URLs
    return [];
  }
}
