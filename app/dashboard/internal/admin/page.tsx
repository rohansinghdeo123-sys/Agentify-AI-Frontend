"use client";

import { useAuth } from "@/context/AuthContext";
import { apiFetch, apiJson, ensureBackendReady } from "@/lib/apiClient";
import { cn } from "@/lib/utils";
import { AppIcon, ErrorState } from "@/components/ui/Polished";
import ThemeToggle from "@/components/ThemeToggle";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { ActivityTimeline } from "@/components/admin/ActivityTimeline";
import { DataIngestionReport } from "@/components/admin/DataIngestionReport";
import { HealthBadge, HealthDot } from "@/components/admin/HealthBadge";
import {
  HEALTH_STYLES,
  MUTED,
  TEXT,
  classifyHealth,
  formatBytes,
  formatCompact,
  formatCost,
  formatPercent,
  formatTime,
  humanize,
  relativeTime,
} from "@/components/admin/format";
import type { AdminConsolePayload, ConsoleMetric, ContentReport, HealthState } from "@/components/admin/types";

const API_BASE = process.env.NEXT_PUBLIC_BACKEND_URL || "http://127.0.0.1:8000";
// The admin console aggregates a lot and the DB compute may be cold, so the
// first load can take ~30s. Poll slowly and never overlap in-flight loads.
const REFRESH_MS = 30000;
const CONSOLE_TIMEOUT_MS = 70000;
const REPORT_TIMEOUT_MS = 45000;
const NUM = "font-mono tabular-nums";

// Flat terminal surfaces: thin border, no blur, no shadow, tight radius.
const P = "rounded-lg border border-[color:var(--agentify-border)] bg-[color:var(--agentify-card-bg)]";
const CELL = "border-[color:var(--agentify-border)]";
const LABEL = "text-xs font-bold uppercase tracking-[0.12em] text-[color:var(--agentify-muted-text)]";

const USAGE_METRICS: Array<{ key: string; label: string }> = [
  { key: "total_users", label: "Users" },
  { key: "active_students_today", label: "Active today" },
  { key: "active_sessions", label: "Sessions" },
  { key: "questions_asked", label: "Questions" },
  { key: "mcqs_attempted", label: "MCQs" },
  { key: "exam_generations", label: "Exam gen" },
  { key: "average_accuracy", label: "Avg accuracy" },
  { key: "api_llm_usage", label: "LLM calls" },
];

const QUALITY_ALERTS: Array<{ key: "hallucination_risk" | "missing_sources" | "failed_mcq_generation" | "empty_retrieval" | "slow_responses" | "fallback_used"; label: string; state: HealthState }> = [
  { key: "hallucination_risk", label: "hallucination risk", state: "error" },
  { key: "missing_sources", label: "missing sources", state: "error" },
  { key: "failed_mcq_generation", label: "MCQ fails", state: "warning" },
  { key: "empty_retrieval", label: "empty retrievals", state: "warning" },
  { key: "slow_responses", label: "slow responses", state: "warning" },
  { key: "fallback_used", label: "fallbacks", state: "warning" },
];

function worstState(states: HealthState[]): HealthState {
  if (states.includes("error")) return "error";
  if (states.includes("warning")) return "warning";
  if (states.every((s) => s === "unknown")) return "unknown";
  return "healthy";
}
function isTransientError(error: unknown): boolean {
  const name = (error as { name?: string })?.name || "";
  const message = (error instanceof Error ? error.message : String(error || "")).toLowerCase();
  return name === "AbortError" || /abort|timed out|timeout|failed to fetch|load failed|network ?error|fetch failed|502|503|504/.test(message);
}
function metricValue(metric?: ConsoleMetric): string | null {
  if (!metric || metric.value === null || metric.value === undefined || metric.value === "") return null;
  const v = metric.value;
  if (typeof v === "number") {
    if (metric.unit?.includes("usd")) return `$${v.toFixed(2)}`;
    if (metric.unit?.includes("%")) return `${v}%`;
    if (metric.unit?.includes("ms")) return v >= 1000 ? `${(v / 1000).toFixed(1)}s` : `${Math.round(v)}ms`;
    return formatCompact(v);
  }
  return String(v);
}
function exportJson(filename: string, payload: unknown) {
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function TermButton({ children, onClick, tone = "ghost" }: { children: React.ReactNode; onClick?: () => void; tone?: "ghost" | "gold" }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex min-h-11 items-center gap-1.5 rounded-md border px-3 text-xs font-semibold transition-colors",
        tone === "gold"
          ? "border-[var(--ds-warning)] bg-[var(--ds-warning-soft)] text-[var(--ds-warning)] hover:brightness-95"
          : cn(CELL, "border bg-transparent text-[color:var(--agentify-primary-text)] hover:bg-[color:var(--agentify-hover-bg)]"),
      )}
    >
      {children}
    </button>
  );
}

