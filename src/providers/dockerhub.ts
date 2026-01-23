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
 * Docker Hub provider
 * Uses Docker Hub API exclusively (no OCI Registry V2 API)
 */
export class DockerHubProvider extends BaseProvider {
  private readonly username?: string;
  private readonly password?: string;
  private readonly token?: string;
  private readonly hubApiUrl = 'https://hub.docker.com/v2';
  private hubToken?: string;
  private hubTokenExpiry?: Date;

  constructor(logger: Logger, config: ProviderConfig, httpClient: HttpClient) {
    super(logger, config, httpClient);
    
    this.username = config.username;
    this.password = config.password;
    this.token = config.token;

    // Docker Hub provider requires username/password (token can be used as password)
    if (!this.username || (!this.password && !this.token)) {
      throw new Error('Docker Hub provider requires registry-username and registry-password (or token to use as password)');
    }
  }

  protected getAuthHeaders(): Record<string, string> {
    // Not used for Hub API - we use JWT tokens
    return {};
  }

  private getRepositoryParts(packageName: string): { namespace: string; repo: string } {
    if (packageName.includes('/')) {
      const [namespace, ...rest] = packageName.split('/');
      return { namespace, repo: rest.join('/') };
    }
    if (!this.username) {
      throw new Error('Docker Hub namespace is required when package name does not include a namespace');
    }
    return { namespace: this.username, repo: packageName };
  }

  private async getHubToken(): Promise<string> {
    if (this.hubToken && this.hubTokenExpiry && this.hubTokenExpiry.getTime() > Date.now()) {
      this.logger.debug(`[DockerHub] getHubToken: Using cached Hub token (expires: ${this.hubTokenExpiry.toISOString()})`);
      return this.hubToken;
    }

    const password = this.password || this.token;
    if (!this.username || !password) {
      throw new AuthenticationError('Docker Hub username/password required for Hub API', 'docker-hub');
    }

    const url = `${this.hubApiUrl}/users/login/`;
    this.logger.debug(`[DockerHub] getHubToken: Requesting Hub token from ${url}`);

    const response = await this.httpClient.post<{ token: string }>(
      url,
      { username: this.username, password },
      { 'Content-Type': 'application/json' }
    );

    if (!response.data?.token) {
      throw new AuthenticationError('Failed to obtain Docker Hub API token', 'docker-hub');
    }

    this.hubToken = response.data.token;
    this.hubTokenExpiry = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes
    this.logger.debug('[DockerHub] getHubToken: Successfully obtained Hub token');
    return this.hubToken;
  }

  async authenticate(): Promise<void> {
    this.logger.debug(`[DockerHub] Authenticating with Docker Hub API`);
    
    try {
      await this.getHubToken();
      this.logger.debug(`[DockerHub] Docker Hub API authentication successful`);
      this.authenticated = true;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      this.logger.debug(`[DockerHub] Docker Hub API authentication failed: ${errorMsg}`);
      throw new AuthenticationError(
        'Docker Hub authentication failed: Invalid credentials. Please check your username and password/token.',
        'docker-hub'
      );
    }
  }

  async listPackages(): Promise<Package[]> {
    this.logger.debug(`[DockerHub] Listing all packages`);
    if (!this.authenticated) {
      await this.authenticate();
    }

    const packages: Package[] = [];
    let page = 1;
    const pageSize = 100;
    const token = await this.getHubToken();

    while (true) {
      const url = `${this.hubApiUrl}/repositories/${this.username}/?page=${page}&page_size=${pageSize}`;
      this.logger.debug(`[DockerHub] Fetching repositories page ${page} from ${url}`);
      const response = await this.httpClient.get<{
        results: Array<{
          name: string;
          namespace: string;
          created_at?: string;
          last_updated?: string;
        }>;
      }>(url, { Authorization: `JWT ${token}` });

      const results = response.data?.results || [];
      this.logger.debug(`[DockerHub] Received ${results.length} repositories from page ${page}`);

      if (results.length === 0) {
        break;
      }

      for (const repo of results) {
        packages.push({
          id: `${repo.namespace}/${repo.name}`,
          name: `${repo.namespace}/${repo.name}`,
          type: 'container',
          owner: repo.namespace,
          createdAt: repo.created_at ? new Date(repo.created_at) : undefined,
          updatedAt: repo.last_updated ? new Date(repo.last_updated) : undefined,
        });
      }

      if (results.length < pageSize) {
        break;
      }
      page += 1;
    }

    this.logger.debug(`[DockerHub] Found ${packages.length} total repositories`);
    return packages;
  }

  async getPackageManifests(packageName: string): Promise<Manifest[]> {
    this.logger.debug(`[DockerHub] Getting all manifests for package: ${packageName}`);
    if (!this.authenticated) {
      await this.authenticate();
    }

    const tags = await this.listTags(packageName);
    const manifests: Manifest[] = [];
    
    // Group tags by digest to create manifests
    const digestMap = new Map<string, { digest: string; createdAt?: Date; updatedAt?: Date }>();
    
    for (const tag of tags) {
      const digest = tag.digest;
      if (!digestMap.has(digest)) {
        digestMap.set(digest, {
          digest,
          createdAt: tag.createdAt,
          updatedAt: tag.updatedAt,
        });
      }
      const manifestData = digestMap.get(digest)!;
      // Use the earliest createdAt and latest updatedAt
      if (tag.createdAt && (!manifestData.createdAt || tag.createdAt < manifestData.createdAt)) {
        manifestData.createdAt = tag.createdAt;
      }
      if (tag.updatedAt && (!manifestData.updatedAt || tag.updatedAt > manifestData.updatedAt)) {
        manifestData.updatedAt = tag.updatedAt;
      }
    }
    
    // Convert to Manifest objects
    for (const manifestData of digestMap.values()) {
      manifests.push({
        digest: manifestData.digest,
        createdAt: manifestData.createdAt,
        updatedAt: manifestData.updatedAt,
        size: 0, // Hub API doesn't provide size
        mediaType: 'application/vnd.docker.distribution.manifest.v2+json', // Default
      });
    }
    
    this.logger.debug(`[DockerHub] Constructed ${manifests.length} manifests from Hub API tag data`);
    return manifests;
  }

