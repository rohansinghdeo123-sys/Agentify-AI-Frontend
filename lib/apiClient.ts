export type BackendHealth = {
  status?: string;
  service?: string;
  artifacts_ready?: boolean;
  artifact_sections?: string[];
};

type JsonRequestOptions = RequestInit & {
  invalidateOnSuccess?: boolean;
  cacheKey?: string;
  cacheTtlMs?: number;
  forceFresh?: boolean;
  retries?: number;
  timeoutMs?: number;
};

type ApiFetchOptions = RequestInit & {
  retries?: number;
  timeoutMs?: number;
};

type CacheEntry = {
  expiresAt: number;
  value: unknown;
};

const responseCache = new Map<string, CacheEntry>();
const inFlightJson = new Map<string, Promise<unknown>>();
const backendReadyAt = new Map<string, number>();
const backendWarmups = new Map<string, Promise<BackendHealth | null>>();

const BACKEND_READY_TTL_MS = 45000;
const MAX_RESPONSE_CACHE_ENTRIES = 256;
let cacheGeneration = 0;

function sleep(ms: number) {
  return new Promise((resolve) => globalThis.setTimeout(resolve, ms));
}

function isBackendLiveStatus(status?: string) {
  const normalized = String(status || "").toLowerCase();
  return normalized === "online" || normalized === "ok" || normalized === "ready" || normalized === "degraded";
}

function getRequestKey(url: string, options: JsonRequestOptions) {
  // Partition even caller-supplied keys by endpoint and credentials. Never
  // share private responses between accounts, tokens, or backend deployments.
  const headers = Array.from(new Headers(options.headers).entries()).sort(([a], [b]) => a.localeCompare(b));
  return JSON.stringify([options.cacheKey || "", options.method || "GET", url,
    String(options.body || ""), options.credentials || "same-origin", headers]);
}

function shouldRetry(status: number) {
  return status === 408 || status === 425 || status === 429 || status >= 500;
}

export class ApiRequestError extends Error {
  status: number;

  constructor(message: string, status = 0) {
    super(message);
    this.name = "ApiRequestError";
    this.status = status;
  }
}

export async function apiFetch(
  url: string,
  options: ApiFetchOptions = {},
) {
  const {
    retries = 0,
    timeoutMs = 9000,
    signal,
    ...requestInit
  } = options;
  let lastError: unknown;

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const controller = new AbortController();
    const abort = () => controller.abort();
    const timeout = globalThis.setTimeout(abort, timeoutMs);
    signal?.addEventListener("abort", abort, { once: true });
    if (signal?.aborted) controller.abort();

    try {
      const response = await fetch(url, {
        cache: "no-store",
        ...requestInit,
        signal: controller.signal,
      });
      if (response.ok || attempt === retries || !shouldRetry(response.status)) {
        return response;
      }
      lastError = new ApiRequestError(`Request failed: ${response.status}`, response.status);
    } catch (error) {
      lastError = error;
      if ((error as Error).name === "AbortError" && signal?.aborted) throw error;
      if (attempt === retries) throw error;
    } finally {
      globalThis.clearTimeout(timeout);
      signal?.removeEventListener("abort", abort);
    }

    await sleep(250 * (attempt + 1));
  }

  throw lastError instanceof Error ? lastError : new ApiRequestError("Request failed");
}

export async function apiJson<T>(url: string, options: JsonRequestOptions = {}): Promise<T> {
  const method = String(options.method || "GET").toUpperCase();
  const cacheTtlMs = options.cacheTtlMs ?? 0;
  const forceFresh = options.forceFresh ?? false;
  const requestKey = getRequestKey(url, options);
  const cached = responseCache.get(requestKey);
  const generation = cacheGeneration;
  // A caller-owned cancellation must never abort a different subscriber.
  const canDeduplicate = method === "GET" && !options.signal;

  if (method === "GET" && !options.signal?.aborted && !forceFresh && cached && cached.expiresAt > Date.now()) {
    return cached.value as T;
  }

  if (canDeduplicate && inFlightJson.has(requestKey)) {
    return inFlightJson.get(requestKey) as Promise<T>;
  }

  const request = (async () => {
    const response = await apiFetch(url, options);
    const data = await response.json().catch(() => null);
    if (!response.ok) {
      const detail =
        data && typeof data === "object" && "detail" in data
          ? String((data as { detail?: unknown }).detail || "")
          : "";
      throw new ApiRequestError(detail || `Request failed: ${response.status}`, response.status);
    }
    if (method !== "GET" && method !== "HEAD" && options.invalidateOnSuccess !== false) invalidateApiCache();
    if (method === "GET" && cacheTtlMs > 0 && generation === cacheGeneration) {
      for (const [key, entry] of responseCache) if (entry.expiresAt <= Date.now()) responseCache.delete(key);
      if (responseCache.size >= MAX_RESPONSE_CACHE_ENTRIES) responseCache.delete(responseCache.keys().next().value!);
      responseCache.set(requestKey, {
        expiresAt: Date.now() + cacheTtlMs,
        value: data,
      });
    }
    return data as T;
  })();

  if (canDeduplicate) {
    inFlightJson.set(requestKey, request);
  }

  try {
    return await request;
  } finally {
    if (canDeduplicate) {
      if (inFlightJson.get(requestKey) === request) inFlightJson.delete(requestKey);
    }
  }
}