// Zone: tight terminal section — uppercase rail label, hairline, dense body.
function Zone({ label, meta, children, className }: { label: string; meta?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <section className={cn(P, "min-w-0 overflow-hidden", className)}>
      <div className={cn("flex items-center justify-between gap-2 border-b px-3 py-1.5", CELL)}>
        <span className={LABEL}>{label}</span>
        {meta ? <span className={cn("flex items-center gap-2 text-xs", MUTED, NUM)}>{meta}</span> : null}
      </div>
      {children}
    </section>
  );
}

function Th({ children, right }: { children: React.ReactNode; right?: boolean }) {
  return <th className={cn("px-2.5 py-1.5 whitespace-nowrap", LABEL, right && "text-right")}>{children}</th>;
}
function Td({ children, right, mono, tone, className }: { children: React.ReactNode; right?: boolean; mono?: boolean; tone?: string; className?: string }) {
  return (
    <td className={cn("px-2.5 py-2 whitespace-nowrap text-xs", right && "text-right", mono && NUM, tone || MUTED, className)}>
      {children}
    </td>
  );
}

function SkeletonBlock({ className }: { className?: string }) {
  return <div className={cn(P, "animate-pulse", className)} />;
}
function AdminSkeleton() {
  return (
    <div className="space-y-2" aria-hidden="true">
      <SkeletonBlock className="h-10" />
      <SkeletonBlock className="h-16" />
      <div className="grid gap-2 lg:grid-cols-[7fr_5fr]">
        <SkeletonBlock className="h-72" />
        <SkeletonBlock className="h-72" />
      </div>
      <SkeletonBlock className="h-40" />
    </div>
  );
}

function UnauthorizedState({ email }: { email: string }) {
  return (
    <main id="main-content" className="flex min-h-[calc(100svh-8rem)] items-center justify-center p-4">
      <div className={cn(P, "max-w-xl p-8 text-center")}>
        <HealthBadge state="error" label="Founder access only" />
        <h1 className={cn("mt-5 text-2xl font-semibold", TEXT)}>Admin Console is restricted</h1>
        <p className={cn("mt-3 text-sm leading-6", MUTED)}>Signed in as {email || "an unknown account"}. This console only opens for an approved founder account.</p>
        <Link href="/dashboard" className={cn(P, "mt-6 inline-flex px-5 py-2.5 text-sm font-semibold", TEXT, "hover:bg-[color:var(--agentify-hover-bg)]")}>Return to dashboard</Link>
      </div>
    </main>
  );
}
function VerifyingState() {
  return (
    <main id="main-content" className="flex min-h-[60svh] items-center justify-center p-4">
      <div className={cn(P, "flex items-center gap-3 px-6 py-5")}>
        <HealthDot state="warning" pulse />
        <div>
          <p className={cn("text-sm font-semibold", TEXT)}>Verifying founder session…</p>
          <p className={cn("text-xs", MUTED)}>Checking admin claims and the founder allow-list.</p>
        </div>
      </div>
    </main>
  );
}