  async listTags(packageName: string): Promise<Tag[]> {
    this.logger.debug(`[DockerHub] Listing tags for package: ${packageName}`);
    
    if (!this.authenticated) {
      await this.authenticate();
    }

    const { namespace, repo } = this.getRepositoryParts(packageName);
    const token = await this.getHubToken();
    let page = 1;
    const pageSize = 100;
    const tags: Tag[] = [];

    while (true) {
      const url = `${this.hubApiUrl}/repositories/${namespace}/${repo}/tags?page=${page}&page_size=${pageSize}`;
      this.logger.debug(`[DockerHub] Fetching tags page ${page} from Hub API: ${url}`);
      const response = await this.httpClient.get<{
        results: Array<{
          name: string;
          last_updated?: string;
          images?: Array<{ digest?: string }>;
        }>;
      }>(url, { Authorization: `JWT ${token}` });

      const results = response.data?.results || [];
      this.logger.debug(`[DockerHub] Received ${results.length} tags from page ${page}`);

      if (results.length === 0) {
        break;
      }

      for (const tag of results) {
        const digest = tag.images?.find(image => image.digest)?.digest;
        tags.push({
          name: tag.name,
          digest: digest || tag.name,
          createdAt: tag.last_updated ? new Date(tag.last_updated) : undefined,
          updatedAt: tag.last_updated ? new Date(tag.last_updated) : undefined,
        });
      }

      if (results.length < pageSize) {
        break;
      }
      page += 1;
    }

    this.logger.debug(`[DockerHub] Found ${tags.length} total tags via Hub API`);
    return tags;
  }

  async deleteTag(packageName: string, tag: string): Promise<void> {
    this.logger.debug(`[DockerHub] Deleting tag: ${tag} from package: ${packageName}`);
    
    if (!this.authenticated) {
      await this.authenticate();
    }

    const { namespace, repo } = this.getRepositoryParts(packageName);
    const token = await this.getHubToken();
    const url = `${this.hubApiUrl}/repositories/${namespace}/${repo}/tags/${tag}/`;
    this.logger.debug(`[DockerHub] Deleting tag via Hub API: ${url}`);
    await this.httpClient.delete(url, { Authorization: `JWT ${token}` });
    this.logger.info(`Deleted tag ${tag} from package ${packageName}`);
  }

  async getManifest(packageName: string, reference: string): Promise<Manifest> {
    this.logger.debug(`[DockerHub] Getting manifest for package: ${packageName}, reference: ${reference}`);
    
    if (!this.authenticated) {
      await this.authenticate();
    }

    // Construct manifest from Hub API tag data
    // Find the tag that matches the reference (could be tag name or digest)
    const tags = await this.listTags(packageName);
    const matchingTag = tags.find(t => t.name === reference || t.digest === reference);
    
    if (!matchingTag) {
      throw new Error(`Tag or digest not found: ${reference}`);
    }

    // Construct minimal manifest from tag data
    return {
      digest: matchingTag.digest,
      createdAt: matchingTag.createdAt,
      updatedAt: matchingTag.updatedAt,
      size: 0, // Hub API doesn't provide size
      mediaType: 'application/vnd.docker.distribution.manifest.v2+json', // Default
    };
  }

  async deleteManifest(packageName: string, digest: string): Promise<void> {
    this.logger.debug(`[DockerHub] deleteManifest called for digest: ${digest}`);
    // Docker Hub API doesn't support direct manifest deletion
    // We can only delete tags, which will delete the manifest if it's the last tag
    // This method is not used in practice since we delete tags, not manifests
    throw new Error('Docker Hub API does not support direct manifest deletion. Delete tags instead.');
  }

  async getReferrers(packageName: string, digest: string): Promise<Referrer[]> {
    this.logger.debug(`[DockerHub] getReferrers called for package: ${packageName}, digest: ${digest}`);
    // Docker Hub API doesn't support referrers
    return [];
  }

  supportsFeature(feature: RegistryFeature): boolean {
    switch (feature) {
      case 'MULTI_ARCH':
        return true; // Hub API provides digest info that can indicate multi-arch
      case 'REFERRERS':
        return false; // Hub API doesn't support referrers
      case 'ATTESTATION':
        return false; // Hub API doesn't support attestations
      case 'COSIGN':
        return false; // Hub API doesn't support cosign
      default:
        return false;
    }
  }

  getKnownRegistryUrls(): string[] {
    return ['docker.io', 'registry-1.docker.io', 'hub.docker.com'];
  }

  protected getRegistryApiUrl(): string {
    // Not used - kept for BaseProvider compatibility
    return '';
  }
}
