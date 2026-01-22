import * as core from '@actions/core';
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
 * GitHub Container Registry provider
 * Uses GitHub Package API + OCI Registry V2 API
 */
export class GHCRProvider extends BaseProvider {
  private readonly githubToken: string;
  private readonly owner: string;
  private readonly repository: string;
  private readonly githubApiUrl = 'https://api.github.com';

  constructor(logger: Logger, config: ProviderConfig, httpClient: HttpClient) {
    super(logger, config, httpClient);
    
    this.githubToken = config.token || core.getInput('token') || '';
    if (!this.githubToken) {
      throw new Error('GitHub token is required for GHCR provider');
    }

    this.owner = config.owner || process.env.GITHUB_REPOSITORY_OWNER || '';
    this.repository = config.repository || process.env.GITHUB_REPOSITORY?.split('/')[1] || '';

    if (!this.owner) {
      throw new Error('Owner is required for GHCR provider');
    }
  }

  protected getAuthHeaders(): Record<string, string> {
    return {
      Authorization: `Bearer ${this.githubToken}`,
      Accept: 'application/vnd.github+json',
    };
  }

  protected getRegistryAuthHeaders(): Record<string, string> {
    return {
      Authorization: `Bearer ${this.githubToken}`,
      Accept: 'application/vnd.oci.image.manifest.v1+json, application/vnd.docker.distribution.manifest.v2+json',
    };
  }

  async authenticate(): Promise<void> {
    try {
      // Test authentication by calling GitHub API
      const response = await this.httpClient.get(`${this.githubApiUrl}/user`, this.getAuthHeaders());
      if (response.status === 200) {
        this.authenticated = true;
        this.logger.debug('Successfully authenticated with GitHub');
      } else {
        throw new AuthenticationError('Failed to authenticate with GitHub', 'ghcr');
      }
    } catch (error) {
      if (error instanceof AuthenticationError) {
        throw error;
      }
      throw new AuthenticationError(
        `Authentication failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'ghcr'
      );
    }
  }

  async listPackages(): Promise<Package[]> {
    if (!this.authenticated) {
      await this.authenticate();
    }

    const packages: Package[] = [];
    let page = 1;
    const perPage = 100;

    while (true) {
      const url = `${this.githubApiUrl}/users/${this.owner}/packages?package_type=container&page=${page}&per_page=${perPage}`;
      
      try {
        const response = await this.httpClient.get<Array<{
          id: number;
          name: string;
          package_type: string;
          owner: { login: string };
          created_at: string;
          updated_at: string;
        }>>(url, this.getAuthHeaders());

        if (!response.data || response.data.length === 0) {
          break;
        }

        for (const pkg of response.data) {
          packages.push({
            id: String(pkg.id),
            name: pkg.name,
            type: pkg.package_type,
            owner: pkg.owner.login,
            createdAt: new Date(pkg.created_at),
            updatedAt: new Date(pkg.updated_at),
          });
        }

        if (response.data.length < perPage) {
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
    if (!this.authenticated) {
      await this.authenticate();
    }

    const manifests: Manifest[] = [];
    const packageVersions = await this.getPackageVersions(packageName);

    for (const version of packageVersions) {
      try {
        const manifest = await this.getManifest(packageName, version.digest);
        manifests.push(manifest);
      } catch (error) {
        this.logger.warning(`Failed to get manifest for ${packageName}@${version.digest}: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }

    return manifests;
  }

  private async getPackageVersions(packageName: string): Promise<Array<{ id: number; digest: string; created_at: string }>> {
    const url = `${this.githubApiUrl}/users/${this.owner}/packages/container/${packageName}/versions`;
    const response = await this.httpClient.get<Array<{
      id: number;
      name: string;
      metadata: { container: { tags: string[] } };
      created_at: string;
    }>>(url, this.getAuthHeaders());

    if (!response.data) {
      return [];
    }

    // Extract digests from package versions
    // Note: GitHub API doesn't directly provide digests, we need to get them from manifests
    const versions: Array<{ id: number; digest: string; created_at: string }> = [];
    
    for (const version of response.data) {
      // Try to get digest from tags
      if (version.metadata?.container?.tags && version.metadata.container.tags.length > 0) {
        try {
          const tags = await this.listTags(packageName);
          const tag = tags.find(t => version.metadata.container.tags.includes(t.name));
          if (tag) {
            versions.push({
              id: version.id,
              digest: tag.digest,
              created_at: version.created_at,
            });
          }
        } catch (error) {
          this.logger.debug(`Could not get digest for version ${version.id}: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
      }
    }

    return versions;
  }

  async listTags(packageName: string): Promise<Tag[]> {
    if (!this.authenticated) {
      await this.authenticate();
    }

    const url = this.getTagsUrl(packageName);
    const response = await this.httpClient.get<{ tags: string[] }>(url, this.getRegistryAuthHeaders());

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
    
    // Delete the package version via GitHub API
    const packageVersions = await this.getPackageVersions(packageName);
    const version = packageVersions.find(v => v.digest === manifest.digest);
    
    if (version) {
      const url = `${this.githubApiUrl}/users/${this.owner}/packages/container/${packageName}/versions/${version.id}`;
      await this.httpClient.delete(url, this.getAuthHeaders());
      this.logger.info(`Deleted tag ${tag} (version ${version.id}) from package ${packageName}`);
    } else {
      // Fallback: delete via registry API
      await this.deleteManifest(packageName, manifest.digest);
    }
  }

  async getManifest(packageName: string, reference: string): Promise<Manifest> {
    if (!this.authenticated) {
      await this.authenticate();
    }

    const url = this.getManifestUrl(packageName, reference);
    const headers = {
      ...this.getRegistryAuthHeaders(),
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

    const url = this.getManifestUrl(packageName, digest);
    await this.httpClient.delete(url, this.getRegistryAuthHeaders());
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
        return true; // GHCR supports OCI referrers
      case 'ATTESTATION':
        return true; // GHCR supports attestations
      case 'COSIGN':
        return true; // GHCR supports cosign
      default:
        return false;
    }
  }

  getKnownRegistryUrls(): string[] {
    return ['ghcr.io'];
  }
}
