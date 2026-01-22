import { Logger } from '../logger';
import { HttpClientOptions, RegistryApiResponse, RegistryError } from '../types';

/**
 * HTTP client with retry, throttle, and error handling
 */
export class HttpClient {
  private readonly logger: Logger;
  private readonly retry: number;
  private readonly throttle: number;
  private readonly timeout: number;
  private readonly defaultHeaders: Record<string, string>;

  constructor(logger: Logger, options: HttpClientOptions = {}) {
    this.logger = logger;
    this.retry = options.retry ?? 3;
    this.throttle = options.throttle ?? 1000;
    this.timeout = options.timeout ?? 30000;
    this.defaultHeaders = options.headers ?? {};
  }

  /**
   * Sleep for specified milliseconds
   */
  private async sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Make HTTP request with retry and throttle
   */
  async request<T = unknown>(
    url: string,
    options: RequestInit = {}
  ): Promise<RegistryApiResponse<T>> {
    const headers = {
      ...this.defaultHeaders,
      ...options.headers,
    };

    const requestOptions: RequestInit = {
      ...options,
      headers,
    };

    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= this.retry; attempt++) {
      try {
        // Throttle between retries (but not before first attempt)
        if (attempt > 0) {
          const delay = this.throttle * attempt; // Exponential backoff
          this.logger.debug(`Retrying request after ${delay}ms (attempt ${attempt + 1}/${this.retry + 1})`);
          await this.sleep(delay);
        }

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), this.timeout);

        try {
          const response = await fetch(url, {
            ...requestOptions,
            signal: controller.signal,
          });

          clearTimeout(timeoutId);

          const responseHeaders: Record<string, string> = {};
          response.headers.forEach((value, key) => {
            responseHeaders[key] = value;
          });

          let data: T | undefined;
          const contentType = response.headers.get('content-type');
          if (contentType?.includes('application/json')) {
            data = (await response.json()) as T;
          } else if (response.status !== 204) {
            data = (await response.text()) as unknown as T;
          }

          const apiResponse: RegistryApiResponse<T> = {
            data,
            status: response.status,
            statusText: response.statusText,
            headers: responseHeaders,
          };

          // Check for error status codes
          if (!response.ok) {
            const errorMessage = this.getErrorMessage(response.status, data);
            throw new RegistryError(
              errorMessage,
              response.status
            );
          }

          return apiResponse;
        } catch (error) {
          clearTimeout(timeoutId);
          throw error;
        }
      } catch (error) {
        lastError = error as Error;

        // Don't retry on certain errors
        if (error instanceof RegistryError) {
          // Don't retry on 4xx errors (client errors)
          if (error.statusCode && error.statusCode >= 400 && error.statusCode < 500) {
            throw error;
          }
        }

        // If this was the last attempt, throw the error
        if (attempt === this.retry) {
          break;
        }

        this.logger.debug(`Request failed: ${lastError.message}`);
      }
    }

    // If we get here, all retries failed
    if (lastError instanceof RegistryError) {
      throw lastError;
    }

    throw new RegistryError(
      `Request failed after ${this.retry + 1} attempts: ${lastError?.message ?? 'Unknown error'}`,
      undefined
    );
  }

  /**
   * GET request
   */
  async get<T = unknown>(url: string, headers?: Record<string, string>): Promise<RegistryApiResponse<T>> {
    return this.request<T>(url, {
      method: 'GET',
      headers,
    });
  }

  /**
   * DELETE request
   */
  async delete<T = unknown>(url: string, headers?: Record<string, string>): Promise<RegistryApiResponse<T>> {
    return this.request<T>(url, {
      method: 'DELETE',
      headers,
    });
  }

  /**
   * POST request
   */
  async post<T = unknown>(
    url: string,
    body?: unknown,
    headers?: Record<string, string>
  ): Promise<RegistryApiResponse<T>> {
    const requestHeaders: Record<string, string> = {
      'Content-Type': 'application/json',
      ...headers,
    };

    return this.request<T>(url, {
      method: 'POST',
      headers: requestHeaders,
      body: body ? JSON.stringify(body) : undefined,
    });
  }

  /**
   * PUT request
   */
  async put<T = unknown>(
    url: string,
    body?: unknown,
    headers?: Record<string, string>
  ): Promise<RegistryApiResponse<T>> {
    const requestHeaders: Record<string, string> = {
      'Content-Type': 'application/json',
      ...headers,
    };

    return this.request<T>(url, {
      method: 'PUT',
      headers: requestHeaders,
      body: body ? JSON.stringify(body) : undefined,
    });
  }

  /**
   * Get error message from response
   */
  private getErrorMessage(status: number, data: unknown): string {
    if (typeof data === 'object' && data !== null) {
      const errorData = data as Record<string, unknown>;
      if (errorData.message) {
        return String(errorData.message);
      }
      if (errorData.error) {
        return String(errorData.error);
      }
    }

    switch (status) {
      case 401:
        return 'Authentication failed';
      case 403:
        return 'Access forbidden';
      case 404:
        return 'Resource not found';
      case 429:
        return 'Rate limit exceeded';
      case 500:
        return 'Internal server error';
      case 502:
        return 'Bad gateway';
      case 503:
        return 'Service unavailable';
      default:
        return `HTTP ${status}: Request failed`;
    }
  }
}
