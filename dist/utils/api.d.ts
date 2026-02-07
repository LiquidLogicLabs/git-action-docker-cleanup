import { Logger } from '../logger';
import { HttpClientOptions, RegistryApiResponse } from '../types';
/**
 * HTTP client with retry, throttle, and error handling
 */
export declare class HttpClient {
    private readonly logger;
    private readonly retry;
    private readonly throttle;
    private readonly timeout;
    private readonly defaultHeaders;
    private readonly dispatcher?;
    constructor(logger: Logger, options?: HttpClientOptions);
    /**
     * Sleep for specified milliseconds
     */
    private sleep;
    /**
     * Make HTTP request with retry and throttle
     */
    request<T = unknown>(url: string, options?: RequestInit): Promise<RegistryApiResponse<T>>;
    /**
     * GET request
     */
    get<T = unknown>(url: string, headers?: Record<string, string>): Promise<RegistryApiResponse<T>>;
    /**
     * DELETE request
     */
    delete<T = unknown>(url: string, headers?: Record<string, string>): Promise<RegistryApiResponse<T>>;
    /**
     * POST request
     */
    post<T = unknown>(url: string, body?: unknown, headers?: Record<string, string>): Promise<RegistryApiResponse<T>>;
    /**
     * PUT request
     */
    put<T = unknown>(url: string, body?: unknown, headers?: Record<string, string>): Promise<RegistryApiResponse<T>>;
    /**
     * Get error message from response
     */
    private getErrorMessage;
}
//# sourceMappingURL=api.d.ts.map