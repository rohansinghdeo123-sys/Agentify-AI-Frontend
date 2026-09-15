"use client";

import { DataIngestionReport } from "@/components/admin/DataIngestionReport";
import { HealthBadge, HealthDot } from "@/components/admin/HealthBadge";
import { HEALTH_STYLES, MUTED, PANEL, SOFT_PANEL, TEXT, classifyHealth, formatCompact, formatPercent, formatTime, humanize, relativeTime } from "@/components/admin/format";
import type { AdminActivityEvidence, AdminChapterEvidence, AdminContentEvidence, AdminEvidenceOverview, EvidenceAgentSummary, HealthState } from "@/components/admin/types";
import ThemeToggle from "@/components/ThemeToggle";
import { AppIcon, ErrorState } from "@/components/ui/Polished";
import { useAuth } from "@/context/AuthContext";
import { apiJson, ensureBackendReady } from "@/lib/apiClient";
import { cn } from "@/lib/utils";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import styles from "./admin.module.css";

const API_BASE = process.env.NEXT_PUBLIC_BACKEND_URL || "http://127.0.0.1:8000";
const REFRESH_MS = 30000;
const NUM = "font-mono tabular-nums";
const EYEBROW = "text-xs font-bold uppercase tracking-[0.16em] text-[color:var(--agentify-muted-text)]";

function formatPercentagePoints(value: number | null | undefined) {
  return value == null || Number.isNaN(Number(value)) ? "—" : `${Math.round(Number(value))}%`;
}

function evidenceState(value?: string): HealthState {
  const normalized = String(value || "").toLowerCase();
  if (["ready", "verified", "healthy", "success"].includes(normalized)) return "healthy";
  if (["attention", "lexical_only", "content_ready_unverified_provenance"].includes(normalized)) return "warning";
  if (["incomplete", "mismatch", "database_unavailable", "readiness_check_failed", "failed"].includes(normalized)) return "error";
  return classifyHealth(value);
}

function worstState(states: HealthState[]): HealthState {
  if (states.includes("error")) return "error";
  if (states.includes("warning")) return "warning";
  if (states.every((state) => state === "unknown")) return "unknown";
  return "healthy";
}

function isTransientError(error: unknown) {
  const name = (error as { name?: string })?.name || "";
  const message = (error instanceof Error ? error.message : String(error || "")).toLowerCase();
  return name === "AbortError" || /abort|timed out|timeout|failed to fetch|network|502|503|504/.test(message);
}

