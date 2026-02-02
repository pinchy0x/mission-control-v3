/**
 * Mission Control SDK Error Classes
 */

export interface MCErrorDetails {
  status: number;
  message: string;
  error?: string;
  blockers?: Array<{ id: string; title: string; status: string }>;
}

/**
 * Base error class for Mission Control SDK
 */
export class MCError extends Error {
  public readonly status: number;
  public readonly details?: MCErrorDetails;

  constructor(message: string, status: number, details?: MCErrorDetails) {
    super(message);
    this.name = 'MCError';
    this.status = status;
    this.details = details;
    Object.setPrototypeOf(this, MCError.prototype);
  }
}

/**
 * 400 Bad Request - Invalid input
 */
export class MCValidationError extends MCError {
  constructor(message: string, details?: MCErrorDetails) {
    super(message, 400, details);
    this.name = 'MCValidationError';
    Object.setPrototypeOf(this, MCValidationError.prototype);
  }
}

/**
 * 401 Unauthorized - Invalid or missing token
 */
export class MCUnauthorizedError extends MCError {
  constructor(message: string = 'Unauthorized', details?: MCErrorDetails) {
    super(message, 401, details);
    this.name = 'MCUnauthorizedError';
    Object.setPrototypeOf(this, MCUnauthorizedError.prototype);
  }
}

/**
 * 403 Forbidden - Insufficient permissions
 */
export class MCForbiddenError extends MCError {
  constructor(message: string, details?: MCErrorDetails) {
    super(message, 403, details);
    this.name = 'MCForbiddenError';
    Object.setPrototypeOf(this, MCForbiddenError.prototype);
  }
}

/**
 * 404 Not Found - Resource doesn't exist
 */
export class MCNotFoundError extends MCError {
  constructor(message: string, details?: MCErrorDetails) {
    super(message, 404, details);
    this.name = 'MCNotFoundError';
    Object.setPrototypeOf(this, MCNotFoundError.prototype);
  }
}

/**
 * 409 Conflict - Resource state conflict (e.g., blocked task, duplicate)
 */
export class MCConflictError extends MCError {
  public readonly blockers?: Array<{ id: string; title: string; status: string }>;

  constructor(message: string, details?: MCErrorDetails) {
    super(message, 409, details);
    this.name = 'MCConflictError';
    this.blockers = details?.blockers;
    Object.setPrototypeOf(this, MCConflictError.prototype);
  }
}

/**
 * 429 Rate Limited
 */
export class MCRateLimitError extends MCError {
  public readonly retryAfterMs?: number;

  constructor(message: string = 'Rate limit exceeded', retryAfterMs?: number, details?: MCErrorDetails) {
    super(message, 429, details);
    this.name = 'MCRateLimitError';
    this.retryAfterMs = retryAfterMs;
    Object.setPrototypeOf(this, MCRateLimitError.prototype);
  }
}

/**
 * 5xx Server Error
 */
export class MCServerError extends MCError {
  constructor(message: string, status: number = 500, details?: MCErrorDetails) {
    super(message, status, details);
    this.name = 'MCServerError';
    Object.setPrototypeOf(this, MCServerError.prototype);
  }
}

/**
 * Network/connection error
 */
export class MCNetworkError extends MCError {
  public readonly originalError?: Error;

  constructor(message: string, originalError?: Error) {
    super(message, 0);
    this.name = 'MCNetworkError';
    this.originalError = originalError;
    Object.setPrototypeOf(this, MCNetworkError.prototype);
  }
}

/**
 * Request timeout
 */
export class MCTimeoutError extends MCError {
  public readonly timeoutMs: number;

  constructor(message: string, timeoutMs: number) {
    super(message, 0);
    this.name = 'MCTimeoutError';
    this.timeoutMs = timeoutMs;
    Object.setPrototypeOf(this, MCTimeoutError.prototype);
  }
}

/**
 * Parse HTTP response and throw appropriate error
 */
export async function throwForStatus(response: Response): Promise<void> {
  if (response.ok) return;

  let details: MCErrorDetails | undefined;
  try {
    const json = await response.json() as Record<string, unknown>;
    details = {
      status: response.status,
      message: (json.message as string) || (json.error as string) || response.statusText,
      error: json.error as string | undefined,
      blockers: json.blockers as Array<{ id: string; title: string; status: string }> | undefined,
    };
  } catch {
    details = {
      status: response.status,
      message: response.statusText,
    };
  }

  const message = details.error || details.message || `HTTP ${response.status}`;

  switch (response.status) {
    case 400:
      throw new MCValidationError(message, details);
    case 401:
      throw new MCUnauthorizedError(message, details);
    case 403:
      throw new MCForbiddenError(message, details);
    case 404:
      throw new MCNotFoundError(message, details);
    case 409:
      throw new MCConflictError(message, details);
    case 429: {
      const retryAfter = response.headers.get('Retry-After');
      const retryMs = retryAfter ? parseInt(retryAfter, 10) * 1000 : undefined;
      throw new MCRateLimitError(message, retryMs, details);
    }
    default:
      if (response.status >= 500) {
        throw new MCServerError(message, response.status, details);
      }
      throw new MCError(message, response.status, details);
  }
}
