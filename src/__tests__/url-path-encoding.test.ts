import { safeSegment, safePath } from '../utils/validation';
import { GiteaProvider } from '../providers/gitea';
import { GHCRProvider } from '../providers/ghcr';
import { DockerHubProvider } from '../providers/dockerhub';
import { GenericOCIProvider } from '../providers/generic-oci';
import { Logger } from '../logger';
import { HttpClient } from '../utils/api';
import { ProviderConfig } from '../types';

jest.mock('../utils/api');

/**
 * A value interpolated unencoded into an API path can redirect the request to a different
 * endpoint. Verified against WHATWG URL resolution, which is what fetch applies:
 *
 *   pkg = "../../../user"  ->  /api/v1/packages/o/container/../../../user  =>  /api/v1/user
 *   pkg = ".."             ->  /api/v1/packages/o/container/..             =>  /api/v1/packages/o/
 *
 * The second is the dangerous one here: this action issues DELETE against these paths
 * (deleteTag on the Gitea, GHCR and Docker Hub providers; deleteManifest on the OCI
 * providers), so a redirected request acts on the COLLECTION rather than on one item.
 *
 * encodeURIComponent alone is NOT sufficient — it does not encode dots, so ".." survives it
 * unchanged. Tests assert the NORMALIZED pathname, because asserting the built string passes
 * while the sink stays open.
 *
 * Every interpolated value is attacker-influenceable: owner and package names come from the
 * `owner` / `packages` action inputs, tags come from the input filters or from a registry
 * response body, and digests come from a registry response body.
 */
const normalized = (url: string) => new URL(url).pathname;

const httpMock = () =>
  ({
    get: jest.fn(),
    post: jest.fn(),
    put: jest.fn(),
    delete: jest.fn()
  }) as unknown as jest.Mocked<HttpClient>;

const ok = (data: unknown = {}) => ({ data, status: 200, statusText: 'OK', headers: {} });

describe('safeSegment', () => {
  it('encodes slashes so a segment cannot introduce new path levels', () => {
    const url = `https://api.example.com/packages/o/container/${safeSegment('../../../user', 'package name')}`;
    expect(normalized(url)).toBe('/packages/o/container/..%2F..%2F..%2Fuser');
  });

  it.each(['..', '.'])('refuses a bare %s, which encoding alone would not stop', (dots) => {
    expect(() => safeSegment(dots, 'package name')).toThrow(/redirect/i);
  });

  it('encodes a query string so it cannot alter the request', () => {
    const url = `https://api.example.com/packages/o/container/${safeSegment('p?type=maven', 'package name')}`;
    expect(normalized(url)).toBe('/packages/o/container/p%3Ftype%3Dmaven');
    expect(new URL(url).search).toBe('');
  });

  it('encodes a fragment so the rest of the path is not discarded', () => {
    const url = `https://api.example.com/packages/o/container/${safeSegment('p#x', 'package name')}/v1`;
    expect(normalized(url)).toBe('/packages/o/container/p%23x/v1');
  });

  it('leaves an ordinary value readable', () => {
    expect(safeSegment('v1.2.3', 'tag')).toBe('v1.2.3');
  });

  it('names the label so an operator can tell which value was rejected', () => {
    expect(() => safeSegment('..', 'repository owner')).toThrow(/repository owner/);
  });
});

/**
 * OCI package names legitimately span several path segments ("owner/name/sub"), so they
 * cannot be encoded whole — the slashes between segments have to survive. safePath encodes
 * each segment separately and applies the same "." / ".." refusal per segment.
 */
describe('safePath', () => {
  it('keeps the separators between legitimate segments', () => {
    expect(safePath('owner/name/sub', 'package name')).toBe('owner/name/sub');
  });

  it('encodes what is inside each segment', () => {
    const url = `https://reg.example.com/v2/${safePath('owner/na me?x', 'package name')}/manifests/sha256:aa`;
    expect(normalized(url)).toBe('/v2/owner/na%20me%3Fx/manifests/sha256:aa');
  });

  it.each(['..', 'owner/..', '../owner', 'owner/../name'])('refuses %s', (value) => {
    expect(() => safePath(value, 'package name')).toThrow(/redirect/i);
  });
});

