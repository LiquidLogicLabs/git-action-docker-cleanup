import {
  validateRegistryType,
  parseOlderThan,
  normalizeRegistryUrl,
  extractHostname,
  matchRegistryUrl,
} from '../utils/validation';

describe('validation', () => {
  describe('validateRegistryType', () => {
    it('should accept valid registry types', () => {
      expect(validateRegistryType('ghcr')).toBe('ghcr');
      expect(validateRegistryType('gitea')).toBe('gitea');
      expect(validateRegistryType('docker-hub')).toBe('docker-hub');
      expect(validateRegistryType('docker')).toBe('docker');
      expect(validateRegistryType('auto')).toBe('auto');
    });

    it('should throw error for invalid registry type', () => {
      expect(() => validateRegistryType('invalid')).toThrow('Invalid registry-type');
    });
  });

  describe('parseOlderThan', () => {
    it('should parse days correctly', () => {
      const date = parseOlderThan('30d');
      expect(date).toBeInstanceOf(Date);
      expect(date.getTime()).toBeLessThan(Date.now());
    });

    it('should parse weeks correctly', () => {
      const date = parseOlderThan('2w');
      expect(date).toBeInstanceOf(Date);
    });

    it('should parse months correctly', () => {
      const date = parseOlderThan('1m');
      expect(date).toBeInstanceOf(Date);
    });

    it('should throw error for invalid format', () => {
      expect(() => parseOlderThan('invalid')).toThrow('Invalid older-than format');
    });
  });

  describe('normalizeRegistryUrl', () => {
    it('should remove protocol', () => {
      expect(normalizeRegistryUrl('https://example.com')).toBe('example.com');
      expect(normalizeRegistryUrl('http://example.com')).toBe('example.com');
    });

    it('should remove trailing slash', () => {
      expect(normalizeRegistryUrl('example.com/')).toBe('example.com');
    });
  });

  describe('extractHostname', () => {
    it('should extract hostname from URL', () => {
      expect(extractHostname('https://example.com/path')).toBe('example.com');
      expect(extractHostname('example.com/path')).toBe('example.com');
    });
  });

  describe('matchRegistryUrl', () => {
    it('should match exact hostname', () => {
      expect(matchRegistryUrl('ghcr.io', ['ghcr.io'])).toBe(true);
    });

    it('should match subdomain', () => {
      expect(matchRegistryUrl('registry.example.com', ['example.com'])).toBe(true);
    });

    it('should not match different domain', () => {
      expect(matchRegistryUrl('other.com', ['example.com'])).toBe(false);
    });
  });
});
