"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import {
  ApiRequestError,
  apiJson,
  invalidateApiCache,
} from "@/lib/apiClient";
import {
  normalizeLeaderboard,
  type LeaderboardEntry,
} from "@/features/rankings/leaderboard";
import {
  normalizeRivalChallenge,
  type RivalChallenge,
} from "@/features/rankings/rival";

const LIVE_REFRESH_MS = 60_000;

export type RivalChallengeStatus =
  | "loading"
  | "ready"
  | "unsupported"
  | "error";

export function useRankings() {
  const { user, profile, loading: authLoading, getAuthHeaders } = useAuth();
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [challenge, setChallenge] = useState<RivalChallenge | null>(null);
  const [loading, setLoading] = useState(true);
  const [leaderboardError, setLeaderboardError] = useState<string | null>(null);
  const [challengeStatus, setChallengeStatus] = useState<RivalChallengeStatus>("loading");
  const [reloadToken, setReloadToken] = useState(0);
  const challengeUnsupportedRef = useRef(false);
  const backendURL =
    process.env.NEXT_PUBLIC_BACKEND_URL || "http://127.0.0.1:8000";
  const userId = user?.uid ?? "";

  useEffect(() => {
    if (authLoading) return;

    let active = true;

    async function loadData(forceFresh: boolean, showLoading: boolean) {
      if (!userId) {
        setEntries([]);
        setChallenge(null);
        setLeaderboardError("Sign in to see the AgentifyAI rankings.");
        setChallengeStatus("unsupported");
        setLoading(false);
        return;
      }

      if (showLoading) setLoading(true);

      let headers: HeadersInit;
      try {
        headers = await getAuthHeaders();
      } catch {
        if (!active) return;
        setLeaderboardError("Rankings could not authenticate this refresh. Please try again.");
        setChallengeStatus("error");
        if (showLoading) setLoading(false);
        return;
      }
      const challengeRequest = challengeUnsupportedRef.current
        ? Promise.resolve({ status: "skipped" as const })
        : apiJson<unknown>(`${backendURL}/rivals/weekly-challenge/${userId}`, {
            headers,
            cacheKey: `rival-challenge:${userId}`,
            cacheTtlMs: forceFresh ? 0 : 30_000,
            forceFresh,
            retries: 1,
            timeoutMs: 9_000,
          }).then(
            (payload) => ({ status: "fulfilled" as const, payload }),
            (reason: unknown) => ({ status: "rejected" as const, reason }),
          );
      const leaderboardRequest = apiJson<unknown>(`${backendURL}/leaderboard`, {
          headers,
          cacheKey: `leaderboard:${userId}`,
          cacheTtlMs: forceFresh ? 0 : 10_000,
          forceFresh,
          retries: 1,
          timeoutMs: 7_000,
        }).then(
          (payload) => ({ status: "fulfilled" as const, payload }),
          (reason: unknown) => ({ status: "rejected" as const, reason }),
        );

      const leaderboardResult = await leaderboardRequest;

      if (!active) return;

      if (leaderboardResult.status === "fulfilled") {
        setEntries(normalizeLeaderboard(leaderboardResult.payload));
        setLeaderboardError(null);
      } else {
        if (showLoading) setEntries([]);
        setLeaderboardError(
          "Rankings could not refresh right now. Your learning progress is still safe.",
        );
      }

      if (showLoading) setLoading(false);

      const challengeResult = await challengeRequest;

      if (!active) return;

      if (challengeResult.status === "fulfilled") {
        const normalized = normalizeRivalChallenge(challengeResult.payload);
        setChallenge(normalized);
        setChallengeStatus(normalized ? "ready" : "error");
      } else if (challengeResult.status === "rejected") {
        const unsupported =
          challengeResult.reason instanceof ApiRequestError
          && (challengeResult.reason.status === 404 || challengeResult.reason.status === 405);
        if (unsupported) {
          challengeUnsupportedRef.current = true;
          setChallenge(null);
          setChallengeStatus("unsupported");
        } else {
          setChallengeStatus("error");
        }
      }
    }

    let inFlight = false;
    async function load(forceFresh: boolean, showLoading: boolean) {
      if (inFlight) return;
      inFlight = true;
      try { await loadData(forceFresh, showLoading); }
      finally { inFlight = false; }
    }
    void load(reloadToken > 0, true);
    const refreshTimer = window.setInterval(() => {
      if (document.visibilityState === "visible") void load(true, false);
    }, LIVE_REFRESH_MS);

    return () => {
      active = false;
      window.clearInterval(refreshTimer);
    };
  }, [
    authLoading,
    backendURL,
    getAuthHeaders,
    reloadToken,
    userId,
  ]);

  const currentEntry = useMemo(
    () => entries.find((entry) => entry.user_id === userId) ?? null,
    [entries, userId],
  );

  const retry = useCallback(() => {
    invalidateApiCache(`leaderboard:${userId}`);
    invalidateApiCache(`rival-challenge:${userId}`);
    challengeUnsupportedRef.current = false;
    setChallengeStatus("loading");
    setReloadToken((token) => token + 1);
  }, [userId]);

  return {
    entries,
    challenge,
    currentEntry,
    currentDisplayName: profile?.name || "Student",
    currentClassLevel: profile?.classLevel || currentEntry?.class_level || "",
    userId,
    loading: loading || authLoading,
    error: leaderboardError,
    challengeStatus,
    retry,
  };
}
