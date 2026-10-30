import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  apiFetch,
  apiJson,
  resetApiClientForTests,
} from "@/lib/apiClient";

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("apiClient", () => {
  beforeEach(() => {
    resetApiClientForTests();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("caches JSON responses when a cache key and TTL are provided", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ value: 1 }))
      .mockResolvedValueOnce(jsonResponse({ value: 2 }));
    vi.stubGlobal("fetch", fetchMock);

    const first = await apiJson<{ value: number }>("/progress", {
      cacheKey: "progress:test",
      cacheTtlMs: 30000,
    });
    const second = await apiJson<{ value: number }>("/progress", {
      cacheKey: "progress:test",
      cacheTtlMs: 30000,
    });

    expect(first).toEqual({ value: 1 });
    expect(second).toEqual({ value: 1 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("bypasses cached JSON when forceFresh is set", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ value: 1 }))
      .mockResolvedValueOnce(jsonResponse({ value: 2 }));
    vi.stubGlobal("fetch", fetchMock);

    await apiJson("/leaderboard", {
      cacheKey: "leaderboard:test",
      cacheTtlMs: 30000,
    });
    const fresh = await apiJson<{ value: number }>("/leaderboard", {
      cacheKey: "leaderboard:test",
      cacheTtlMs: 30000,
      forceFresh: true,
    });

    expect(fresh).toEqual({ value: 2 });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("deduplicates in-flight GET JSON requests with the same cache key", async () => {
    let resolveFetch: (response: Response) => void = () => {};
    const pendingFetch = new Promise<Response>((resolve) => {
      resolveFetch = resolve;
    });
    const fetchMock = vi.fn().mockReturnValue(pendingFetch);
    vi.stubGlobal("fetch", fetchMock);

    const first = apiJson<{ ready: boolean }>("/health", {
      cacheKey: "health:test",
    });
    const second = apiJson<{ ready: boolean }>("/health", {
      cacheKey: "health:test",
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    resolveFetch(jsonResponse({ ready: true }));

    await expect(Promise.all([first, second])).resolves.toEqual([
      { ready: true },
      { ready: true },
    ]);
  });

  it("keeps raw apiFetch uncached and no-store by default", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ value: 1 }))
      .mockResolvedValueOnce(jsonResponse({ value: 2 }));
    vi.stubGlobal("fetch", fetchMock);

    await apiFetch("/raw");
    await apiFetch("/raw");

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0]?.[1]).toEqual(
      expect.objectContaining({ cache: "no-store" }),
    );
  });
});

// Privacy and freshness invariants for shared fast reads.
describe("request coalescing and mutation freshness", () => {
  beforeEach(() => resetApiClientForTests());
  afterEach(() => vi.unstubAllGlobals());
  it("coalesces concurrent forced-fresh reads", async () => {
    let finish!: (value: Response) => void;
    const fetchMock = vi.fn(() => new Promise<Response>(resolve => {finish = resolve;}));
    vi.stubGlobal("fetch", fetchMock);
    const requests = Array.from({length: 8}, () => apiJson("/route", {forceFresh:true,headers:{Authorization:"Bearer A"}}));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    finish(jsonResponse({current:"matter"}));
    expect(await Promise.all(requests)).toHaveLength(8);
  });
  it("partitions custom cache keys by endpoint and credentials", async () => {
    const mock=vi.fn().mockImplementation(async()=>jsonResponse({value:mock.mock.calls.length}));
    vi.stubGlobal("fetch",mock);
    const opts={cacheKey:"same",cacheTtlMs:30000};
    expect(await apiJson("/private",{...opts,headers:{Authorization:"Bearer A"}})).toEqual({value:1});
    expect(await apiJson("/private",{...opts,headers:{Authorization:"Bearer B"}})).toEqual({value:2});
    expect(await apiJson("/other",{...opts,headers:{Authorization:"Bearer A"}})).toEqual({value:3});
    expect(await apiJson("/private",{...opts,headers:{Authorization:"Bearer A"}})).toEqual({value:1});
    expect(mock).toHaveBeenCalledTimes(3);
  });
  it("does not let an old GET repopulate cache after a successful mutation",async()=>{
    let finish!: (value:Response)=>void;
    const mock=vi.fn().mockImplementationOnce(()=>new Promise<Response>(resolve=>{finish=resolve;}))
      .mockResolvedValueOnce(jsonResponse({saved:true})).mockResolvedValueOnce(jsonResponse({value:"new"}));
    vi.stubGlobal("fetch",mock);
    const stale=apiJson("/progress",{cacheTtlMs:30000});
    await apiJson("/save",{method:"POST"});
    finish(jsonResponse({value:"old"}));await stale;
    expect(await apiJson("/progress",{cacheTtlMs:30000})).toEqual({value:"new"});
  });
  it("keeps caller-owned abort signals independent",async()=>{
    const mock=vi.fn().mockImplementation(async()=>jsonResponse({ok:true}));vi.stubGlobal("fetch",mock);
    const a=new AbortController(), b=new AbortController();
    await Promise.all([apiJson("/private",{signal:a.signal}),apiJson("/private",{signal:b.signal})]);
    expect(mock).toHaveBeenCalledTimes(2);
  });
});
