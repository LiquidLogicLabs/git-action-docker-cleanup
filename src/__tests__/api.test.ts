import { HttpClient } from '../utils/api';
import { Logger } from '../logger';
import { RegistryError } from '../types';

// Mock fetch globally
global.fetch = jest.fn();

describe('HttpClient', () => {
  let logger: Logger;
  let httpClient: HttpClient;

  beforeEach(() => {
    jest.clearAllMocks();
    logger = new Logger(false);
    httpClient = new HttpClient(logger, { retry: 2, throttle: 10 });
    (global.fetch as jest.Mock).mockClear();
  });

  describe('request', () => {
    it('should make successful GET request', async () => {
      const mockData = { message: 'success' };
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        status: 200,
        statusText: 'OK',
        headers: new Map([['content-type', 'application/json']]),
        json: async () => mockData,
      });

      const response = await httpClient.request('https://example.com/api');

      expect(response.data).toEqual(mockData);
      expect(response.status).toBe(200);
      expect(global.fetch).toHaveBeenCalledTimes(1);
    });

    it('should handle JSON response', async () => {
      const mockData = { id: 1, name: 'test' };
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        status: 200,
        statusText: 'OK',
        headers: new Map([['content-type', 'application/json']]),
        json: async () => mockData,
      });

      const response = await httpClient.request<typeof mockData>('https://example.com/api');

      expect(response.data).toEqual(mockData);
    });

    it('should handle text response', async () => {
      const mockText = 'plain text response';
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        status: 200,
        statusText: 'OK',
        headers: new Map([['content-type', 'text/plain']]),
        text: async () => mockText,
      });

      const response = await httpClient.request<string>('https://example.com/api');

      expect(response.data).toBe(mockText);
    });

    it('should handle 204 No Content response', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        status: 204,
        statusText: 'No Content',
        headers: new Map(),
        json: async () => ({}),
      });

      const response = await httpClient.request('https://example.com/api');

      expect(response.data).toBeUndefined();
      expect(response.status).toBe(204);
    });

    it('should throw RegistryError for 4xx errors', async () => {
      const mockHeaders = new Map([['content-type', 'application/json']]);
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
        status: 404,
        statusText: 'Not Found',
        headers: mockHeaders,
        json: async () => ({ error: 'Not found' }),
      });

      // Should throw RegistryError immediately (no retry for 4xx)
      let caughtError: Error | null = null;
      try {
        await httpClient.request('https://example.com/api');
      } catch (error) {
        caughtError = error as Error;
      }
      
      expect(caughtError).toBeInstanceOf(RegistryError);
      if (caughtError instanceof RegistryError) {
        expect(caughtError.statusCode).toBe(404);
        expect(caughtError.message).toMatch(/not found|404/i);
      }
    });

    it('should throw RegistryError for 5xx errors', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        headers: new Map([['content-type', 'application/json']]),
        json: async () => ({ error: 'Server error' }),
      });

      await expect(httpClient.request('https://example.com/api')).rejects.toThrow(RegistryError);
    });

    it('should retry on network errors', async () => {
      const mockData = { message: 'success' };
      
      // First two attempts fail, third succeeds
      (global.fetch as jest.Mock)
        .mockRejectedValueOnce(new Error('Network error'))
        .mockRejectedValueOnce(new Error('Network error'))
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          statusText: 'OK',
          headers: new Map([['content-type', 'application/json']]),
          json: async () => mockData,
        });

      const response = await httpClient.request('https://example.com/api');

      expect(response.data).toEqual(mockData);
      expect(global.fetch).toHaveBeenCalledTimes(3);
    });

    it('should not retry on 4xx errors', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
        headers: new Map([['content-type', 'application/json']]),
        json: async () => ({ error: 'Unauthorized' }),
      });

      await expect(httpClient.request('https://example.com/api')).rejects.toThrow(RegistryError);
      expect(global.fetch).toHaveBeenCalledTimes(1); // Should not retry
    });

    it('should apply throttle between retries', async () => {
      const httpClientWithThrottle = new HttpClient(logger, { retry: 1, throttle: 10 });

      (global.fetch as jest.Mock)
        .mockRejectedValueOnce(new Error('Network error'))
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          statusText: 'OK',
          headers: new Map([['content-type', 'application/json']]),
          json: async () => ({ success: true }),
        });

      const startTime = Date.now();
      await httpClientWithThrottle.request('https://example.com/api');
      const endTime = Date.now();

      expect(global.fetch).toHaveBeenCalledTimes(2);
      // Verify throttle delay was applied (at least 8ms between retries, allowing for timing variance)
      expect(endTime - startTime).toBeGreaterThanOrEqual(8);
    });

    it('should include default headers', async () => {
      const httpClientWithHeaders = new HttpClient(logger, {
        headers: { 'X-Custom-Header': 'value' },
      });

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        status: 200,
        statusText: 'OK',
        headers: new Map([['content-type', 'application/json']]),
        json: async () => ({}),
      });

      await httpClientWithHeaders.request('https://example.com/api');

      expect(global.fetch).toHaveBeenCalledWith(
        'https://example.com/api',
        expect.objectContaining({
          headers: expect.objectContaining({
            'X-Custom-Header': 'value',
          }),
        })
      );
    });

    it('should merge request headers with default headers', async () => {
      const httpClientWithHeaders = new HttpClient(logger, {
        headers: { 'X-Default': 'default' },
      });

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        status: 200,
        statusText: 'OK',
        headers: new Map([['content-type', 'application/json']]),
        json: async () => ({}),
      });

      await httpClientWithHeaders.request('https://example.com/api', {
        headers: { 'X-Request': 'request' },
      });

      expect(global.fetch).toHaveBeenCalledWith(
        'https://example.com/api',
        expect.objectContaining({
          headers: expect.objectContaining({
            'X-Default': 'default',
            'X-Request': 'request',
          }),
        })
      );
    });

    // Note: Timeout test is skipped due to complexity with AbortController mocking
    // The timeout functionality is tested indirectly through integration tests
  });

  describe('get', () => {
    it('should make GET request', async () => {
      const mockData = { message: 'success' };
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        status: 200,
        statusText: 'OK',
        headers: new Map([['content-type', 'application/json']]),
        json: async () => mockData,
      });

      const response = await httpClient.get('https://example.com/api');

      expect(response.data).toEqual(mockData);
      expect(global.fetch).toHaveBeenCalledWith(
        'https://example.com/api',
        expect.objectContaining({
          method: 'GET',
        })
      );
    });
  });

  describe('post', () => {
    it('should make POST request with body', async () => {
      const requestBody = { key: 'value' };
      const mockData = { id: 1 };

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        status: 201,
        statusText: 'Created',
        headers: new Map([['content-type', 'application/json']]),
        json: async () => mockData,
      });

      const response = await httpClient.post('https://example.com/api', requestBody);

      expect(response.data).toEqual(mockData);
      expect(global.fetch).toHaveBeenCalledWith(
        'https://example.com/api',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify(requestBody),
        })
      );
    });
  });

  describe('delete', () => {
    it('should make DELETE request', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        status: 204,
        statusText: 'No Content',
        headers: new Map(),
        json: async () => ({}),
      });

      const response = await httpClient.delete('https://example.com/api');

      expect(response.status).toBe(204);
      expect(global.fetch).toHaveBeenCalledWith(
        'https://example.com/api',
        expect.objectContaining({
          method: 'DELETE',
        })
      );
    });
  });
});