export function invalidateApiCache(prefix?: string) {
  cacheGeneration++;
  inFlightJson.clear();
  if (!prefix) {
    responseCache.clear();
    return;
  }

  for (const key of responseCache.keys()) {
    if (key.includes(prefix)) responseCache.delete(key);
  }
}

export function resetApiClientForTests() {
  cacheGeneration++;
  responseCache.clear();
  inFlightJson.clear();
  backendReadyAt.clear();
  backendWarmups.clear();
}

export function isBackendRecentlyReady(backendURL: string, maxAgeMs = BACKEND_READY_TTL_MS) {
  const readyAt = backendReadyAt.get(backendURL) || 0;
  return Date.now() - readyAt < maxAgeMs;
}

export async function warmBackend(backendURL: string, options: { forceFresh?: boolean; timeoutMs?: number } = {}) {
  const forceFresh = options.forceFresh ?? false;
  const timeoutMs = options.timeoutMs ?? 10000;
  const cacheBust = forceFresh ? `?ts=${Date.now()}` : "";
  const liveURL = `${backendURL}/health/live${cacheBust}`;
  const fallbackURL = `${backendURL}/health${cacheBust}`;
  let health: BackendHealth;
  try {
    health = await apiJson<BackendHealth>(liveURL, {
      cacheKey: forceFresh ? undefined : `health:${backendURL}`,
      cacheTtlMs: 0,
      forceFresh,
      retries: 1,
      timeoutMs,
    });
  } catch (error) {
    if (!(error instanceof ApiRequestError) || (error.status !== 404 && error.status !== 405)) {
      throw error;
    }
    health = await apiJson<BackendHealth>(fallbackURL, {
      cacheKey: forceFresh ? undefined : `health-fallback:${backendURL}`,
      cacheTtlMs: 0,
      forceFresh,
      retries: 1,
      timeoutMs,
    });
  }

  if (isBackendLiveStatus(health.status)) {
    backendReadyAt.set(backendURL, Date.now());
  }

  return health;
}

export async function ensureBackendReady(
  backendURL: string,
  options: { timeoutMs?: number; pollMs?: number; forceFresh?: boolean } = {},
) {
  if (isBackendRecentlyReady(backendURL) && !options.forceFresh) {
    return { status: "ok", service: "agentifyai-backend" } satisfies BackendHealth;
  }

  const existing = backendWarmups.get(backendURL);
  if (existing && !options.forceFresh) return existing;

  const timeoutMs = options.timeoutMs ?? 18000;
  const pollMs = options.pollMs ?? 1200;
  const startedAt = Date.now();

  const warmup = (async () => {
    while (Date.now() - startedAt < timeoutMs) {
      try {
        const remainingMs = timeoutMs - (Date.now() - startedAt);
        const health = await warmBackend(backendURL, {
          forceFresh: true,
          timeoutMs: Math.max(2500, Math.min(10000, remainingMs)),
        });
        if (isBackendLiveStatus(health.status)) return health;
      } catch {
        // Cold-start probes can fail while the host is waking. Keep polling quietly.
      }

      await sleep(pollMs);
    }

    return null;
  })();

  backendWarmups.set(backendURL, warmup);
  try {
    return await warmup;
  } finally {
    if (backendWarmups.get(backendURL) === warmup) {
      backendWarmups.delete(backendURL);
    }
  }
}

export function primeBackend(backendURL: string) {
  if (isBackendRecentlyReady(backendURL) || backendWarmups.has(backendURL)) return;
  void ensureBackendReady(backendURL, {
    forceFresh: true,
    pollMs: 1500,
    timeoutMs: 45000,
  }).catch(() => null);
}
