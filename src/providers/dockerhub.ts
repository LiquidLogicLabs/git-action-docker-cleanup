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
 * Uses OCI Registry V2 API
 */
export class DockerHubProvider extends BaseProvider {
  private readonly username?: string;
  private readonly password?: string;
  private readonly token?: string;
  private readonly registryUrl = 'https://registry-1.docker.io';

  constructor(logger: Logger, config: ProviderConfig, httpClient: HttpClient) {
    super(logger, config, httpClient);
    
    this.username = config.username;
    this.password = config.password;
    this.token = config.token;

    if (!this.token && !this.username) {
      throw new Error('Authentication required: provide either token or username/password for Docker Hub');
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
    return {};
  }

  protected async getDockerHubToken(): Promise<string> {
    if (this.token) {
      return this.token;
    }

    if (!this.username || !this.password) {
      throw new AuthenticationError('Docker Hub credentials required', 'docker-hub');
    }

    // Get token from Docker Hub auth service
    const authUrl = 'https://auth.docker.io/token';
    const service = 'registry.docker.io';
    const scope = 'registry:catalog:*';

    const response = await this.httpClient.get<{ token: string }>(
      `${authUrl}?service=${service}&scope=${scope}`,
      {
        Authorization: `Basic ${Buffer.from(`${this.username}:${this.password}`).toString('base64')}`,
      }
    );

    if (!response.data || !response.data.token) {
      throw new AuthenticationError('Failed to get Docker Hub token', 'docker-hub');
    }

    return response.data.token;
  }

  protected getRegistryAuthHeaders(): Record<string, string> {
    // This will be set after authentication
    return {
      Accept: 'application/vnd.oci.image.manifest.v1+json, application/vnd.docker.distribution.manifest.v2+json',
    };
  }

  async authenticate(): Promise<void> {
    try {
      const token = await this.getDockerHubToken();
      
      // Test authentication by calling registry API
      const response = await this.httpClient.get(
        `${this.registryUrl}/v2/`,
        {
          ...this.getRegistryAuthHeaders(),
          Authorization: `Bearer ${token}`,
        }
      );

      if (response.status === 200 || response.status === 401) {
        // 401 is expected for catalog endpoint without proper scope, but means auth works
        this.authenticated = true;
        this.logger.debug('Successfully authenticated with Docker Hub');
      } else {
        throw new AuthenticationError('Failed to authenticate with Docker Hub', 'docker-hub');
      }
    } catch (error) {
      if (error instanceof AuthenticationError) {
        throw error;
      }
      throw new AuthenticationError(
        `Authentication failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'docker-hub'
      );
    }
  }

  async listPackages(): Promise<Package[]> {
    if (!this.authenticated) {
      await this.authenticate();
    }

    // Docker Hub doesn't provide a simple way to list all packages for a user
    // We'll return an empty array and rely on package name being provided
    this.logger.warning('Docker Hub does not support listing all packages. Please specify package names explicitly.');
    return [];
  }

  async getPackageManifests(packageName: string): Promise<Manifest[]> {
    if (!this.authenticated) {
      await this.authenticate();
    }

    const manifests: Manifest[] = [];
    const tags = await this.listTags(packageName);

    for (const tag of tags) {
      try {
        const manifest = await this.getManifest(packageName, tag.digest);
        manifests.push(manifest);
      } catch (error) {
        this.logger.warning(`Failed to get manifest for ${packageName}@${tag.digest}: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }

    return manifests;
  }

  async listTags(packageName: string): Promise<Tag[]> {
    if (!this.authenticated) {
      await this.authenticate();
    }

    const token = await this.getDockerHubToken();
    const url = this.getTagsUrl(packageName);
    const response = await this.httpClient.get<{ tags: string[] }>(
      url,
      {
        ...this.getRegistryAuthHeaders(),
        Authorization: `Bearer ${token}`,
      }
    );

    if (!response.data || !response.data.tags) {
      return [];
    }

    const tags: Tag[] = [];

    for (const tagName of response.data.tags) {
      try {
        const manifest = await this.getManifest(packageName, tagName);
        tags.push({
          name: tagName,
          digest: manifest.digest,
          createdAt: manifest.createdAt,
          updatedAt: manifest.updatedAt,
        });
      } catch (error) {
        this.logger.debug(`Could not get manifest for tag ${tagName}: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }

    return tags;
  }

  async deleteTag(packageName: string, tag: string): Promise<void> {
    if (!this.authenticated) {
      await this.authenticate();
    }

    // Get manifest digest for the tag
    const manifest = await this.getManifest(packageName, tag);
    
    // Delete via registry API
    await this.deleteManifest(packageName, manifest.digest);
  }

  async getManifest(packageName: string, reference: string): Promise<Manifest> {
    if (!this.authenticated) {
      await this.authenticate();
    }

    const token = await this.getDockerHubToken();
    const url = this.getManifestUrl(packageName, reference);
    const headers = {
      ...this.getRegistryAuthHeaders(),
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.oci.image.manifest.v1+json, application/vnd.oci.image.index.v1+json, application/vnd.docker.distribution.manifest.v2+json, application/vnd.docker.distribution.manifest.list.v2+json',
    };

    const response = await this.httpClient.get<string>(url, headers);
    
    if (!response.data || typeof response.data !== 'string') {
      throw new Error('Invalid manifest response');
    }

    const ociManifest = this.parseOCIManifest(response.data);
    const digest = response.headers?.['docker-content-digest'] || reference;

    return this.convertToManifest(digest, ociManifest);
  }

  async deleteManifest(packageName: string, digest: string): Promise<void> {
    if (!this.authenticated) {
      await this.authenticate();
    }

    const token = await this.getDockerHubToken();
    const url = this.getManifestUrl(packageName, digest);
    await this.httpClient.delete(url, {
      ...this.getRegistryAuthHeaders(),
      Authorization: `Bearer ${token}`,
    });
    this.logger.info(`Deleted manifest ${digest} from package ${packageName}`);
  }

  async getReferrers(packageName: string, digest: string): Promise<Referrer[]> {
    if (!this.supportsFeature('REFERRERS')) {
      return [];
    }

    if (!this.authenticated) {
      await this.authenticate();
    }

    try {
      const token = await this.getDockerHubToken();
      const url = this.getReferrersUrl(packageName, digest);
      const response = await this.httpClient.get<{
        manifests: Array<{
          digest: string;
          mediaType: string;
          artifactType: string;
          size: number;
          annotations?: Record<string, string>;
        }>;
      }>(url, {
        ...this.getRegistryAuthHeaders(),
        Authorization: `Bearer ${token}`,
      });

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
        return false; // Docker Hub may have limited referrers support
      case 'ATTESTATION':
        return false; // Docker Hub may have limited attestation support
      case 'COSIGN':
        return false; // Docker Hub may have limited cosign support
      default:
        return false;
    }
  }

  getKnownRegistryUrls(): string[] {
    return ['docker.io', 'registry-1.docker.io', 'hub.docker.com'];
  }

  protected getRegistryApiUrl(): string {
    return `${this.registryUrl}/v2`;
  }
}
