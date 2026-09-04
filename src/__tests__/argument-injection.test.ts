import * as exec from '@actions/exec';
import { DockerCLIProvider } from '../providers/docker-cli';
import { Logger } from '../logger';
import { HttpClient } from '../utils/api';
import { ProviderConfig } from '../types';

jest.mock('@actions/exec');
jest.mock('../utils/api');

const MockedExec = exec as jest.Mocked<typeof exec>;

/**
 * ARGUMENT (OPTION) INJECTION through action inputs that reach `docker`'s argv.
 *
 * Passing an argv array stops the SHELL from interpreting a value. It does nothing about
 * the spawned program's OWN option parser, which reads a leading "-" as an option wherever
 * it appears in argv. The proven form of this bug is git:
 *
 *   git push origin --delete '--receive-pack=touch /tmp/PWNED' v9   -> the file is created
 *
 * `docker` has the same shape: a value that begins with "-" occupies an OPTION slot rather
 * than the value slot the code intended, changing which command actually runs.
 *
 * The reachable inputs in this action, all supplied by the consuming workflow:
 *
 *   registry-url       -> `docker login <registry-url> --username ...` (positional slot)
 *                      -> the leading segment of every image name passed to
 *                         `docker image rm` / `docker manifest inspect`
 *   registry-username  -> `docker login ... --username <registry-username>`
 *   package / packages -> the package segment of those same image names
 *
 * Every test below asserts BOTH that the call is refused AND that exec was never invoked,
 * so a test cannot pass merely because the hostile value failed somewhere downstream.
 */
describe('argument injection', () => {
  const optionLike = [
    '--receive-pack=touch /tmp/pwned',
    '--upload-pack=id',
    '-latest',
    '--config=/tmp/evil',
  ];

  const baseConfig: ProviderConfig = {
    registryType: 'docker',
    registryUrl: 'registry.example.com',
    owner: 'test-owner',
    repository: 'test-repo',
    token: 'test-token',
    username: 'test-user',
    password: 'test-password',
    expandPackages: false,
    useRegex: false,
  };

  let logger: Logger;
  let httpClient: HttpClient;

  const makeProvider = (overrides: Partial<ProviderConfig> = {}): DockerCLIProvider =>
    new DockerCLIProvider(logger, { ...baseConfig, ...overrides }, httpClient);

  beforeEach(() => {
    jest.clearAllMocks();
    logger = new Logger(false);
    httpClient = {
      get: jest.fn(),
      post: jest.fn(),
      delete: jest.fn(),
      put: jest.fn(),
      request: jest.fn(),
    } as unknown as HttpClient;
    MockedExec.exec.mockResolvedValue(0);
  });

  describe.each(optionLike)('registry-url %s', (payload) => {
    it('is refused before any docker process is spawned', () => {
      expect(() => makeProvider({ registryUrl: payload })).toThrow();
      expect(MockedExec.exec).not.toHaveBeenCalled();
    });

    // normalizeRegistryUrl() strips "https://", so the guard has to run AFTER
    // normalisation or a protocol prefix smuggles the option straight through.
    it('is refused even when a protocol prefix hides it', () => {
      expect(() => makeProvider({ registryUrl: `https://${payload}` })).toThrow();
      expect(MockedExec.exec).not.toHaveBeenCalled();
    });
  });

  describe.each(optionLike)('registry-username %s', (payload) => {
    it('is refused by docker login', async () => {
      const provider = makeProvider({ username: payload });
      await expect(provider.authenticate()).rejects.toThrow();
      expect(MockedExec.exec).not.toHaveBeenCalled();
    });
  });

  describe.each(optionLike)('package name %s', (payload) => {
    it('is refused by deleteTag', async () => {
      const provider = makeProvider();
      await expect(provider.deleteTag(payload, 'v1')).rejects.toThrow();
      expect(MockedExec.exec).not.toHaveBeenCalled();
    });

    it('is refused by getManifest', async () => {
      const provider = makeProvider();
      await expect(provider.getManifest(payload, 'v1')).rejects.toThrow();
      expect(MockedExec.exec).not.toHaveBeenCalled();
    });

    it('is refused by deleteManifest', async () => {
      const provider = makeProvider();
      await expect(provider.deleteManifest(payload, 'sha256:abc')).rejects.toThrow();
      expect(MockedExec.exec).not.toHaveBeenCalled();
    });

    it('is refused by listTags', async () => {
      const provider = makeProvider();
      await expect(provider.listTags(payload)).rejects.toThrow();
      expect(MockedExec.exec).not.toHaveBeenCalled();
    });

    it('is refused by getPackageManifests', async () => {
      const provider = makeProvider();
      await expect(provider.getPackageManifests(payload)).rejects.toThrow();
      expect(MockedExec.exec).not.toHaveBeenCalled();
    });
  });

  describe.each(optionLike)('tag %s', (payload) => {
    it('is refused by deleteTag', async () => {
      const provider = makeProvider();
      await expect(provider.deleteTag('my-package', payload)).rejects.toThrow();
      expect(MockedExec.exec).not.toHaveBeenCalled();
    });

    it('is refused by getManifest as a reference', async () => {
      const provider = makeProvider();
      await expect(provider.getManifest('my-package', payload)).rejects.toThrow();
      expect(MockedExec.exec).not.toHaveBeenCalled();
    });
  });

  describe('ordinary values still work', () => {
    it('logs in with a normal registry url and username', async () => {
      const provider = makeProvider();
      await provider.authenticate();
      expect(MockedExec.exec).toHaveBeenCalledWith(
        'docker',
        expect.arrayContaining(['login', 'registry.example.com', '--username', 'test-user']),
        expect.any(Object)
      );
    });

    it('deletes a normal image name', async () => {
      const provider = makeProvider({ username: undefined, password: undefined, token: undefined });
      await provider.deleteTag('my-package', 'v1.2.3');
      expect(MockedExec.exec).toHaveBeenCalledWith(
        'docker',
        ['image', 'rm', 'registry.example.com/my-package:v1.2.3'],
        expect.any(Object)
      );
    });
  });
});
