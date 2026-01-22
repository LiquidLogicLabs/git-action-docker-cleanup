"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.HttpClient = void 0;
const types_1 = require("../types");
/**
 * HTTP client with retry, throttle, and error handling
 */
class HttpClient {
    logger;
    retry;
    throttle;
    timeout;
    defaultHeaders;
    constructor(logger, options = {}) {
        this.logger = logger;
        this.retry = options.retry ?? 3;
        this.throttle = options.throttle ?? 1000;
        this.timeout = options.timeout ?? 30000;
        this.defaultHeaders = options.headers ?? {};
    }
    /**
     * Sleep for specified milliseconds
     */
    async sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
    /**
     * Make HTTP request with retry and throttle
     */
    async request(url, options = {}) {
        const headers = {
            ...this.defaultHeaders,
            ...options.headers,
        };
        const requestOptions = {
            ...options,
            headers,
        };
        let lastError = null;
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
                    const responseHeaders = {};
                    response.headers.forEach((value, key) => {
                        responseHeaders[key] = value;
                    });
                    let data;
                    const contentType = response.headers.get('content-type');
                    if (contentType?.includes('application/json')) {
                        data = (await response.json());
                    }
                    else if (response.status !== 204) {
                        data = (await response.text());
                    }
                    const apiResponse = {
                        data,
                        status: response.status,
                        statusText: response.statusText,
                        headers: responseHeaders,
                    };
                    // Check for error status codes
                    if (!response.ok) {
                        const errorMessage = this.getErrorMessage(response.status, data);
                        throw new types_1.RegistryError(errorMessage, response.status);
                    }
                    return apiResponse;
                }
                catch (error) {
                    clearTimeout(timeoutId);
                    throw error;
                }
            }
            catch (error) {
                lastError = error;
                // Don't retry on certain errors
                if (error instanceof types_1.RegistryError) {
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
        if (lastError instanceof types_1.RegistryError) {
            throw lastError;
        }
        throw new types_1.RegistryError(`Request failed after ${this.retry + 1} attempts: ${lastError?.message ?? 'Unknown error'}`, undefined);
    }
    /**
     * GET request
     */
    async get(url, headers) {
        return this.request(url, {
            method: 'GET',
            headers,
        });
    }
    /**
     * DELETE request
     */
    async delete(url, headers) {
        return this.request(url, {
            method: 'DELETE',
            headers,
        });
    }
    /**
     * POST request
     */
    async post(url, body, headers) {
        const requestHeaders = {
            'Content-Type': 'application/json',
            ...headers,
        };
        return this.request(url, {
            method: 'POST',
            headers: requestHeaders,
            body: body ? JSON.stringify(body) : undefined,
        });
    }
    /**
     * PUT request
     */
    async put(url, body, headers) {
        const requestHeaders = {
            'Content-Type': 'application/json',
            ...headers,
        };
        return this.request(url, {
            method: 'PUT',
            headers: requestHeaders,
            body: body ? JSON.stringify(body) : undefined,
        });
    }
    /**
     * Get error message from response
     */
    getErrorMessage(status, data) {
        if (typeof data === 'object' && data !== null) {
            const errorData = data;
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
exports.HttpClient = HttpClient;
//# sourceMappingURL=api.js.map