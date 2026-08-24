/**
 * Thrown by apiRequest when the response is not ok. Carries the HTTP
 * status so callers can distinguish e.g. 401 from 500 if needed.
 */
export class ApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

/**
 * Fetch wrapper that parses JSON, throws ApiError with the server's
 * `error` message on non-2xx responses, and types the successful result.
 */
export async function apiRequest<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const message = typeof data?.error === "string" ? data.error : `Request failed (${res.status})`;
    throw new ApiError(message, res.status);
  }
  return data as T;
}