export default function FounderAdminConsolePage() {
  const { user, profile, isAdmin, isFounderAdmin, loading, claimsLoading, getAuthHeaders } = useAuth();
  const [data, setData] = useState<AdminConsolePayload | null>(null);
  const [report, setReport] = useState<ContentReport | null>(null);
  const [error, setError] = useState("");
  const [waking, setWaking] = useState(false);
  const [detail, setDetail] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const openedRef = useRef(false);
  const loadingRef = useRef(false);

  const email = (profile?.email || user?.email || "").toLowerCase();
  const founderAllowed = Boolean(isAdmin && isFounderAdmin);

  const adminGet = useCallback(async <T,>(path: string, timeoutMs: number): Promise<T> => {
    const headers = await getAuthHeaders();
    // No retries: one long attempt. Retrying a slow query just multiplies load.
    return apiJson<T>(`${API_BASE}${path}`, { headers, forceFresh: true, retries: 0, timeoutMs });
  }, [getAuthHeaders]);

  const audit = useCallback(async (action: string, metadata: Record<string, unknown> = {}, targetType = "console", targetId = "") => {
    if (!founderAllowed) return;
    try {
      const headers = await getAuthHeaders();
      await apiFetch(`${API_BASE}/admin/audit`, { method: "POST", headers, timeoutMs: 6000, body: JSON.stringify({ action, target_type: targetType, target_id: targetId, metadata: { route: "/dashboard/internal/admin", ...metadata } }) });
    } catch { /* audit must not block visibility */ }
  }, [founderAllowed, getAuthHeaders]);

  const loadConsole = useCallback(async () => {
    // Never overlap loads: a slow /admin/console (cold DB) must not pile up
    // behind the 30s interval, which is what caused the canceled-request loop.
    if (!founderAllowed || loadingRef.current) return;
    loadingRef.current = true;
    setRefreshing(true);
    try {
      try { await ensureBackendReady(API_BASE, { timeoutMs: 55000 }); } catch { /* still attempt */ }
      const payload = await adminGet<AdminConsolePayload>("/admin/console", CONSOLE_TIMEOUT_MS);
      setData(payload);
      setError("");
      setWaking(false);
      try { setReport(await adminGet<ContentReport>("/admin/content/ingestion-report", REPORT_TIMEOUT_MS)); } catch { setReport(null); }
    } catch (caught) {
      const name = (caught as { name?: string })?.name || "Error";
      const status = (caught as { status?: number })?.status;
      setDetail(`${name}${status ? ` ${status}` : ""}: ${caught instanceof Error ? caught.message : String(caught)}`);
      if (isTransientError(caught)) { setWaking(true); setError(""); }
      else { setWaking(false); setError(caught instanceof Error ? caught.message : "Admin console could not load."); }
    } finally {
      loadingRef.current = false;
      setRefreshing(false);
    }
  }, [adminGet, founderAllowed]);

  useEffect(() => {
    if (!founderAllowed) return;
    void loadConsole();
    const interval = window.setInterval(loadConsole, REFRESH_MS);
    return () => window.clearInterval(interval);
  }, [founderAllowed, loadConsole]);

  useEffect(() => {
    if (!founderAllowed || openedRef.current) return;
    openedRef.current = true;
    void audit("open_founder_admin_console", { email });
  }, [audit, email, founderAllowed]);

  const healthCards = useMemo(() => {
    const h = data?.header;
    const c = data?.content;
    const contentState: HealthState = !c ? "unknown" : Number(c.status_counts?.failed || 0) > 0 ? "warning" : c.approved_or_published > 0 ? "healthy" : c.chapters_total > 0 ? "warning" : "unknown";
    return [
      { label: "Backend", state: classifyHealth(h?.backend_ready), value: h?.backend_ready ? "ready" : "degraded" },
      { label: "Database", state: classifyHealth(h?.database_status), value: h?.database_status },
      { label: "Auth", state: classifyHealth(h?.auth_status), value: h?.auth_status },
      { label: "LLM", state: classifyHealth(h?.llm_status), value: h?.llm_status },
      { label: "RAG", state: classifyHealth(h?.rag_status), value: h?.rag_status },
      { label: "Content", state: contentState, value: contentState === "healthy" ? "live" : contentState },
    ];
  }, [data]);
  const overallState = useMemo(() => worstState(healthCards.map((c) => c.state)), [healthCards]);

  // One alert strip: operational alerts + every nonzero quality/risk counter.
  // Zero-valued signals stay silent instead of rendering as a grid of zeros.
  const alerts = useMemo(() => {
    if (!data) return [];
    const out: Array<{ label: string; state: HealthState }> = [];
    const failedJobs = Number(data.content.status_counts?.failed || 0);
    const unhealthyAgents = data.agents.filter((a) => classifyHealth(`${a.status} ${a.health}`) === "error").length;
    if (failedJobs) out.push({ label: `${failedJobs} failed job${failedJobs === 1 ? "" : "s"}`, state: "error" });
    if (unhealthyAgents) out.push({ label: `${unhealthyAgents} agent alert${unhealthyAgents === 1 ? "" : "s"}`, state: "warning" });
    for (const q of QUALITY_ALERTS) {
      const v = Number(data.quality[q.key] || 0);
      if (v > 0) out.push({ label: `${v} ${q.label}`, state: q.state });
    }
    return out;
  }, [data]);

  // Ticker shows only counters the backend actually tracks — no dead "—" cells.
  const ticker = useMemo(() => {
    if (!data) return [];
    const cells: Array<{ label: string; value: string; sub?: string }> = [];
    for (const m of USAGE_METRICS) {
      const v = metricValue(data.overview[m.key]);
      if (v !== null) cells.push({ label: m.label, value: v });
    }
    const intake = data.data_intake;
    if (intake) {
      const tokens = Number(intake.totals.input_tokens || 0) + Number(intake.totals.output_tokens || 0);
      if (tokens > 0) cells.push({ label: "Tokens", value: formatCompact(tokens) });
      if (Number(intake.totals.estimated_cost_usd || 0) > 0) cells.push({ label: "Est. cost", value: formatCost(intake.totals.estimated_cost_usd) });
      if (Number(intake.freshness.traces_24h || 0) > 0) cells.push({ label: "Traces 24h", value: formatCompact(intake.freshness.traces_24h) });
    }
    if (data.quality.avg_quality_score !== null) cells.push({ label: "Answer quality", value: formatPercent(data.quality.avg_quality_score) });
    return cells;
  }, [data]);

  const exportReport = () => { if (!data) return; exportJson(`agentify-admin-${Date.now()}.json`, { console: data, content_report: report }); void audit("export_admin_console_report", {}, "report", "console"); };

  if (loading || claimsLoading) return <VerifyingState />;
  if (!founderAllowed) return <UnauthorizedState email={email} />;

  const header = data?.header;
  const model = data?.model_registry?.current;
  const totalMemory = report?.totals.memory_bytes ?? null;
  const statusCounts = data?.content.status_counts || {};
  const pendingChapters = Number(statusCounts.pending || 0) + Number(statusCounts.review || 0) + Number(statusCounts.extracted || 0);

  return (
    <main id="main-content" className="relative min-h-[100svh] bg-[var(--agentify-page-bg)] text-[var(--agentify-primary-text)]">
      <div className="pointer-events-none fixed inset-0 -z-20 bg-[radial-gradient(circle_at_8%_0%,var(--ds-accent-teal-soft),transparent_32%),radial-gradient(circle_at_92%_4%,var(--ds-accent-gold-soft),transparent_30%),var(--agentify-page-bg)]" />

      <div className="flex w-full flex-col gap-2 px-2.5 pb-10 pt-2.5 sm:px-4 lg:px-5">
        {/* Command bar */}
        <header className={cn(P, "sticky top-2 z-20 flex flex-wrap items-center justify-between gap-2 px-3 py-2")}>
          <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
            <h1 className={cn("text-sm font-bold tracking-[0.18em]", TEXT)}>AGENTIFY<span className="text-[var(--ds-accent-teal)]">OPS</span></h1>
            <span className={cn("rounded border px-2 py-1 text-xs font-bold uppercase tracking-[0.1em]", CELL, "text-[var(--ds-accent-gold-strong)]")}>Founder</span>
            <span className={cn("rounded border px-2 py-1 text-xs uppercase tracking-[0.1em]", CELL, MUTED, NUM)}>env {data?.environment || "dev"}</span>
            <span className={cn("hidden text-xs sm:inline", MUTED, NUM)}>
              synced {formatTime(header?.last_sync_time || data?.generated_at)}{refreshing ? " · syncing…" : ""}
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <ThemeToggle compact />
            <span className={cn("inline-flex min-h-11 items-center gap-1.5 rounded-md border px-3 text-xs font-bold", HEALTH_STYLES[overallState].chip)}>
              <HealthDot state={overallState} pulse={overallState === "healthy"} />
              {data ? humanize(header?.system_status || overallState) : "Syncing"}
            </span>
            <TermButton onClick={() => { void audit("manual_console_refresh"); void loadConsole(); }}><AppIcon name="history" /> {refreshing ? "…" : "Refresh"}</TermButton>
            <TermButton tone="gold" onClick={exportReport}><AppIcon name="download" /> Export</TermButton>
          </div>
        </header>

        {error && !data ? <ErrorState title="Admin console error" detail={error} action={<TermButton onClick={() => void loadConsole()}>Retry</TermButton>} /> : null}

        {!data && !error ? (
          <div className="space-y-2">
            {waking ? (
              <div className={cn(P, "flex items-start gap-3 p-3")}>
                <span className="mt-0.5"><HealthDot state="warning" pulse /></span>
                <div className="min-w-0">
                  <p className={cn("text-sm font-semibold", TEXT)}>Connecting to the backend…</p>
                  <p className={cn("mt-1 truncate text-xs", MUTED)}>Calling <span className="font-mono">{API_BASE}/admin/console</span>{detail ? <> · <span className="text-[var(--ds-danger)]">{detail}</span></> : null}</p>
                </div>
              </div>
            ) : null}
            <AdminSkeleton />
          </div>
        ) : null}

        {data ? (
          <>
            {/* System rail: subsystem segments + live alerts. */}
            <section className={cn(P, "px-3 py-2")}>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
                {healthCards.map((c) => (
                  <span key={c.label} className="inline-flex items-center gap-1.5">
                    <HealthDot state={c.state} pulse={c.state === "healthy"} />
                    <span className={LABEL}>{c.label}</span>
                    <span className={cn("text-xs font-semibold", NUM, HEALTH_STYLES[c.state].text)}>{humanize(c.value || c.state)}</span>
                  </span>
                ))}
                <span className="ml-auto flex flex-wrap items-center gap-1.5">
                  {alerts.length ? alerts.map((a) => (
                    <span key={a.label} className={cn("inline-flex items-center gap-1 rounded border px-2 py-1 text-xs font-semibold", HEALTH_STYLES[a.state].chip, NUM)}>
                      <HealthDot state={a.state} /> {a.label}
                    </span>
                  )) : <span className={cn("inline-flex items-center gap-1 text-xs text-[var(--ds-success)]", NUM)}><HealthDot state="healthy" /> no alerts</span>}
                </span>
              </div>
            </section>

            {/* Ticker: tracked counters only. */}
            {ticker.length ? (
              <section className={cn(P, "grid grid-cols-2 divide-x divide-y divide-[color:var(--agentify-border)] sm:grid-cols-4 xl:grid-cols-8 xl:divide-y-0")}>
                {ticker.slice(0, 8).map((t) => (
                  <div key={t.label} className="px-3 py-2">
                    <p className={LABEL}>{t.label}</p>
                    <p className={cn("mt-0.5 text-lg font-semibold leading-6", NUM, TEXT)}>{t.value}</p>
                  </div>
                ))}
              </section>
            ) : null}

            <div className="grid gap-2 lg:grid-cols-[7fr_5fr] lg:items-start">
              {/* Students */}
              <Zone label="Students" meta={<>{data.students.length} tracked</>}>
                {data.students.length ? (
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[620px] border-collapse text-left">
                      <thead>
                        <tr className={cn("border-b", CELL)}>
                          <Th>Student</Th><Th>Class</Th><Th right>Streak</Th><Th right>XP</Th><Th right>Acc</Th><Th right>Questions</Th><Th right>Focus</Th><Th>Last active</Th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.students.slice(0, 15).map((s) => (
                          <tr key={s.user_id} className={cn("border-b last:border-b-0 hover:bg-[color:var(--agentify-hover-bg)]", CELL)}>
                            <Td tone={TEXT} className="font-medium">{s.display_name || "Student"}</Td>
                            <Td>{s.class_level || "—"}</Td>
                            <Td right mono>{s.streak || 0}</Td>
                            <Td right mono>{formatCompact(s.xp)} · L{s.level}</Td>
                            <Td right mono tone={s.accuracy >= 75 ? "text-[var(--ds-success)]" : s.accuracy >= 50 ? "text-[var(--ds-warning)]" : "text-[var(--ds-danger)]"}>{s.accuracy}%</Td>
                            <Td right mono>{formatCompact(s.total_questions)}</Td>
                            <Td right mono>{s.focus_score}</Td>
                            <Td>{s.last_active_date || "—"}</Td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : <p className={cn("px-3 py-4 text-xs", MUTED)}>No student activity yet.</p>}
              </Zone>

              <div className="grid gap-2">
                {/* Runtime: live model + retrieval config in one line. */}
                <Zone label="Runtime" meta={model?.latency_ms ? <>{Math.round(model.latency_ms)}ms avg</> : undefined}>
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-3 py-2">
                    <span className={cn("text-xs font-semibold", NUM, TEXT)}>{model?.llm_provider || "provider"} / {model?.llm_model || "model"}</span>
                    <span className={cn("text-xs", MUTED, NUM)}>RAG {model?.rag_index_version || "—"}</span>
                    <span className={cn("text-xs", MUTED, NUM)}>emb {model?.embedding_model || "off"}</span>
                    {model?.quality_score !== null && model?.quality_score !== undefined ? <span className={cn("text-xs text-[var(--ds-success)]", NUM)}>quality {formatPercent(model.quality_score)}</span> : null}
                    {model?.grounded_answer_rate !== null && model?.grounded_answer_rate !== undefined ? <span className={cn("text-xs text-[var(--ds-success)]", NUM)}>grounded {formatPercent(model.grounded_answer_rate)}</span> : null}
                  </div>
                </Zone>

                {/* Agents: one dense row per agent — no decorative pipeline cards. */}
                <Zone label="Agents" meta={<>{data.agents.length} reporting</>}>
                  {data.agents.length ? (
                    <div className="overflow-x-auto">
                      <table className="w-full min-w-[460px] border-collapse text-left">
                        <thead>
                          <tr className={cn("border-b", CELL)}>
                            <Th>Agent</Th><Th right>Req</Th><Th right>Err</Th><Th right>Success</Th><Th right>Latency</Th><Th>Last</Th>
                          </tr>
                        </thead>
                        <tbody>
                          {data.agents.map((a) => {
                            const state = classifyHealth(`${a.status} ${a.health}`);
                            return (
                              <tr key={a.agent_id} className={cn("border-b last:border-b-0 hover:bg-[color:var(--agentify-hover-bg)]", CELL)}>
                                <Td tone={TEXT} className="font-medium"><span className="inline-flex items-center gap-1.5"><HealthDot state={state} />{a.display_name || a.agent_id}</span></Td>
                                <Td right mono>{formatCompact(a.total_requests)}</Td>
                                <Td right mono tone={a.total_errors ? "text-[var(--ds-danger)]" : undefined}>{a.total_errors || 0}</Td>
                                <Td right mono>{formatPercent(a.success_rate)}</Td>
                                <Td right mono>{a.avg_latency_ms ? `${Math.round(a.avg_latency_ms)}ms` : "—"}</Td>
                                <Td>{relativeTime(a.last_activity)}</Td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  ) : <p className={cn("px-3 py-4 text-xs", MUTED)}>No agents are reporting yet.</p>}
                </Zone>

                {/* Recent ingestion jobs */}
                <Zone label="Recent jobs" meta={<>{data.content.recent_jobs.length}</>}>
                  {data.content.recent_jobs.length ? (
                    <ul className="divide-y divide-[color:var(--agentify-border)]">
                      {data.content.recent_jobs.slice(0, 6).map((j) => (
                        <li key={j.job_id} className="flex items-center justify-between gap-2 px-3 py-1.5">
                          <span className={cn("min-w-0 truncate text-xs font-medium", TEXT)}>{humanize(j.job_type)}<span className={cn("ml-2", MUTED)}>{j.source_path.split(/[\\/]/).pop()}</span></span>
                          <span className="flex shrink-0 items-center gap-2">
                            <HealthBadge state={classifyHealth(j.status)} label={j.status} />
                            <span className={cn("text-xs", MUTED, NUM)}>{relativeTime(j.created_at)}</span>
                          </span>
                        </li>
                      ))}
                    </ul>
                  ) : <p className={cn("px-3 py-4 text-xs", MUTED)}>No ingestion jobs yet.</p>}
                </Zone>
              </div>
            </div>

            {/* Content ops: headline numbers always visible, full report on demand. */}
            <Zone
              label="Content"
              meta={<>{data.content.approved_or_published} live · {pendingChapters} pending · {Number(statusCounts.failed || 0)} failed{report ? <> · {formatCompact(report.totals.tokens)} tokens · {formatBytes(totalMemory)}</> : null}</>}
            >
              <div className={cn("grid grid-cols-3 divide-x divide-[color:var(--agentify-border)] border-b sm:grid-cols-6", CELL)}>
                {[
                  { label: "Chapters live", value: String(data.content.approved_or_published) },
                  { label: "In pipeline", value: String(pendingChapters) },
                  { label: "Failed", value: String(Number(statusCounts.failed || 0)) },
                  { label: "Coverage avg", value: data.content.coverage_score_avg !== null ? formatPercent(data.content.coverage_score_avg) : "—" },
                  { label: "Concepts", value: report ? formatCompact(report.totals.concepts) : "—" },
                  { label: "Embedded", value: report && report.totals.chunks ? formatPercent(report.totals.embedded_chunks / report.totals.chunks) : "—" },
                ].map((c) => (
                  <div key={c.label} className="px-3 py-2">
                    <p className={LABEL}>{c.label}</p>
                    <p className={cn("mt-0.5 text-base font-semibold", NUM, c.label === "Failed" && c.value !== "0" ? "text-[var(--ds-danger)]" : TEXT)}>{c.value}</p>
                  </div>
                ))}
              </div>
              <details className="group">
                <summary className={cn("flex min-h-11 cursor-pointer items-center gap-2 px-3 py-2 text-xs font-semibold", MUTED, "hover:text-[color:var(--agentify-primary-text)]")}>
                  <span className="transition-transform group-open:rotate-90">▸</span> Full ingestion report — subjects, chapters, concepts, memory
                </summary>
                <div className="border-t border-[color:var(--agentify-border)] p-3">
                  <DataIngestionReport report={report} />
                </div>
              </details>
            </Zone>

            <div className="grid gap-2 lg:grid-cols-[7fr_5fr] lg:items-start">
              {/* Traces */}
              <Zone label="Model traces" meta={<>{data.traces.length} recent</>}>
                {data.traces.length ? (
                  <ul className="divide-y divide-[color:var(--agentify-border)]">
                    {data.traces.slice(0, 14).map((t) => (
                      <li key={t.id} className="flex items-center justify-between gap-3 px-3 py-1.5">
                        <div className="min-w-0">
                          <p className={cn("truncate text-xs font-semibold", TEXT)}>{t.name}</p>
                          <p className={cn("truncate text-xs", MUTED, NUM)}>{t.model || t.provider || t.trace_type} · {relativeTime(t.created_at)}{t.estimated_cost_usd ? ` · ${formatCost(t.estimated_cost_usd)}` : ""}</p>
                        </div>
                        <div className="flex shrink-0 items-center gap-2">
                          <HealthDot state={classifyHealth(t.status)} />
                          <span className={cn("text-xs", NUM, t.latency_ms >= 7000 ? "text-[var(--ds-danger)]" : MUTED)}>{t.latency_ms}ms</span>
                        </div>
                      </li>
                    ))}
                  </ul>
                ) : <p className={cn("px-3 py-4 text-xs", MUTED)}>No traces recorded yet.</p>}
              </Zone>

              {/* Audit */}
              <Zone label="Audit log" meta={<>{data.audit.length} events</>}>
                <div className="p-3"><ActivityTimeline rows={data.audit} limit={14} /></div>
              </Zone>
            </div>
          </>
        ) : null}
      </div>
    </main>
  );
}
