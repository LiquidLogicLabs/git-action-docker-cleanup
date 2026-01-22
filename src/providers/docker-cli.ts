import * as exec from '@actions/exec';
import {
  Package,
  Manifest,
  Tag,
  Referrer,
  RegistryFeature,
  ProviderConfig,
  AuthenticationError,
} from '../types';
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
export class DockerCLIProvider implements IRegistryProvider {
  private readonly logger: Logger;
  private readonly config: ProviderConfig;
  private readonly registryUrl: string;
  private authenticated: boolean = false;

  constructor(logger: Logger, config: ProviderConfig, _httpClient: HttpClient) {
    this.logger = logger;
    this.config = config;
    
    if (!config.registryUrl) {
      throw new Error('registry-url is required for Docker CLI provider');
    }

    this.registryUrl = this.normalizeRegistryUrl(config.registryUrl);
  }

  private normalizeRegistryUrl(url: string): string {
    // Remove protocol and trailing slash
    let normalized = url.replace(/^https?:\/\//, '').replace(/\/$/, '');
    return normalized;
  }

  private getImageName(packageName: string, tag?: string): string {
    const imageName = `${this.registryUrl}/${packageName}`;
    return tag ? `${imageName}:${tag}` : imageName;
  }

  /**
   * Execute docker command and parse JSON output
   * Automatically adds --format json if not already present
   */
  private async execDockerJson<T = unknown>(args: string[]): Promise<T[]> {
    // Work with a copy to avoid mutating the original array
    const dockerArgs = [...args];
    
    // Ensure --format json is set for JSON output
    const formatIndex = dockerArgs.indexOf('--format');
    if (formatIndex === -1) {
      // No --format found, add it
      dockerArgs.push('--format', '{{json .}}');
    } else if (formatIndex + 1 >= dockerArgs.length || dockerArgs[formatIndex + 1] !== '{{json .}}') {
      // --format found but not set to json, update it
      dockerArgs[formatIndex + 1] = '{{json .}}';
    }
    // If --format {{json .}} is already present, use dockerArgs as-is

    let output = '';
    
    await exec.exec('docker', dockerArgs, {
      silent: !this.logger.verbose,
      listeners: {
        stdout: (data: Buffer) => {
          output += data.toString();
        },
        stderr: (data: Buffer) => {
          // Log stderr but don't fail
          this.logger.debug(`Docker stderr: ${data.toString()}`);
        },
      },
    });

    if (!output.trim()) {
      return [];
    }

    // Parse JSON lines (each line is a JSON object)
    const lines = output.trim().split('\n');
    const results: T[] = [];
    
    for (const line of lines) {
      if (line.trim()) {
        try {
          results.push(JSON.parse(line) as T);
        } catch (error) {
          this.logger.debug(`Failed to parse JSON line: ${line}`);
        }
      }
    }

    return results;
  }

  async authenticate(): Promise<void> {
    try {
      const username = this.config.username;
      const password = this.config.password || this.config.token;

      if (!username || !password) {
        throw new AuthenticationError(
          'Docker CLI provider requires username and password/token for authentication',
          'docker'
        );
      }

      // Login to registry using docker login
      const loginArgs = [
        'login',
        this.registryUrl,
        '--username',
        username,
        '--password-stdin',
      ];

      await exec.exec('docker', loginArgs, {
        input: Buffer.from(password),
        silent: !this.logger.verbose,
      });

      this.authenticated = true;
      this.logger.debug(`Successfully authenticated with registry ${this.registryUrl}`);
    } catch (error) {
      throw new AuthenticationError(
        `Docker login failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'docker'
      );
    }
  }

  async listPackages(): Promise<Package[]> {
    if (!this.authenticated) {
      await this.authenticate();
    }

    // Use docker image ls to list local images, filter by registry URL
    const images = await this.execDockerJson<{
      Repository: string;
      Tag: string;
      ID: string;
      CreatedAt: string;
      Size: string;
    }>(['image', 'ls']);

    // Extract unique package names from images that match our registry
    const packageNames = new Set<string>();
    
    for (const image of images) {
      // Check if image belongs to our registry
      if (image.Repository.startsWith(`${this.registryUrl}/`)) {
        // Extract package name (everything after registry URL)
        const packageName = image.Repository.replace(`${this.registryUrl}/`, '');
        packageNames.add(packageName);
      }
    }

    const packages: Package[] = [];
    for (const name of packageNames) {
      packages.push({
        id: name,
        name,
        type: 'container',
      });
    }

    this.logger.debug(`Found ${packages.length} packages from local Docker images`);
    return packages;
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

    // Use docker image ls to list local images for this package
    const imageName = `${this.registryUrl}/${packageName}`;
    const images = await this.execDockerJson<{
      Repository: string;
      Tag: string;
      ID: string;
      CreatedAt: string;
      Size: string;
    }>(['image', 'ls']);

    const tags: Tag[] = [];
    
    for (const image of images) {
      if (image.Repository === imageName) {
        // Get manifest to get digest
        try {
          const manifest = await this.getManifest(packageName, image.Tag);
          tags.push({
            name: image.Tag,
            digest: manifest.digest,
            createdAt: new Date(image.CreatedAt),
          });
        } catch (error) {
          // If we can't get manifest, still add the tag with ID as digest
          this.logger.debug(`Could not get manifest for ${imageName}:${image.Tag}, using image ID as digest`);
          tags.push({
            name: image.Tag,
            digest: image.ID,
            createdAt: new Date(image.CreatedAt),
          });
        }
      }
    }

    this.logger.debug(`Found ${tags.length} tags for ${packageName} from local Docker images`);
    return tags;
  }

  async deleteTag(packageName: string, tag: string): Promise<void> {
    if (!this.authenticated) {
      await this.authenticate();
    }

    const imageName = this.getImageName(packageName, tag);
    
    try {
      // Delete local image using docker image rm
      await exec.exec('docker', ['image', 'rm', imageName], {
        silent: !this.logger.verbose,
      });
      this.logger.info(`Deleted local image ${imageName}`);
    } catch (error) {
      // Check if image doesn't exist locally (that's okay)
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      if (errorMsg.includes('No such image') || errorMsg.includes('image not found')) {
        this.logger.debug(`Image ${imageName} not found locally, may have already been deleted`);
        return;
      }
      throw new Error(`Failed to delete image ${imageName}: ${errorMsg}`);
    }
  }

  async getManifest(packageName: string, reference: string): Promise<Manifest> {
    if (!this.authenticated) {
      await this.authenticate();
    }

    const imageName = this.getImageName(packageName, reference);
    let manifestOutput = '';

    try {
      // Get manifest using docker manifest inspect
      await exec.exec('docker', ['manifest', 'inspect', imageName], {
        silent: !this.logger.verbose,
        listeners: {
          stdout: (data: Buffer) => {
            manifestOutput += data.toString();
          },
        },
      });

      const manifestData = JSON.parse(manifestOutput);
      
      // Parse OCI manifest
      const mediaType = manifestData.mediaType || manifestData.schemaVersion ? 'application/vnd.docker.distribution.manifest.v2+json' : 'application/vnd.oci.image.manifest.v1+json';
      
      // Check if it's a multi-arch manifest (index)
      const isIndex = mediaType.includes('manifest.list') || mediaType.includes('image.index');
      
      const manifest: Manifest = {
        digest: reference.startsWith('sha256:') ? reference : `sha256:${reference}`,
        mediaType,
        size: JSON.stringify(manifestData).length,
        createdAt: manifestData.created ? new Date(manifestData.created) : undefined,
      };

      if (isIndex && manifestData.manifests) {
        manifest.manifests = manifestData.manifests.map((m: {
          digest: string;
          mediaType: string;
          size: number;
          platform?: { architecture: string; os: string; variant?: string };
        }) => ({
          digest: m.digest,
          mediaType: m.mediaType,
          size: m.size,
          platform: m.platform,
        }));
      } else if (manifestData.config) {
        manifest.config = {
          digest: manifestData.config.digest,
          mediaType: manifestData.config.mediaType || 'application/vnd.docker.container.image.v1+json',
          size: manifestData.config.size || 0,
        };
      }

      if (manifestData.layers) {
        manifest.layers = manifestData.layers.map((l: {
          digest: string;
          mediaType: string;
          size: number;
        }) => ({
          digest: l.digest,
          mediaType: l.mediaType,
          size: l.size,
        }));
      }

      return manifest;
    } catch (error) {
      throw new Error(`Failed to get manifest for ${packageName}@${reference}: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async deleteManifest(packageName: string, digest: string): Promise<void> {
    if (!this.authenticated) {
      await this.authenticate();
    }

    // Try to find local images with this digest and delete them
    const images = await this.execDockerJson<{
      Repository: string;
      Tag: string;
      ID: string;
    }>(['image', 'ls']);

    const imageName = `${this.registryUrl}/${packageName}`;
    let deleted = false;

    for (const image of images) {
      if (image.Repository === imageName && image.ID.startsWith(digest.replace('sha256:', ''))) {
        try {
          await exec.exec('docker', ['image', 'rm', `${image.Repository}:${image.Tag}`], {
            silent: !this.logger.verbose,
          });
          this.logger.info(`Deleted local image ${image.Repository}:${image.Tag} (digest: ${digest})`);
          deleted = true;
        } catch (error) {
          this.logger.debug(`Could not delete ${image.Repository}:${image.Tag}: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
      }
    }

    if (!deleted) {
      this.logger.debug(`No local images found with digest ${digest} for ${packageName}`);
    }
  }

  async getReferrers(packageName: string, digest: string): Promise<Referrer[]> {
    // Docker CLI doesn't support referrers API
    return [];
  }

  supportsFeature(feature: RegistryFeature): boolean {
    switch (feature) {
      case 'MULTI_ARCH':
        return true; // Docker CLI can inspect multi-arch manifests
      case 'REFERRERS':
        return false; // Docker CLI doesn't support referrers API
      case 'ATTESTATION':
        return false; // Docker CLI doesn't support attestations
      case 'COSIGN':
        return false; // Docker CLI doesn't support cosign directly
      default:
        return false;
    }
  }

  getKnownRegistryUrls(): string[] {
    // Docker CLI is a fallback provider, no known URLs
    return [];
  }
}