function exportJson(filename: string, payload: unknown) {
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function ConsoleButton({ children, onClick, primary = false, disabled = false, busy = false }: { children: React.ReactNode; onClick?: () => void; primary?: boolean; disabled?: boolean; busy?: boolean }) {
  return <button type="button" onClick={onClick} disabled={disabled || busy} aria-busy={busy || undefined} className={cn("ds-button min-h-11 gap-2 rounded-xl px-4 text-sm font-semibold", primary ? "ds-button-primary" : "ds-button-secondary hover:bg-[color:var(--agentify-hover-bg)]")}>{children}</button>;
}

function Metric({ label, value, detail, tone }: { label: string; value: string; detail: string; tone?: string }) {
  return <div className={cn(SOFT_PANEL, "min-w-0 p-4 [overflow-wrap:anywhere]")}><p className={EYEBROW}>{label}</p><p className={cn("mt-2 text-2xl font-semibold", NUM, tone || TEXT)}>{value}</p><p className={cn("mt-1 text-sm leading-5", MUTED)}>{detail}</p></div>;
}

function AgentCard({ agent }: { agent: EvidenceAgentSummary }) {
  const state = evidenceState(agent.health);
  return (
    <article className={cn(PANEL, "overflow-hidden")}>
      <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-start sm:justify-between">
        <div><HealthBadge state={state} label={humanize(agent.activity_state)} pulse={state === "healthy"} /><h3 className={cn("mt-3 text-xl font-semibold", TEXT)}>{agent.display_name || humanize(agent.agent)}</h3><p className={cn("mt-1 text-sm", MUTED)}>{agent.role || "Learning agent"} · Last evidence {relativeTime(agent.last_activity)}</p></div>
        <p className={cn("text-sm", NUM, MUTED)}>{agent.runs} runs / 24h</p>
      </div>
      <div className="grid grid-cols-2 border-t border-[color:var(--agentify-border)] sm:grid-cols-4">
        {[
          ["Success", formatPercentagePoints(agent.success_rate_percent)],
          ["Errors", String(agent.errors)],
          ["Latency", agent.average_latency_ms == null ? "—" : `${Math.round(agent.average_latency_ms)} ms`],
          ["Quality", agent.average_quality_score == null ? "—" : formatPercent(agent.average_quality_score)],
        ].map(([label, value], index) => <div key={label} className={cn("px-4 py-3", index ? "border-l border-[color:var(--agentify-border)]" : "", index >= 2 ? "border-t border-[color:var(--agentify-border)] sm:border-t-0" : "")}><p className={EYEBROW}>{label}</p><p className={cn("mt-1 font-semibold", NUM, label === "Errors" && agent.errors ? "text-[var(--ds-danger)]" : TEXT)}>{value}</p></div>)}
      </div>
    </article>
  );
}

function ActivityCard({ item }: { item: AdminActivityEvidence["items"][number] }) {
  const state = classifyHealth(item.status);
  return (
    <details className={cn(SOFT_PANEL, "group overflow-hidden")}>
      <summary className="flex min-h-16 cursor-pointer list-none items-center justify-between gap-4 p-4 outline-none focus-visible:ring-2 focus-visible:ring-[var(--ds-accent-teal)]">
        <div className="min-w-0"><div className="flex items-center gap-2"><HealthDot state={state} /><p className={cn("truncate font-semibold", TEXT)}>{humanize(item.agent)}</p></div><p className={cn("mt-1 truncate text-sm", MUTED)}>{humanize(item.grounding.status)} · {relativeTime(item.created_at)}</p></div>
        <div className="flex shrink-0 items-center gap-3"><span className={cn("text-sm", NUM, MUTED)}>{item.latency_ms} ms</span><span className={cn("text-xl transition-transform group-open:rotate-90", MUTED)}>›</span></div>
      </summary>
      <div className="grid gap-3 border-t border-[color:var(--agentify-border)] p-4 sm:grid-cols-2 lg:grid-cols-4">
        <Metric label="Quality" value={item.quality.score == null ? "—" : formatPercent(item.quality.score)} detail={item.quality.passed == null ? "Not recorded" : item.quality.passed ? "Quality gate passed" : "Quality gate failed"} />
        <Metric label="Grounding" value={humanize(item.grounding.status)} detail={`${item.grounding.paragraphs_found} paragraphs retrieved`} />
        <Metric label="Source proof" value={`${item.grounding.citation_count} page refs`} detail={item.grounding.source_pages.length ? `Pages ${item.grounding.source_pages.join(", ")}` : "No source pages recorded"} />
        <Metric label="Fallbacks" value={String(item.fallback_count)} detail={`${formatCompact(item.estimated_tokens)} estimated tokens`} />
      </div>
    </details>
  );
}

function LoadingState({ waking, detail }: { waking: boolean; detail: string }) {
  return <div role="status" aria-live="polite" aria-atomic="true" className={cn(PANEL, "mx-auto mt-16 max-w-2xl p-8 text-center [overflow-wrap:anywhere]")}><span className="inline-flex"><HealthDot state={waking ? "warning" : "healthy"} pulse /></span><h2 className={cn("mt-4 text-xl font-semibold", TEXT)}>{waking ? "Waking the operations service" : "Loading verified evidence"}</h2><p className={cn("mt-2 text-sm leading-6", MUTED)}>{detail || "Reading sanitized agent and curriculum evidence."}</p></div>;
}

function UnauthorizedState({ email }: { email: string }) {
  return <main id="main-content" className="flex min-h-[100svh] items-center justify-center bg-[var(--agentify-page-bg)] p-5"><div className={cn(PANEL, "max-w-xl p-8 text-center")}><HealthBadge state="error" label="Founder access only" /><h1 className={cn("mt-5 text-2xl font-semibold", TEXT)}>Admin Console is restricted</h1><p className={cn("mt-3 text-sm leading-6", MUTED)}>Signed in as {email || "an unknown account"}. A backend-verified founder role is required.</p><Link href="/dashboard" className="mt-6 inline-flex min-h-11 items-center rounded-xl border border-[color:var(--agentify-border)] px-5 text-sm font-semibold">Return to dashboard</Link></div></main>;
}

export default function FounderAdminConsolePage() {
  const { user, profile, isAdmin, isFounderAdmin, loading, claimsLoading, getAuthHeaders } = useAuth();
  const [overview, setOverview] = useState<AdminEvidenceOverview | null>(null);
  const [content, setContent] = useState<AdminContentEvidence | null>(null);
  const [activity, setActivity] = useState<AdminActivityEvidence | null>(null);
  const [error, setError] = useState("");
  const [contentError, setContentError] = useState("");
  const [activityError, setActivityError] = useState("");
  const [refreshNotice, setRefreshNotice] = useState("");
  const [contentVersion, setContentVersion] = useState(0);
  const [detail, setDetail] = useState("");
  const [waking, setWaking] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const loadingRef = useRef(false);
  const overviewRef = useRef<AdminEvidenceOverview | null>(null);
  const email = (profile?.email || user?.email || "").toLowerCase();
  const founderAllowed = Boolean(isAdmin && isFounderAdmin);
  overviewRef.current = overview;

  const evidenceGet = useCallback(async <T,>(path: string, timeoutMs = 45000) => {
    const headers = await getAuthHeaders();
    return apiJson<T>(`${API_BASE}${path}`, { headers, forceFresh: true, retries: 0, timeoutMs });
  }, [getAuthHeaders]);

  const loadConsole = useCallback(async () => {
    if (!founderAllowed || loadingRef.current) return;
    loadingRef.current = true;
    setRefreshing(true);
    try {
      try { await ensureBackendReady(API_BASE, { timeoutMs: 55000 }); } catch { /* protected evidence calls still decide availability */ }
      const [overviewResult, contentResult, activityResult] = await Promise.allSettled([
        evidenceGet<AdminEvidenceOverview>("/admin/evidence/overview?hours=24", 70000),
        evidenceGet<AdminContentEvidence>("/admin/evidence/content?limit=100", 45000),
        evidenceGet<AdminActivityEvidence>("/admin/evidence/activity?hours=24&limit=50", 45000),
      ]);
      if (overviewResult.status === "rejected") throw overviewResult.reason;
      setOverview(overviewResult.value);
      if (contentResult.status === "fulfilled") {
        setContent(contentResult.value);
        setContentError("");
        setContentVersion((value) => value + 1);
      } else {
        setContent(null);
        setContentError(contentResult.reason instanceof Error ? contentResult.reason.message : "Curriculum evidence could not load.");
      }
      if (activityResult.status === "fulfilled") {
        setActivity(activityResult.value);
        setActivityError("");
      } else {
        setActivity(null);
        setActivityError(activityResult.reason instanceof Error ? activityResult.reason.message : "Agent activity could not load.");
      }
      setError(""); setDetail(""); setRefreshNotice(""); setWaking(false);
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "Admin evidence could not load.";
      setDetail(message); setWaking(isTransientError(caught));
      if (overviewRef.current) setRefreshNotice(`Latest refresh failed: ${message}`);
      else if (!isTransientError(caught)) setError(message);
    } finally { loadingRef.current = false; setRefreshing(false); }
  }, [evidenceGet, founderAllowed]);

  const loadChapterEvidence = useCallback((chapterId: number) => evidenceGet<AdminChapterEvidence>(`/admin/evidence/content/${chapterId}?limit=100`, 45000), [evidenceGet]);

  useEffect(() => {
    if (!founderAllowed) return;
    void loadConsole();
    const interval = window.setInterval(loadConsole, REFRESH_MS);
    return () => window.clearInterval(interval);
  }, [founderAllowed, loadConsole]);

  const systemHealth = useMemo(() => {
    const agents = overview?.agents || [];
    const agentState = agents.some((agent) => evidenceState(agent.health) === "error") ? "error" : agents.some((agent) => evidenceState(agent.health) === "warning") ? "warning" : agents.length ? "healthy" : "unknown";
    return [
      { label: "Agent runtime", state: agentState as HealthState, value: agentState },
      { label: "Curriculum release", state: evidenceState(overview?.readiness.release.status), value: overview?.readiness.release.status || "unknown" },
      { label: "Retrieval", state: evidenceState(overview?.readiness.semantic_retrieval.status), value: overview?.readiness.semantic_retrieval.status || "unknown" },
    ];
  }, [overview]);
  const overallState = useMemo(() => worstState(systemHealth.map((item) => item.state)), [systemHealth]);

  if (loading || claimsLoading) return <LoadingState waking={false} detail="Verifying founder claims and the server-side allow-list." />;
  if (!founderAllowed) return <UnauthorizedState email={email} />;

  const agents = overview?.agents || [];
  const healthyAgents = agents.filter((agent) => evidenceState(agent.health) === "healthy").length;
  const totalRuns = agents.reduce((sum, agent) => sum + agent.runs, 0);
  const totalErrors = agents.reduce((sum, agent) => sum + agent.errors, 0);
  const exportReport = () => overview && exportJson(`agentify-evidence-${Date.now()}.json`, { overview, content, activity });

  return (
    <main id="main-content" className={cn(styles.console, "relative min-h-[100svh] overflow-x-hidden bg-[var(--agentify-page-bg)] text-[var(--agentify-primary-text)]")}>
      <div className="pointer-events-none fixed inset-0 -z-10 bg-[radial-gradient(circle_at_8%_0%,var(--ds-accent-teal-soft),transparent_35%),radial-gradient(circle_at_92%_5%,var(--ds-accent-gold-soft),transparent_32%),var(--agentify-page-bg)]" />
      <div className="mx-auto w-full max-w-[1500px] px-4 pb-16 pt-4 sm:px-6 lg:px-10">
        <header className={cn(PANEL, "z-20 flex flex-col gap-4 px-5 py-4 xl:sticky xl:top-3 xl:flex-row xl:items-center xl:justify-between")}>
          <div><div className="flex flex-wrap items-center gap-2"><p className="text-sm font-bold tracking-[0.18em]">AGENTIFY<span className="text-[var(--ds-accent-teal)]">AI</span> CONTROL</p><HealthBadge state={overallState} label={overallState} pulse={overallState === "healthy"} /></div><p className={cn("mt-1 text-sm", MUTED)}>Agent operations and curriculum evidence · synced {formatTime(overview?.generated_at)}</p></div>
          <div className="flex flex-wrap items-center gap-2"><Link href="/dashboard" className="inline-flex min-h-11 items-center justify-center rounded-xl border border-[color:var(--agentify-border)] bg-[color:var(--agentify-card-bg)] px-4 text-sm font-semibold hover:bg-[color:var(--agentify-hover-bg)]">Dashboard</Link><ThemeToggle compact /><ConsoleButton busy={refreshing} onClick={() => void loadConsole()}><AppIcon name="history" />{refreshing ? "Refreshing…" : "Refresh"}</ConsoleButton><ConsoleButton primary disabled={!overview} onClick={exportReport}><AppIcon name="download" />Export evidence</ConsoleButton></div>
        </header>

        <nav aria-label="Admin console sections" className="mt-4 flex flex-wrap gap-2 pb-1"><a href="#agent-operations" className={cn(SOFT_PANEL, "min-h-11 px-4 py-3 text-sm font-semibold", TEXT)}>01 · Agent Operations</a><a href="#curriculum-evidence" className={cn(SOFT_PANEL, "min-h-11 px-4 py-3 text-sm font-semibold", TEXT)}>02 · Curriculum Evidence</a></nav>
        {refreshNotice ? <div role="status" className="mt-4 rounded-xl border border-[var(--ds-warning)] bg-[var(--ds-warning-soft)] px-4 py-3 text-sm text-[var(--ds-warning)]">{refreshNotice} Showing the last verified snapshot.</div> : null}
        {error && !overview ? <div className="mt-6"><ErrorState title="Admin evidence unavailable" detail={error} action={<ConsoleButton onClick={() => void loadConsole()}>Retry</ConsoleButton>} /></div> : null}
        {!overview && !error ? <LoadingState waking={waking} detail={detail} /> : null}

        {overview ? <div className="mt-8 space-y-12">
          <section id="agent-operations" aria-labelledby="agent-operations-heading" className="scroll-mt-6 xl:scroll-mt-28">
            <div className="max-w-3xl"><p className={EYEBROW}>01 · Agent health and activity</p><h1 id="agent-operations-heading" className={cn("mt-2 text-3xl font-semibold tracking-tight sm:text-4xl", TEXT)}>Know what every learning agent is doing.</h1><p className={cn("mt-3 text-base leading-7", MUTED)}>Sanitized runtime health, latency, quality and grounding evidence—without student records, prompts, session identifiers or cost panels.</p></div>
            <div className={cn(PANEL, "mt-6 flex flex-wrap gap-x-8 gap-y-4 p-4")}>{systemHealth.map((item) => <div key={item.label} className="flex min-w-[180px] items-center gap-2"><HealthDot state={item.state} pulse={item.state === "healthy"} /><div><p className={EYEBROW}>{item.label}</p><p className={cn("mt-0.5 text-sm font-semibold", HEALTH_STYLES[item.state].text)}>{humanize(item.value)}</p></div></div>)}</div>
            <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><Metric label="Agents reporting" value={`${healthyAgents}/${agents.length}`} detail="Healthy in the 24h window" /><Metric label="Observed runs" value={formatCompact(totalRuns)} detail="Sanitized agent turns" /><Metric label="Recorded errors" value={formatCompact(totalErrors)} detail="Non-success turns" tone={totalErrors ? "text-[var(--ds-danger)]" : "text-[var(--ds-success)]"} /><Metric label="Grounded rate" value={formatPercentagePoints(overview.quality.grounded_rate_percent)} detail={`${overview.quality.grounded_turns}/${overview.quality.retrieval_turns} retrieval turns`} /></div>
            <div className="mt-6 grid gap-4 xl:grid-cols-2">{agents.length ? agents.map((agent) => <AgentCard key={agent.agent} agent={agent} />) : <div className={cn(PANEL, "p-8 text-center xl:col-span-2")}><p className={cn("font-semibold", TEXT)}>No agent telemetry yet</p><p className={cn("mt-2 text-sm", MUTED)}>Evidence appears after the first traced learning turn.</p></div>}</div>
            <section className={cn(PANEL, "mt-6 p-5")} aria-labelledby="activity-evidence-heading"><div><p className={EYEBROW}>Progressive disclosure</p><h2 id="activity-evidence-heading" className={cn("mt-1 text-xl font-semibold", TEXT)}>Recent grounded activity</h2></div><div className="mt-4 space-y-3">{activityError ? <div className="rounded-xl border border-[var(--ds-warning)] bg-[var(--ds-warning-soft)] p-4 text-sm text-[var(--ds-warning)]">Activity evidence is unavailable: {activityError}</div> : activity?.items.length ? activity.items.map((item) => <ActivityCard key={item.trace_id} item={item} />) : <p className={cn("text-sm", MUTED)}>No agent turns were observed in this window.</p>}</div></section>
          </section>

          <section id="curriculum-evidence" aria-labelledby="curriculum-evidence-heading" className="scroll-mt-6 xl:scroll-mt-28">
            <div className="max-w-3xl"><p className={EYEBROW}>02 · Ingested curriculum evidence</p><h2 id="curriculum-evidence-heading" className={cn("mt-2 text-3xl font-semibold tracking-tight sm:text-4xl", TEXT)}>Trace every chapter back to its source.</h2><p className={cn("mt-3 text-base leading-7", MUTED)}>Published inventory, subtopics, verified source-page references, validation, embeddings and release provenance from sanitized evidence endpoints.</p></div>
            <div className="mt-6">{contentError ? <div className="mb-4 rounded-xl border border-[var(--ds-warning)] bg-[var(--ds-warning-soft)] p-4 text-sm text-[var(--ds-warning)]">Curriculum evidence is unavailable: {contentError}</div> : null}<DataIngestionReport overview={overview} content={content} loadChapterEvidence={loadChapterEvidence} refreshVersion={contentVersion} /></div>
          </section>
        </div> : null}
      </div>
    </main>
  );
}