describe('providers do not let a value escape its path segment', () => {
  let logger: Logger;
  let http: jest.Mocked<HttpClient>;

  beforeEach(() => {
    jest.clearAllMocks();
    logger = new Logger(false);
    http = httpMock();
    (HttpClient as unknown as jest.Mock).mockImplementation(() => http);
  });

  const base: ProviderConfig = {
    registryType: 'gitea',
    registryUrl: 'https://gitea.example.com',
    owner: 'test-owner',
    repository: 'test-repo',
    token: 'test-token',
    expandPackages: false,
    useRegex: false
  } as ProviderConfig;

  describe('GiteaProvider.deleteTag (DELETE)', () => {
    const make = (over: Partial<ProviderConfig> = {}) =>
      new GiteaProvider(logger, { ...base, ...over } as ProviderConfig, http as never);

    it('stays on one version when the tag is a traversal', async () => {
      http.get.mockResolvedValue(ok({ id: 1 }) as never);
      http.delete.mockResolvedValue(ok() as never);
      await make().deleteTag('pkg', '../../../../user');
      expect(normalized(http.delete.mock.calls[0][0] as string)).toBe(
        '/api/v1/packages/test-owner/container/pkg/..%2F..%2F..%2F..%2Fuser'
      );
    });

    it('refuses a bare .. rather than issuing DELETE against the package collection', async () => {
      http.get.mockResolvedValue(ok({ id: 1 }) as never);
      await expect(make().deleteTag('pkg', '..')).rejects.toThrow(/redirect/i);
      expect(http.delete).not.toHaveBeenCalled();
    });

    it('a hostile owner from the owner input cannot escape its segment', async () => {
      http.get.mockResolvedValue(ok({ id: 1 }) as never);
      http.delete.mockResolvedValue(ok() as never);
      await make({ owner: '../..' }).deleteTag('pkg', 'v1');
      expect(normalized(http.delete.mock.calls[0][0] as string)).toBe('/api/v1/packages/..%2F../container/pkg/v1');
    });

    it('a hostile package name from the packages input cannot escape its segment', async () => {
      http.get.mockResolvedValue(ok({ id: 1 }) as never);
      http.delete.mockResolvedValue(ok() as never);
      await make().deleteTag('../../../user', 'v1');
      expect(normalized(http.delete.mock.calls[0][0] as string)).toBe(
        '/api/v1/packages/test-owner/container/..%2F..%2F..%2Fuser/v1'
      );
    });
  });

  describe('GHCRProvider.deleteTag (DELETE)', () => {
    const cfg = { ...base, registryType: 'ghcr', registryUrl: 'ghcr.io' } as ProviderConfig;
    const make = (over: Partial<ProviderConfig> = {}) => new GHCRProvider(logger, { ...cfg, ...over } as ProviderConfig, http as never);

    // deleteTag authenticates, resolves the owner type, lists versions, then DELETEs.
    const wireGets = () =>
      http.get.mockImplementation((async (url: string) => {
        if (url.endsWith('/user')) return ok({ login: 'test-owner' });
        if (/\/users\/[^/]+$/.test(url)) return ok({ type: 'User' });
        return ok([{ id: 42, name: 'v', metadata: { container: { tags: ['v1'] } }, created_at: '2024-01-01' }]);
      }) as never);

    it('stays on one version when the package name is a traversal', async () => {
      wireGets();
      http.delete.mockResolvedValue(ok() as never);
      await make().deleteTag('../../../user', 'v1');
      expect(normalized(http.delete.mock.calls[0][0] as string)).toBe(
        '/users/test-owner/packages/container/..%2F..%2F..%2Fuser/versions/42'
      );
    });

    it('refuses a bare .. rather than issuing DELETE against the versions collection', async () => {
      wireGets();
      await expect(make().deleteTag('..', 'v1')).rejects.toThrow(/redirect/i);
      expect(http.delete).not.toHaveBeenCalled();
    });

    it('a hostile owner from the owner input cannot escape its segment', async () => {
      wireGets();
      http.delete.mockResolvedValue(ok() as never);
      await make({ owner: '../..' }).deleteTag('pkg', 'v1');
      expect(normalized(http.delete.mock.calls[0][0] as string)).toBe(
        '/users/..%2F../packages/container/pkg/versions/42'
      );
    });
  });

  describe('DockerHubProvider.deleteTag (DELETE)', () => {
    const cfg = {
      ...base,
      registryType: 'docker-hub',
      registryUrl: 'docker.io',
      username: 'test-user',
      password: 'test-pass'
    } as ProviderConfig;
    const make = () => new DockerHubProvider(logger, cfg, http as never);

    it('stays on one tag when the tag is a traversal', async () => {
      http.post.mockResolvedValue(ok({ token: 'jwt' }) as never);
      http.delete.mockResolvedValue(ok() as never);
      await make().deleteTag('ns/repo', '../../../user');
      expect(normalized(http.delete.mock.calls[0][0] as string)).toBe(
        '/v2/repositories/ns/repo/tags/..%2F..%2F..%2Fuser/'
      );
    });

    it('refuses a bare .. rather than issuing DELETE against the tags collection', async () => {
      http.post.mockResolvedValue(ok({ token: 'jwt' }) as never);
      await expect(make().deleteTag('ns/repo', '..')).rejects.toThrow(/redirect/i);
      expect(http.delete).not.toHaveBeenCalled();
    });
  });

  describe('GenericOCIProvider.deleteManifest (DELETE via the shared OCI URL builders)', () => {
    const cfg = { ...base, registryType: 'oci', registryUrl: 'https://reg.example.com' } as ProviderConfig;
    const make = () => new GenericOCIProvider(logger, cfg, http as never);

    it('keeps a multi-segment package name intact but encodes each segment', async () => {
      http.get.mockResolvedValue(ok() as never);
      http.delete.mockResolvedValue(ok() as never);
      await make().deleteManifest('owner/na me', 'sha256:aa');
      expect(normalized(http.delete.mock.calls[0][0] as string)).toBe('/v2/owner/na%20me/manifests/sha256:aa');
    });

    it('refuses a package name whose segment is .. rather than DELETEing a different manifest', async () => {
      http.get.mockResolvedValue(ok() as never);
      await expect(make().deleteManifest('owner/..', 'sha256:aa')).rejects.toThrow(/redirect/i);
      expect(http.delete).not.toHaveBeenCalled();
    });

    it('refuses a digest of .. supplied by the registry', async () => {
      http.get.mockResolvedValue(ok() as never);
      await expect(make().deleteManifest('owner/pkg', '..')).rejects.toThrow(/redirect/i);
      expect(http.delete).not.toHaveBeenCalled();
    });
  });
});
