// lib/api/client.ts
// Thin fetch wrapper for the ReelShort API: timeouts, one retry on transient
// failures, and a small in-memory TTL cache so re-entering a screen doesn't
// re-hit the network. Deliberately dependency-free.

export const API_BASE = 'https://reelshort.vercel.app';

const DEFAULT_TIMEOUT_MS = 20000;
/** Feeds and search change slowly; a title's episode list barely at all. */
const DEFAULT_TTL_MS = 5 * 60 * 1000;

export class ApiError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message);
    this.name = 'ApiError';
  }
}

type CacheEntry = { at: number; value: unknown };
const cache = new Map<string, CacheEntry>();
/** De-dupes concurrent requests for the same URL (two rows asking for /latest). */
const inflight = new Map<string, Promise<unknown>>();

function buildUrl(path: string, params: Record<string, string | number | undefined>): string {
  const qs = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== '') qs.set(key, String(value));
  }
  const query = qs.toString();
  return `${API_BASE}${path}${query ? `?${query}` : ''}`;
}

async function fetchJson<T>(url: string, timeoutMs: number): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) throw new ApiError(`Request failed (${res.status})`, res.status);

    // The API serves an HTML error page for unknown routes rather than JSON,
    // so parse defensively instead of trusting the content type.
    const text = await res.text();
    try {
      return JSON.parse(text) as T;
    } catch {
      throw new ApiError('Server returned an unexpected response');
    }
  } finally {
    clearTimeout(timer);
  }
}

export interface GetOptions {
  /** Cache lifetime in ms. Pass 0 to bypass the cache entirely. */
  ttlMs?: number;
  timeoutMs?: number;
}

/** GET a JSON endpoint, with caching, de-duping, and a single retry. */
export async function get<T>(
  path: string,
  params: Record<string, string | number | undefined> = {},
  options: GetOptions = {},
): Promise<T> {
  const { ttlMs = DEFAULT_TTL_MS, timeoutMs = DEFAULT_TIMEOUT_MS } = options;
  const url = buildUrl(path, params);

  if (ttlMs > 0) {
    const hit = cache.get(url);
    if (hit && Date.now() - hit.at < ttlMs) return hit.value as T;

    const pending = inflight.get(url);
    if (pending) return pending as Promise<T>;
  }

  const task = (async () => {
    try {
      return await fetchJson<T>(url, timeoutMs);
    } catch (err) {
      // One retry covers the cold-start latency of the upstream serverless
      // functions, which is the overwhelmingly common failure here.
      if (err instanceof ApiError && err.status && err.status < 500) throw err;
      return await fetchJson<T>(url, timeoutMs);
    }
  })();

  if (ttlMs > 0) inflight.set(url, task);

  try {
    const value = await task;
    if (ttlMs > 0) cache.set(url, { at: Date.now(), value });
    return value;
  } finally {
    inflight.delete(url);
  }
}

/** Drops every cached response — used by pull-to-refresh. */
export function clearCache(): void {
  cache.clear();
}
