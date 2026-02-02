/**
 * Mission Control SDK - HTTP Client with retry logic
 */

import type { MCClientConfig } from './types';
import {
  MCError,
  MCNetworkError,
  MCTimeoutError,
  MCRateLimitError,
  MCServerError,
  throwForStatus,
} from './errors';

// Default configuration
const DEFAULT_MAX_RETRIES = 3;
const DEFAULT_RETRY_DELAY_MS = 1000;
const DEFAULT_TIMEOUT_MS = 30000;

// Retryable status codes
const RETRYABLE_STATUS_CODES = new Set([408, 429, 500, 502, 503, 504]);

/**
 * Calculate exponential backoff delay
 */
function getBackoffDelay(attempt: number, baseDelay: number, jitter = true): number {
  const exponentialDelay = baseDelay * Math.pow(2, attempt);
  const maxDelay = 30000; // Cap at 30 seconds
  const delay = Math.min(exponentialDelay, maxDelay);
  
  if (jitter) {
    // Add random jitter ±20%
    const jitterRange = delay * 0.2;
    return delay + (Math.random() * jitterRange * 2 - jitterRange);
  }
  
  return delay;
}

/**
 * Sleep for specified milliseconds
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Check if error is retryable
 */
function isRetryableError(error: unknown): boolean {
  if (error instanceof MCRateLimitError) return true;
  if (error instanceof MCServerError) return true;
  if (error instanceof MCNetworkError) return true;
  if (error instanceof MCTimeoutError) return true;
  if (error instanceof MCError && RETRYABLE_STATUS_CODES.has(error.status)) return true;
  return false;
}

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

export interface RequestOptions {
  method?: HttpMethod;
  body?: unknown;
  headers?: Record<string, string>;
  timeout?: number;
  skipRetry?: boolean;
}

/**
 * Core HTTP client for Mission Control API
 */
export class MCHttpClient {
  private readonly baseURL: string;
  private readonly token: string;
  private readonly maxRetries: number;
  private readonly retryDelayMs: number;
  private readonly timeoutMs: number;

  constructor(config: MCClientConfig) {
    // Normalize baseURL - remove trailing slash
    this.baseURL = config.baseURL.replace(/\/+$/, '');
    this.token = config.token;
    this.maxRetries = config.maxRetries ?? DEFAULT_MAX_RETRIES;
    this.retryDelayMs = config.retryDelayMs ?? DEFAULT_RETRY_DELAY_MS;
    this.timeoutMs = config.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  }

  /**
   * Build full URL from path
   */
  private buildURL(path: string): string {
    const normalizedPath = path.startsWith('/') ? path : `/${path}`;
    return `${this.baseURL}${normalizedPath}`;
  }

  /**
   * Execute HTTP request with timeout
   */
  private async executeRequest(url: string, init: RequestInit, timeout: number): Promise<Response> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
      const response = await fetch(url, {
        ...init,
        signal: controller.signal,
      });
      return response;
    } catch (error) {
      if (error instanceof Error) {
        if (error.name === 'AbortError') {
          throw new MCTimeoutError(`Request timed out after ${timeout}ms`, timeout);
        }
        throw new MCNetworkError(`Network error: ${error.message}`, error);
      }
      throw new MCNetworkError('Unknown network error');
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /**
   * Make HTTP request with retry logic
   */
  async request<T>(path: string, options: RequestOptions = {}): Promise<T> {
    const {
      method = 'GET',
      body,
      headers = {},
      timeout = this.timeoutMs,
      skipRetry = false,
    } = options;

    const url = this.buildURL(path);
    
    const requestHeaders: Record<string, string> = {
      'Authorization': `Bearer ${this.token}`,
      'Content-Type': 'application/json',
      ...headers,
    };

    const init: RequestInit = {
      method,
      headers: requestHeaders,
    };

    if (body !== undefined) {
      init.body = JSON.stringify(body);
    }

    // Determine max attempts
    const maxAttempts = skipRetry ? 1 : this.maxRetries + 1;
    let lastError: Error | undefined;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      try {
        const response = await this.executeRequest(url, init, timeout);
        
        // Throw typed error for non-2xx responses
        await throwForStatus(response);

        // Parse JSON response
        const text = await response.text();
        if (!text) {
          return {} as T;
        }
        return JSON.parse(text) as T;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        // Check if we should retry
        const shouldRetry = !skipRetry && 
                           attempt < maxAttempts - 1 && 
                           isRetryableError(error);

        if (!shouldRetry) {
          throw error;
        }

        // Calculate backoff delay
        let delay: number;
        if (error instanceof MCRateLimitError && error.retryAfterMs) {
          delay = error.retryAfterMs;
        } else {
          delay = getBackoffDelay(attempt, this.retryDelayMs);
        }

        // Wait before retry
        await sleep(delay);
      }
    }

    // Should never reach here, but TypeScript needs it
    throw lastError || new MCError('Request failed after retries', 0);
  }

  // Convenience methods

  async get<T>(path: string, options?: Omit<RequestOptions, 'method' | 'body'>): Promise<T> {
    return this.request<T>(path, { ...options, method: 'GET' });
  }

  async post<T>(path: string, body?: unknown, options?: Omit<RequestOptions, 'method' | 'body'>): Promise<T> {
    return this.request<T>(path, { ...options, method: 'POST', body });
  }

  async put<T>(path: string, body?: unknown, options?: Omit<RequestOptions, 'method' | 'body'>): Promise<T> {
    return this.request<T>(path, { ...options, method: 'PUT', body });
  }

  async patch<T>(path: string, body?: unknown, options?: Omit<RequestOptions, 'method' | 'body'>): Promise<T> {
    return this.request<T>(path, { ...options, method: 'PATCH', body });
  }

  async delete<T>(path: string, options?: Omit<RequestOptions, 'method' | 'body'>): Promise<T> {
    return this.request<T>(path, { ...options, method: 'DELETE' });
  }
}
