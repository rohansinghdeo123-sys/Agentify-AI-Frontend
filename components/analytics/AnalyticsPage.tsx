"use client";

import { useEffect, useMemo, useState, useCallback, useId, type KeyboardEvent } from "react";
import { useAuth } from "@/context/AuthContext";
import { LoadingSkeleton } from "@/components/ui/Polished";
import { apiJson } from "@/lib/apiClient";
import { fetchRevisionQueue, BUCKET_LABELS, type RevisionBucket, type RevisionEntry } from "@/lib/revision";
import { useRouter } from "next/navigation";
import styles from "./analytics-theme.module.css";

// Types
type Session = {
  id: string;
  subject: string;
  class_level?: string;
  topic: string;
  duration: number;
  questions: number;
  correct: number;
  xp: number;
  focusScore: number;
  date?: string;
  timestamp?: string;
  createdAt?: string;
  startedAt?: string;
  completedAt?: string;
  status?: string | null;
  performance?: number | null;
};

type ProgressSummary = {
  user_id: string;
  total_tests: number;
  total_questions: number;
  total_correct: number;
  xp: number;
  streak: number;
  level: number;
  accuracy: number;
  focus_score: number;
  consistency_index: number;
  learning_efficiency: number;
};

type Tone = "neutral" | "blue" | "green" | "amber" | "red";
type TrendRange = "14d" | "8w";

const emptyProgress: ProgressSummary = {
  user_id: "",
  total_tests: 0,
  total_questions: 0,
  total_correct: 0,
  xp: 0,
  streak: 0,
  level: 1,
  accuracy: 0,
  focus_score: 0,
  consistency_index: 0,
  learning_efficiency: 0,
};

const TOPIC_CHAPTER_MAP: Record<string, string> = {
  alkanes: "hydrocarbon",
  alkenes: "hydrocarbon",
  alkynes: "hydrocarbon",
  aromatics: "hydrocarbon",
  matter_definition: "matter",
  states_of_matter: "matter",
  properties_of_matter: "matter",
};

function getChapterForTopic(topic: string) {
  return TOPIC_CHAPTER_MAP[topic.trim().toLowerCase().replace(/\s+/g, "_")] || "hydrocarbon";
}

// Utility functions
function cn(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(" ");
}

function sum<T>(items: T[], getValue: (item: T) => number) {
  return items.reduce((total, item) => total + getValue(item), 0);
}

function average<T>(items: T[], getValue: (item: T) => number) {
  if (!items.length) return 0;
  return Math.round(sum(items, getValue) / items.length);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function getAccuracy(session: Session) {
  return session.questions > 0
    ? Math.round((session.correct / session.questions) * 100)
    : 0;
}

function getSessionDate(session: Session) {
  const raw =
    session.timestamp ??
    session.date ??
    session.createdAt ??
    session.startedAt ??
    session.completedAt;
  if (!raw) return null;
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function formatMinutes(value: number) {
  if (!Number.isFinite(value)) return "0M";
  if (value >= 60) {
    const hours = Math.floor(value / 60);
    const mins = value % 60;
    return mins ? `${hours}H ${mins}M` : `${hours}H`;
  }
  return `${value}M`;
}

function formatHours(value: number) {
  return `${(value / 60).toFixed(1)}H`;
}

function getScoreTone(value: number): Tone {
  if (value >= 85) return "green";
  if (value >= 70) return "blue";
  if (value >= 55) return "amber";
  return "red";
}

function toneText(tone: Tone) {
  if (tone === "green") return styles.tonePositive;
  if (tone === "blue") return styles.toneAccent;
  if (tone === "amber") return styles.toneWarning;
  if (tone === "red") return styles.toneDanger;
  return styles.toneNeutral;
}

function toneBadge(tone: Tone) {
  if (tone === "green") return cn("border-emerald-500/30 bg-emerald-500/10", styles.tonePositive);
  if (tone === "blue") return cn("border-[#0E7490]/30 bg-[#0E7490]/10", styles.toneAccent);
  if (tone === "amber") return cn("border-amber-400/30 bg-amber-400/10", styles.toneWarning);
  if (tone === "red") return cn("border-red-500/30 bg-red-500/10", styles.toneDanger);
  return cn("border-white/10 bg-white/5", styles.toneNeutral);
}

// Grouping and chart helpers
function groupBySubject(sessions: Session[]) {
  const map = new Map<string, { subject: string; sessions: number; duration: number; xp: number; accuracy: number; focus: number }>();
  for (const session of sessions) {
    const current = map.get(session.subject) ?? { subject: session.subject, sessions: 0, duration: 0, xp: 0, accuracy: 0, focus: 0 };
    current.sessions += 1;
    current.duration += session.duration;
    current.xp += session.xp;
    current.accuracy += getAccuracy(session);
    current.focus += session.focusScore;
    map.set(session.subject, current);
  }
  return [...map.values()].map((item) => ({
    ...item,
    accuracy: Math.round(item.accuracy / item.sessions),
    focus: Math.round(item.focus / item.sessions),
  })).sort((a, b) => b.accuracy - a.accuracy);
}

function groupByTopic(sessions: Session[]) {
  const map = new Map<string, { topic: string; subject: string; sessions: number; duration: number; accuracy: number; xp: number }>();
  for (const session of sessions) {
    const key = `${session.subject}::${session.topic}`;
    const current = map.get(key) ?? { topic: session.topic, subject: session.subject, sessions: 0, duration: 0, accuracy: 0, xp: 0 };
    current.sessions += 1;
    current.duration += session.duration;
    current.accuracy += getAccuracy(session);
    current.xp += session.xp;
    map.set(key, current);
  }
  return [...map.values()].map((item) => ({
    ...item,
    accuracy: Math.round(item.accuracy / item.sessions),
  })).sort((a, b) => b.accuracy - a.accuracy);
}

// New: compute 3-session trend per topic (returns +1, 0, -1)
function getTopicTrend(sessions: Session[], topic: string, subject: string) {
  const relevant = sessions
    .filter((s) => s.subject === subject && s.topic === topic)
    .sort((a, b) => (getSessionDate(b)?.getTime() ?? 0) - (getSessionDate(a)?.getTime() ?? 0))
    .slice(0, 3);
  if (relevant.length < 2) return 0; // not enough data
  const avgOld = average(relevant.slice(1), getAccuracy);
  const avgNew = getAccuracy(relevant[0]);
  return avgNew > avgOld ? 1 : avgNew < avgOld ? -1 : 0;
}

function getLocalDayKey(date: Date) {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function startOfLocalDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function addDays(date: Date, amount: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + amount);
  return next;
}

function buildDailySeries(sessions: Session[], days = 14) {
  const dated = sessions.map((s) => ({ s, d: getSessionDate(s) })).filter((item): item is { s: Session; d: Date } => !!item.d);
  if (!dated.length) return [];
  const end = startOfLocalDay(new Date());
  const start = addDays(end, -(days - 1));
  const buckets = new Map<string, Session[]>();
  for (const item of dated) {
    const day = startOfLocalDay(item.d);
    if (day < start || day > end) continue;
    const key = getLocalDayKey(day);
    buckets.set(key, [...(buckets.get(key) ?? []), item.s]);
  }
  return Array.from({ length: days }, (_, i) => {
    const date = addDays(start, i);
    const key = getLocalDayKey(date);
    const bucket = buckets.get(key) ?? [];
    const questions = sum(bucket, (x) => x.questions);
    const correct = sum(bucket, (x) => x.correct);
    return {
      label: date.toLocaleDateString("en-IN", { weekday: "short" }).toUpperCase(),
      sessions: bucket.length,
      duration: sum(bucket, (x) => x.duration),
      xp: sum(bucket, (x) => x.xp),
      accuracy: questions > 0 ? Math.round((correct / questions) * 100) : 0,
      focus: bucket.length ? average(bucket, (x) => x.focusScore) : 0,
    };
  });
}

function buildWeeklySeries(sessions: Session[], weeks = 8) {
  const dated = sessions.map((s) => ({ s, d: getSessionDate(s) })).filter((item): item is { s: Session; d: Date } => !!item.d);
  if (!dated.length) return [];
  const today = startOfLocalDay(new Date());
  const start = addDays(today, -(weeks * 7 - 1));
  return Array.from({ length: weeks }, (_, i) => {
    const ws = addDays(start, i * 7);
    const we = addDays(ws, 6);
    const bucket = dated.filter((item) => {
      const day = startOfLocalDay(item.d);
      return day >= ws && day <= we;
    }).map((item) => item.s);
    const questions = sum(bucket, (x) => x.questions);
    const correct = sum(bucket, (x) => x.correct);
    return {
      label: ws.toLocaleDateString("en-IN", { day: "2-digit", month: "short" }).toUpperCase(),
      sessions: bucket.length,
      duration: sum(bucket, (x) => x.duration),
      xp: sum(bucket, (x) => x.xp),
      accuracy: questions > 0 ? Math.round((correct / questions) * 100) : 0,
      focus: bucket.length ? average(bucket, (x) => x.focusScore) : 0,
    };
  });
}

function buildHeatmap(sessions: Session[], days = 35) {
  const dates = sessions.map((s) => getSessionDate(s)).filter((d): d is Date => !!d);
  if (!dates.length) return [];
  const end = startOfLocalDay(new Date());
  const start = addDays(end, -(days - 1));
  const counts = new Map<string, number>();
  for (const d of dates) {
    const day = startOfLocalDay(d);
    if (day < start || day > end) continue;
    const key = getLocalDayKey(day);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return Array.from({ length: days }, (_, i) => {
    const date = addDays(start, i);
    const key = getLocalDayKey(date);
    return {
      key,
      label: date.toLocaleDateString("en-IN", { day: "2-digit", month: "short" }).toUpperCase(),
      value: counts.get(key) ?? 0,
    };
  });
}

async function safeReadJson(url: string, headers?: HeadersInit) {
  try {
    return await apiJson<unknown>(url, {
      headers,
      cacheKey: `analytics-read:${url}`,
      cacheTtlMs: 30000,
      retries: 1,
      timeoutMs: 7000,
    });
  } catch {
    return null;
  }
}

function useDashboardData() {
  const { user, profile, loading: authLoading, getAuthHeaders } = useAuth();
  const [sessions, setSessions] = useState<Session[]>([]);
  const [progress, setProgress] = useState<ProgressSummary>(emptyProgress);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);
  const backendURL = process.env.NEXT_PUBLIC_BACKEND_URL || "http://127.0.0.1:8000";

  useEffect(() => {
    let active = true;
    async function load() {
      if (authLoading) return;
      if (!user?.uid) {
        setSessions([]);
        setProgress(emptyProgress);
        setLoading(false);
        setError("No authenticated user.");
        return;
      }
      try {
        setLoading(true);
        setError(null);
        const headers = await getAuthHeaders();
        const payload = await safeReadJson(`${backendURL}/dashboard/${user.uid}`, headers);
        if (!isRecord(payload)) throw new Error("Failed to load dashboard");
        const progressSummary = { ...emptyProgress, ...(isRecord(payload.progress) ? payload.progress : {}) } as ProgressSummary;
        if (!active) return;
        setSessions(Array.isArray(payload.sessions) ? payload.sessions : []);
        setProgress(progressSummary);
      } catch {
        if (active) {
          setSessions([]);
          setProgress(emptyProgress);
          setError("UNABLE TO LOAD DASHBOARD DATA.");
        }
      } finally {
        if (active) setLoading(false);
      }
    }
    load();
    return () => { active = false; };
  }, [authLoading, backendURL, getAuthHeaders, profile?.classLevel, profile?.name, reloadToken, user]);

  const retry = useCallback(() => {
    setReloadToken((current) => current + 1);
  }, []);

  return {
    userId: user?.uid ?? "",
    currentDisplayName: profile?.name || "Student",
    classLevel: profile?.classLevel || "",
    sessions,
    progress,
    loading: loading || authLoading,
    error,
    retry,
  };
}

// Glass UI components
function GlassCard({ label, value, tone = "neutral", active = false }: { label: string; value: string; tone?: Tone; active?: boolean }) {
  return (
    <div
      className={cn(
        "progress-glass-card group relative min-w-0 overflow-hidden rounded-xl border border-cyan-100/10 bg-[linear-gradient(135deg,rgba(8,18,31,0.86),rgba(9,15,27,0.80))] p-4 shadow-[0_10px_32px_rgba(0,0,0,0.16)] backdrop-blur-2xl transition-all duration-200 hover:-translate-y-0.5 hover:border-cyan-200/20 hover:bg-white/[0.055]",
        active && "border-[#14B8A6]/36 bg-[linear-gradient(135deg,rgba(8,47,73,0.58),rgba(8,29,43,0.78))]",
      )}
    >
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-cyan-200/40 to-transparent" />
      <div className="pointer-events-none absolute -right-10 -top-10 h-24 w-24 rounded-full bg-[#14B8A6]/7 blur-2xl transition group-hover:bg-[#14B8A6]/10" />
      <div className="relative">
        <div className="flex items-center justify-between gap-3">
          <div className={cn("font-semibold", styles.metaLabel)}>{label}</div>
          <span className={cn("h-1.5 w-1.5 rounded-full", tone === "green" ? "bg-emerald-400" : tone === "amber" ? "bg-amber-400" : tone === "red" ? "bg-red-400" : "bg-[#14B8A6]")} />
        </div>
        <div className={cn("mt-3 text-3xl font-semibold tracking-tight", toneText(tone))}>{value}</div>
      </div>
    </div>
  );
}

function GlassPanel({ title, tag, right, className, children }: { title: string; tag?: string; right?: React.ReactNode; className?: string; children: React.ReactNode }) {
  const titleId = useId();
  return (
    <section aria-labelledby={titleId} className={cn("progress-glass-panel min-w-0 overflow-hidden rounded-[1.25rem] border border-cyan-100/10 bg-[linear-gradient(135deg,rgba(8,18,31,0.88),rgba(10,14,24,0.82))] shadow-[0_14px_44px_rgba(0,0,0,0.18)] backdrop-blur-2xl", className)}>
      <div className="progress-panel-header flex flex-wrap items-center justify-between gap-3 border-b border-cyan-100/10 bg-white/[0.025] px-5 py-4">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <span aria-hidden="true" className="h-2 w-2 shrink-0 rounded-full bg-[#14B8A6] shadow-[0_0_18px_rgba(20,184,166,0.8)]" />
          <h2 id={titleId} className="text-sm font-semibold tracking-[-0.01em] text-slate-100">{title.replace(/_/g, " ")}</h2>
          {tag && <span className={cn("rounded-full border border-amber-400/30 bg-amber-400/10 px-2 py-1 font-bold uppercase tracking-[0.16em]", styles.microType, styles.toneWarning)}>{tag}</span>}
        </div>
        {right}
      </div>
      <div className="p-5">{children}</div>
    </section>
  );
}

function TonePill({ children, tone = "neutral" }: { children: React.ReactNode; tone?: Tone }) {
  return (
    <span className={cn("inline-flex items-center rounded-full border px-2.5 py-1 font-semibold uppercase tracking-[0.16em]", styles.microType, toneBadge(tone))}>
      {children}
    </span>
  );
}

function Rail({ value, tone = "neutral", label = "Progress" }: { value: number; tone?: Tone; label?: string }) {
  const width = Number.isFinite(value) ? Math.max(0, Math.min(100, value)) : 0;
  const bg = tone === "green" ? "bg-emerald-400" : tone === "blue" ? "bg-[#14B8A6]" : tone === "amber" ? "bg-amber-400" : tone === "red" ? "bg-red-400" : "bg-gray-400";
  return (
    <div
      className="progress-rail h-2 w-full overflow-hidden rounded-full bg-white/7"
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(width)}
    >
      <div className={cn("h-full rounded-full shadow-[0_0_22px_currentColor] transition-all duration-700", bg)} style={{ width: `${width}%` }} />
    </div>
  );
}

function EmptyState({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="agentify-state-panel progress-empty-state flex min-h-[220px] flex-col items-center justify-center rounded-3xl border border-dashed border-cyan-100/12 bg-white/[0.025] px-6 text-center">
      <div className={cn("font-bold uppercase tracking-[0.28em]", styles.emptyTitle)}>{title}</div>
      <p className="mt-4 max-w-md text-sm leading-6 text-slate-400">{detail}</p>
    </div>
  );
}

function TrendRangeToggle({ range, setRange }: { range: TrendRange; setRange: (v: TrendRange) => void }) {
  const options = ["14d", "8w"] as const;

  const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>, item: TrendRange) => {
    let nextIndex: number | null = null;
    const currentIndex = options.indexOf(item);
    if (event.key === "ArrowRight" || event.key === "ArrowDown") nextIndex = currentIndex + 1;
    if (event.key === "ArrowLeft" || event.key === "ArrowUp") nextIndex = currentIndex - 1;
    if (event.key === "Home") nextIndex = 0;
    if (event.key === "End") nextIndex = options.length - 1;
    if (nextIndex === null) return;

    event.preventDefault();
    const nextRange = options[(nextIndex + options.length) % options.length];
    setRange(nextRange);
    const group = event.currentTarget.closest<HTMLElement>("[role='radiogroup']");
    window.requestAnimationFrame(() => {
      group?.querySelector<HTMLButtonElement>(`[data-trend-range='${nextRange}']`)?.focus();
    });
  };

  return (
    <div className="flex gap-1" role="radiogroup" aria-label="Trend range">
      {options.map((item) => (
        <button
          type="button"
          role="radio"
          aria-checked={item === range}
          aria-label={item === "14d" ? "14 days" : "8 weeks"}
          data-trend-range={item}
          tabIndex={item === range ? 0 : -1}
          key={item}
          onClick={() => setRange(item)}
          onKeyDown={(event) => handleKeyDown(event, item)}
          className={cn(
            "agentify-action",
            cn("rounded-md border px-3 py-1 font-bold uppercase tracking-[0.22em] transition-all font-mono", styles.microType),
            item === range
              ? cn("border-amber-400/40 bg-amber-400/10", styles.toneWarning)
              : cn("border-white/10 hover:border-white/30 hover:text-white", styles.metaLabel)
          )}
        >
          {item}
        </button>
      ))}
    </div>
  );
}

function LineChart({
  labels,
  series,
  valueSuffix = "",
}: {
  labels: string[];
  series: Array<{ label: string; color: string; data: number[] }>;
  valueSuffix?: string;
}) {
  const chartTitleId = useId();
  const chartDescriptionId = useId();
  if (!labels.length || !series.some((s) => s.data.some((v) => Number.isFinite(v)))) {
    return <EmptyState title="No trend data" detail="Timestamped sessions are required to render this chart." />;
  }

  const velocitySeries = series[0];
  const width = 120;
  const height = 66;
  const padding = { top: 7, right: 5, bottom: 10, left: 16 };
  const values = velocitySeries.data.filter((v) => Number.isFinite(v));
  const maxValue = values.length ? Math.max(...values) : 0;
  const minValue = values.length ? Math.min(...values) : 0;
  const yMax = Math.max(100, Math.ceil(Math.max(maxValue, 0) / 25) * 25);
  const innerWidth = width - padding.left - padding.right;
  const innerHeight = height - padding.top - padding.bottom;
  const x = (index: number) => padding.left + (labels.length === 1 ? 0 : (index / (labels.length - 1)) * innerWidth);
  const y = (value: number) => padding.top + innerHeight - (Math.max(0, value) / yMax) * innerHeight;
  const baseline = padding.top + innerHeight;
  const ticks = [1, 0.75, 0.5, 0.25, 0].map((p) => Math.round(yMax * p));
  const points = velocitySeries.data.map((v, i) => ({ x: x(i), y: y(v) }));
  const path = points.reduce((currentPath, point, index) => {
    if (index === 0) return `M ${point.x} ${point.y}`;
    const previous = points[index - 1];
    const controlX = (previous.x + point.x) / 2;
    return `${currentPath} C ${controlX} ${previous.y}, ${controlX} ${point.y}, ${point.x} ${point.y}`;
  }, "");
  const areaPath = `${path} L ${points[points.length - 1]?.x ?? padding.left} ${baseline} L ${points[0]?.x ?? padding.left} ${baseline} Z`;
  const summary = `${velocitySeries.label} ranges from ${minValue}${valueSuffix} to ${maxValue}${valueSuffix} across ${labels.length} periods.`;

  return (
    <div className={cn("progress-chart-frame relative min-h-[430px] overflow-hidden rounded-[1.6rem] border border-[#1A2C3C] bg-[#050A0D] px-5 py-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.035),0_18px_56px_rgba(0,0,0,0.24)]", styles.chartPalette)}>
      <div className="progress-chart-grid pointer-events-none absolute inset-0 bg-[linear-gradient(to_right,rgba(20,184,166,0.04)_1px,transparent_1px),linear-gradient(to_bottom,rgba(20,184,166,0.03)_1px,transparent_1px)] bg-[size:64px_64px] opacity-45" />
      <div className="progress-chart-wash pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_58%_36%,rgba(255,170,10,0.045),transparent_26%),linear-gradient(180deg,rgba(5,10,13,0)_0%,rgba(5,10,13,0.84)_100%)]" />

      <div className="relative mb-7 flex flex-wrap items-center justify-between gap-4">
        <div className={cn("flex items-center gap-3 uppercase tracking-[0.28em] text-slate-400", styles.microType)}>
          <span className="h-px w-8 bg-[var(--analytics-chart-line)]" />
          <span>XP Velocity</span>
        </div>
        <div className={cn("rounded-full border border-emerald-400/20 bg-emerald-400/7 px-2.5 py-1 font-bold uppercase tracking-[0.14em]", styles.microType, styles.tonePositive)}>
          Live
        </div>
      </div>

      <div role="region" aria-label="XP velocity chart" tabIndex={0} className={cn("relative overflow-x-auto", styles.scrollRegion)}>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="relative h-[335px] w-full min-w-[440px] overflow-visible"
        role="img"
        aria-labelledby={`${chartTitleId} ${chartDescriptionId}`}
      >
        <title id={chartTitleId}>XP velocity trend</title>
        <desc id={chartDescriptionId}>{summary}</desc>
        <defs>
          <linearGradient id="analyticsXpArea" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="var(--analytics-chart-line)" stopOpacity="0.46" />
            <stop offset="48%" stopColor="var(--analytics-chart-line)" stopOpacity="0.18" />
            <stop offset="100%" stopColor="var(--analytics-chart-line)" stopOpacity="0" />
          </linearGradient>
          <filter id="analyticsLineGlow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="1.45" result="coloredBlur" />
            <feMerge>
              <feMergeNode in="coloredBlur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {ticks.map((tick) => {
          const yPos = y(tick);
          return (
            <g key={tick}>
              <line
                x1={padding.left}
                y1={yPos}
                x2={width - padding.right}
                y2={yPos}
                stroke={tick === 0 ? "var(--analytics-chart-baseline)" : "var(--analytics-chart-grid)"}
                strokeDasharray={tick === 0 ? "0" : "1.5 2.4"}
                strokeOpacity={tick === 0 ? 0.72 : 0.58}
                strokeWidth={tick === 0 ? 0.42 : 0.32}
              />
              <text
                x={padding.left - 6.4}
                y={yPos - 1}
                fill="var(--analytics-chart-label)"
                fontSize="2.9"
                fontFamily="inherit"
                fontWeight="600"
                textAnchor="start"
              >
                {Math.round(tick)}
                {valueSuffix}
              </text>
            </g>
          );
        })}

        <path d={areaPath} fill="url(#analyticsXpArea)" />
        <path
          d={path}
          fill="none"
          stroke="var(--analytics-chart-line)"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="0.92"
          opacity="0.24"
          transform="translate(0, 0.7)"
        />
        <path
          d={path}
          fill="none"
          stroke="var(--analytics-chart-line)"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="0.95"
          filter="url(#analyticsLineGlow)"
        />

        {labels.map((label, i) => (
          <text
            key={i}
            x={x(i)}
            y={height - 2}
            fill="var(--analytics-chart-label)"
            fontSize="3"
            fontFamily="inherit"
            fontWeight="600"
            textAnchor="middle"
          >
            {label}
          </text>
        ))}
      </svg>
      </div>
    </div>
  );
}

// CSV export helper
function downloadCSV(sessions: Session[]) {
  const headers = ["id", "subject", "topic", "duration", "questions", "correct", "accuracy", "xp", "focusScore", "date"];
  const rows = sessions.map((s) => [
    s.id,
    s.subject,
    s.topic,
    s.duration,
    s.questions,
    s.correct,
    getAccuracy(s),
    s.xp,
    s.focusScore,
    getSessionDate(s)?.toISOString().split("T")[0] ?? "",
  ]);
  const csv = [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "session_data.csv";
  a.click();
  URL.revokeObjectURL(url);
}

// Main Analytics page component
// Dark-surface tones for the revision queue buckets (this page's palette).
const QUEUE_TONES: Record<RevisionBucket, { card: string; text: string; chip: string }> = {
  overdue: { card: "border-red-500/20 bg-red-500/5", text: styles.toneDanger, chip: cn("border-red-500/30 bg-red-500/10", styles.toneDanger) },
  due: { card: "border-amber-500/20 bg-amber-500/5", text: styles.toneWarning, chip: cn("border-amber-500/30 bg-amber-500/10", styles.toneWarning) },
  strengthen: { card: "border-cyan-500/20 bg-cyan-500/5", text: styles.toneAccent, chip: cn("border-cyan-500/30 bg-cyan-500/10", styles.toneAccent) },
  fresh: { card: "border-gray-500/20 bg-gray-500/5", text: styles.toneNeutral, chip: cn("border-gray-500/30 bg-gray-500/10", styles.toneNeutral) },
};

export default function AnalyticsPage() {
  const { userId, currentDisplayName, classLevel, sessions, progress, loading, error, retry } = useDashboardData();
  const { getAuthHeaders } = useAuth();
  const [range, setRange] = useState<TrendRange>("14d");
  const [revisionQueue, setRevisionQueue] = useState<RevisionEntry[]>([]);
  const router = useRouter();

  // Spaced-repetition queue: additive fetch, never blocks the dashboard load.
  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    (async () => {
      const backendURL = process.env.NEXT_PUBLIC_BACKEND_URL || "http://127.0.0.1:8000";
      const payload = await fetchRevisionQueue(backendURL, userId, await getAuthHeaders(), 6);
      if (!cancelled && payload) {
        setRevisionQueue(payload.queue.filter((entry) => entry.bucket !== "fresh"));
      }
    })();
    return () => { cancelled = true; };
  }, [getAuthHeaders, userId]);

  // Derived stats
  const totalDuration = useMemo(() => sum(sessions, (s) => s.duration), [sessions]);
  const totalQuestions = progress.total_questions || sum(sessions, (s) => s.questions);
  const totalCorrect = progress.total_correct || sum(sessions, (s) => s.correct);
  const avgAccuracy = totalQuestions > 0 ? Math.round((totalCorrect / totalQuestions) * 100) : 0;
  const totalXp = progress.xp || sum(sessions, (s) => s.xp);
  const levelProgress = Math.max(2, Math.min(100, totalXp % 100));
  const xpToNext = Math.max(0, 100 - (totalXp % 100));

  const subjects = useMemo(() => groupBySubject(sessions), [sessions]);
  const topics = useMemo(() => groupByTopic(sessions), [sessions]);
  const bestSubject = subjects[0]?.subject ?? "-";
  const worstTopic = topics.length ? topics[topics.length - 1] : null;

  const daily = useMemo(() => buildDailySeries(sessions, 14), [sessions]);
  const weekly = useMemo(() => buildWeeklySeries(sessions, 8), [sessions]);
  const heatmap = useMemo(() => buildHeatmap(sessions, 35), [sessions]);

  const trendLabels = range === "14d" ? daily.map((d) => d.label) : weekly.map((w) => w.label);
  const trendXp = range === "14d" ? daily.map((d) => d.xp) : weekly.map((w) => w.xp);
  const avgFocus = progress.focus_score || average(sessions, (session) => session.focusScore);
  const readinessScore = Math.round(
    Math.min(100, (avgAccuracy * 0.45) + (avgFocus * 0.25) + (Math.min(progress.streak * 12, 100) * 0.15) + (Math.min(progress.total_tests * 10, 100) * 0.15)),
  );
  const readinessTone = getScoreTone(readinessScore);

  const weeklyLabels = weekly.map((w) => w.label);
  const weeklyDurations = weekly.map((w) => w.duration);

  // Predictive insights
  const insights = useMemo(() => {
    const list: { type: "positive" | "negative" | "neutral"; message: string }[] = [];
    if (daily.length && daily.some((d) => d.xp > 0)) {
      const avgDailyXp = average(daily, (d) => d.xp);
      if (avgDailyXp > 0) {
        const daysToNextLevel = Math.ceil(xpToNext / avgDailyXp);
        list.push({ type: "neutral", message: `At current pace, you'll reach Level ${(progress.level || 1) + 1} in ~${daysToNextLevel} days.` });
      }
    }
    if (worstTopic && worstTopic.accuracy < 60) {
      list.push({ type: "negative", message: `Accuracy on ${worstTopic.topic} is ${worstTopic.accuracy}% - focused revision recommended.` });
    } else if (worstTopic) {
      list.push({ type: "positive", message: `Your weakest topic (${worstTopic.topic}) is at ${worstTopic.accuracy}% - keep improving.` });
    }
    if (progress.streak >= 5) {
      list.push({ type: "positive", message: `You have a ${progress.streak}-day streak! Keep the momentum.` });
    }
    // New insights based on consistency / efficiency
    if (progress.consistency_index > 0) {
      const consistencyLabel = progress.consistency_index >= 80 ? "very consistent" : progress.consistency_index >= 60 ? "moderately consistent" : "irregular";
      list.push({ type: progress.consistency_index >= 60 ? "positive" : "neutral", message: `Study consistency: ${progress.consistency_index}% (${consistencyLabel}).` });
    }
    if (progress.learning_efficiency > 0) {
      list.push({ type: progress.learning_efficiency >= 70 ? "positive" : "neutral", message: `Learning efficiency: ${progress.learning_efficiency}% - ${progress.learning_efficiency >= 70 ? "excellent" : "room to grow"}.` });
    }
    if (!list.length) {
      list.push({ type: "neutral", message: "Complete more sessions to unlock predictive insights." });
    }
    return list;
  }, [daily, worstTopic, progress, xpToNext]);

  const handleExportCSV = useCallback(() => downloadCSV(sessions), [sessions]);

  // Weak topic spotlight (top 3 weak topics with trends)
  const weakTopics = useMemo(() => {
    return topics
      .filter((t) => t.accuracy < 60)
      .sort((a, b) => a.accuracy - b.accuracy)
      .slice(0, 3)
      .map((t) => ({
        ...t,
        trend: getTopicTrend(sessions, t.topic, t.subject),
      }));
  }, [topics, sessions]);
  const priorityCommand = weakTopics[0]
    ? `Revise ${weakTopics[0].topic} next`
    : sessions.length
    ? "Take one timed exam set"
    : "Start first tracked session";
  const primaryWeakTopic = weakTopics[0] ?? null;
  const actionPlanTitle = primaryWeakTopic
    ? `Repair ${primaryWeakTopic.topic}`
    : sessions.length
      ? "Convert progress into exam reps"
      : "Launch your first study loop";
  const actionPlanBody = primaryWeakTopic
    ? `Accuracy is at ${primaryWeakTopic.accuracy}% across ${primaryWeakTopic.sessions} tracked ${primaryWeakTopic.sessions === 1 ? "session" : "sessions"}. Start a focused revision loop before adding new topics.`
    : sessions.length
      ? "Your learning data is active. Use a timed exam set now to turn practice into a sharper mastery signal."
      : "Begin with one tracked study session so Agentify can build your first mastery map and next-action path.";
  const actionPlanTarget = primaryWeakTopic
    ? "Revise topic"
    : sessions.length
      ? "Open exam"
      : "Start studying";
  const latestSession = useMemo(() => {
    return [...sessions].sort((a, b) => (getSessionDate(b)?.getTime() ?? 0) - (getSessionDate(a)?.getTime() ?? 0))[0] ?? null;
  }, [sessions]);

  const handleReviseTopic = useCallback((topic: string) => {
    const normalizedTopic = topic.trim().toLowerCase().replace(/\s+/g, "_");
    const chapter = getChapterForTopic(topic);
    router.push(`/dashboard/revision/${encodeURIComponent(chapter)}?topic=${encodeURIComponent(normalizedTopic)}`);
  }, [router]);

  if (loading) {
    return (
      <div role="status" aria-live="polite" aria-label="Loading analytics" className="mx-auto min-h-full w-full max-w-[1880px] space-y-5 py-5">
        <span className="sr-only">Loading your learning analytics.</span>
        <LoadingSkeleton className="h-28 rounded-[2rem] border border-white/10 bg-slate-900/70 p-6" />
        <section className="grid gap-5 lg:grid-cols-2">
          <LoadingSkeleton className="h-64 rounded-[2rem] border border-white/10 bg-slate-900/70 p-6" />
          <LoadingSkeleton className="h-64 rounded-[2rem] border border-white/10 bg-slate-900/70 p-6" />
        </section>
        <LoadingSkeleton className="h-72 rounded-[2rem] border border-white/10 bg-slate-900/70 p-6" />
      </div>
    );
  }

  return (
    <div className="progress-analytics-shell relative min-h-full w-full overflow-hidden rounded-[1.5rem] border border-cyan-100/10 bg-[radial-gradient(circle_at_12%_0%,rgba(20,184,166,0.10),transparent_30%),radial-gradient(circle_at_88%_4%,rgba(242,184,75,0.09),transparent_28%),linear-gradient(135deg,#06111D_0%,#080D16_50%,#0D1420_100%)] p-4 text-slate-200 shadow-[0_20px_64px_rgba(0,0,0,0.24)] [overflow-wrap:anywhere] sm:p-6">
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_right,rgba(148,163,184,0.04)_1px,transparent_1px),linear-gradient(to_bottom,rgba(148,163,184,0.035)_1px,transparent_1px)] bg-[size:64px_64px] opacity-45" />
      <div className="pointer-events-none absolute inset-x-12 top-0 h-px bg-gradient-to-r from-transparent via-cyan-200/40 to-transparent" />

      <div className="relative space-y-6">
        <section className="progress-hero-panel overflow-hidden rounded-[1.25rem] border border-cyan-100/12 bg-[linear-gradient(135deg,rgba(8,20,34,0.92),rgba(7,12,22,0.82))] shadow-[0_18px_56px_rgba(0,0,0,0.22)] backdrop-blur-2xl">
          <div className="grid gap-0 xl:grid-cols-[minmax(0,1.25fr)_minmax(0,0.8fr)]">
            <div className="min-w-0 p-5 sm:p-8">
              <div className="flex flex-wrap items-center gap-2">
                <TonePill tone="blue">Analytics</TonePill>
                <TonePill tone={error ? "amber" : "green"}>{error ? "Degraded" : "Live sync"}</TonePill>
                <span className={cn("rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 font-bold uppercase tracking-[0.18em]", styles.metaLabel)}>
                  Learner: {currentDisplayName}
                </span>
                {classLevel ? (
                  <span className={cn("rounded-full border border-amber-300/20 bg-amber-300/10 px-3 py-1 font-bold uppercase tracking-[0.18em]", styles.microType, styles.toneWarning)}>
                    {classLevel}
                  </span>
                ) : null}
              </div>
              <h1 className="mt-6 max-w-4xl text-3xl font-semibold tracking-tight text-white sm:text-5xl">
                Learning intelligence
              </h1>
              <p className="mt-4 max-w-3xl text-sm leading-7 text-slate-400 sm:text-base">
                See what is improving, where to focus next, and how your study
                habits are building over time.
              </p>
              {error ? (
                <div role="status" className="mt-4 flex flex-wrap items-center gap-3">
                  <p className={cn("text-xs font-semibold uppercase tracking-[0.16em]", styles.toneWarning)}>{error}</p>
                  <button
                    type="button"
                    onClick={retry}
                    className={cn("agentify-action rounded-full border border-amber-400/30 bg-amber-400/10 px-3 py-1.5 font-bold uppercase tracking-[0.16em] transition hover:bg-amber-400/16", styles.microType, styles.toneWarning)}
                  >
                    Retry sync
                  </button>
                </div>
              ) : null}

              <div className="mt-8 grid gap-3 sm:grid-cols-2 2xl:grid-cols-4">
                <div className="progress-mini-card rounded-2xl border border-white/10 bg-white/[0.035] p-4">
                  <p className={cn("font-bold uppercase tracking-[0.16em]", styles.metaLabel)}>Priority action</p>
                  <p className="mt-2 text-sm font-semibold text-white">{priorityCommand}</p>
                </div>
                <div className="progress-mini-card rounded-2xl border border-white/10 bg-white/[0.035] p-4">
                  <p className={cn("font-bold uppercase tracking-[0.16em]", styles.metaLabel)}>Tracked sessions</p>
                  <p className={cn("mt-2 text-2xl font-semibold", styles.accentValue)}>{sessions.length}</p>
                </div>
                <div className="progress-mini-card rounded-2xl border border-white/10 bg-white/[0.035] p-4">
                  <p className={cn("font-bold uppercase tracking-[0.16em]", styles.metaLabel)}>Latest topic</p>
                  <p className="mt-2 truncate text-sm font-semibold text-white">{latestSession?.topic || "No session yet"}</p>
                </div>
                <button
                  type="button"
                  onClick={handleExportCSV}
                  disabled={!sessions.length}
                  aria-disabled={!sessions.length}
                  title={sessions.length ? "Download session data as CSV" : "Complete one tracked session to export data"}
                  className="agentify-action rounded-2xl border border-[#14B8A6]/30 bg-[#14B8A6]/10 p-4 text-left transition hover:-translate-y-0.5 hover:bg-[#14B8A6]/16 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0"
                >
                  <span className={cn("block font-bold uppercase tracking-[0.16em]", styles.microType, styles.accentText)}>Export</span>
                  <span className="mt-2 block text-sm font-semibold text-white">Download CSV</span>
                </button>
              </div>
            </div>

            <div className="progress-readiness-pane min-w-0 border-t border-cyan-100/10 bg-white/[0.025] p-4 sm:p-6 xl:border-l xl:border-t-0">
              <div className="progress-readiness-card rounded-[2rem] border border-cyan-100/12 bg-black/20 p-5">
                <div className="flex items-center justify-between">
                  <p className={cn("text-xs font-bold uppercase tracking-[0.16em]", styles.metaLabel)}>Readiness score</p>
                  <TonePill tone={readinessTone}>{readinessScore >= 70 ? "Stable" : "Needs work"}</TonePill>
                </div>
                <div className="mt-6 flex items-end gap-3">
                  <span className={cn("text-7xl font-semibold tracking-tight", toneText(readinessTone))}>{readinessScore}</span>
                  <span className={cn("pb-3 text-sm font-semibold", styles.supportingText)}>/ 100</span>
                </div>
                <div className="mt-5">
                  <Rail value={readinessScore} tone={readinessTone} label="Readiness score" />
                </div>
                <div className="mt-6 grid grid-cols-2 gap-3 text-xs">
                  <div className="progress-mini-card rounded-2xl border border-white/10 bg-white/[0.035] p-3">
                    <span className={cn("block", styles.supportingText)}>Accuracy</span>
                    <span className="mt-1 block text-lg font-semibold text-white">{avgAccuracy}%</span>
                  </div>
                  <div className="progress-mini-card rounded-2xl border border-white/10 bg-white/[0.035] p-3">
                    <span className={cn("block", styles.supportingText)}>Focus</span>
                    <span className="mt-1 block text-lg font-semibold text-white">{avgFocus}</span>
                  </div>
                  <div className="progress-mini-card rounded-2xl border border-white/10 bg-white/[0.035] p-3">
                    <span className={cn("block", styles.supportingText)}>Level</span>
                    <span className="mt-1 block text-lg font-semibold text-white">{progress.level || 1}</span>
                  </div>
                  <div className="progress-mini-card rounded-2xl border border-white/10 bg-white/[0.035] p-3">
                    <span className={cn("block", styles.supportingText)}>Next XP</span>
                    <span className="mt-1 block text-lg font-semibold text-white">{xpToNext}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section
          className="progress-action-plan rounded-[2rem] border border-cyan-100/12 bg-[linear-gradient(135deg,rgba(20,184,166,0.10),rgba(255,170,10,0.07))] p-5 shadow-[0_24px_72px_rgba(0,0,0,0.18)]"
        >
          <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,0.8fr)]">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <TonePill tone={primaryWeakTopic ? "amber" : "green"}>Next move</TonePill>
                <span className={cn("rounded-full border border-white/10 bg-white/[0.045] px-3 py-1 font-bold uppercase tracking-[0.16em]", styles.metaLabel)}>
                  {priorityCommand}
                </span>
              </div>
              <h2 className="mt-4 text-2xl font-semibold tracking-tight text-white sm:text-3xl">{actionPlanTitle}</h2>
              <p className="mt-3 max-w-3xl text-sm leading-7 text-slate-400">{actionPlanBody}</p>
              <div className="mt-5 flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={() => {
                    if (primaryWeakTopic) {
                      handleReviseTopic(primaryWeakTopic.topic);
                      return;
                    }
                    router.push(sessions.length ? "/dashboard/exam" : "/dashboard/study");
                  }}
                  className={cn("agentify-action rounded-full border border-[#14B8A6]/30 bg-[#14B8A6]/10 px-5 py-3 text-xs font-bold uppercase tracking-[0.14em] transition hover:-translate-y-0.5 hover:bg-[#14B8A6]/20", styles.accentText)}
                >
                  {actionPlanTarget}
                </button>
                <button
                  type="button"
                  onClick={() => router.push("/dashboard/mission")}
                  className="agentify-action rounded-full border border-white/10 bg-white/[0.045] px-5 py-3 text-xs font-bold uppercase tracking-[0.14em] text-slate-300 transition hover:-translate-y-0.5 hover:bg-white/[0.075]"
                >
                  Build mission
                </button>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-3 xl:grid-cols-1">
              <div className="progress-action-card rounded-2xl border border-white/10 bg-black/20 p-4">
                <div className="flex items-center justify-between gap-3">
                  <p className={cn("font-bold uppercase tracking-[0.16em]", styles.metaLabel)}>Readiness</p>
                  <span className={cn("text-sm font-semibold", toneText(readinessTone))}>{readinessScore}%</span>
                </div>
                <div className="mt-3">
                  <Rail value={readinessScore} tone={readinessTone} label="Readiness score" />
                </div>
              </div>
              <div className="progress-action-card rounded-2xl border border-white/10 bg-black/20 p-4">
                <p className={cn("font-bold uppercase tracking-[0.16em]", styles.metaLabel)}>Focus signal</p>
                <p className="mt-2 text-2xl font-semibold text-white">{avgFocus || 0}</p>
                <p className={cn("mt-1 text-xs", styles.supportingText)}>{avgFocus >= 75 ? "Strong session discipline" : "Short focused loops will help"}</p>
              </div>
              <div className="progress-action-card rounded-2xl border border-white/10 bg-black/20 p-4">
                <p className={cn("font-bold uppercase tracking-[0.16em]", styles.metaLabel)}>Momentum</p>
                <p className="mt-2 text-2xl font-semibold text-white">{progress.streak} day{progress.streak === 1 ? "" : "s"}</p>
                <p className={cn("mt-1 text-xs", styles.supportingText)}>{sessions.length ? `${sessions.length} tracked sessions` : "No tracked session yet"}</p>
              </div>
            </div>
          </div>
        </section>

      {/* Top stat cards */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <GlassCard label="Accuracy" value={`${avgAccuracy}%`} tone={getScoreTone(avgAccuracy)} />
        <GlassCard label="Study Time" value={formatHours(totalDuration)} tone="blue" />
        <GlassCard label="Total XP" value={`${totalXp}`} tone="amber" />
        <GlassCard label="Streak" value={`${progress.streak} DAYS`} tone="amber" />
        <GlassCard label="Level" value={`LVL ${progress.level || 1}`} tone="blue" active />
        <GlassCard label="Best Subject" value={bestSubject} tone="green" />
      </div>

      {/* Personal progress trends and learning signals */}
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.8fr)_minmax(0,1fr)]">
        <GlassPanel
          title="XP progress over time"
          right={
            <div className="flex items-center gap-4">
              <span className={cn("font-mono uppercase tracking-[0.24em]", styles.microType, styles.tonePositive)}>LIVE</span>
              <TrendRangeToggle range={range} setRange={setRange} />
            </div>
          }
        >
          <LineChart
            labels={trendLabels}
            series={[
              { label: "xp_velocity", color: "#FFAA0A", data: trendXp },
            ]}
            valueSuffix=""
          />
        </GlassPanel>

        <div className="min-w-0 space-y-6">
          {/* Predictive Insights */}
          <GlassPanel title="What your data suggests" tag="AI">
            <div className="space-y-3 max-h-[400px] overflow-y-auto">
              {insights.map((insight, i) => (
                <div key={i} className={cn(
                  "rounded-lg border p-3",
                  insight.type === "positive" ? "border-emerald-500/30 bg-emerald-500/5" :
                  insight.type === "negative" ? "border-red-500/30 bg-red-500/5" :
                  "border-white/10 bg-white/5"
                )}>
                  <p className={cn("text-xs", insight.type === "positive" ? styles.tonePositive : insight.type === "negative" ? styles.toneDanger : styles.toneNeutral)}>
                    {insight.message}
                  </p>
                </div>
              ))}
            </div>
          </GlassPanel>

          {/* Consistency & Efficiency (new) */}
          { (progress.consistency_index > 0 || progress.learning_efficiency > 0) && (
            <GlassPanel title="Study habits" tag="DEEP">
              <div className="grid grid-cols-2 gap-4">
                {progress.consistency_index > 0 && (
                  <div>
                    <div className={cn("mb-1 uppercase", styles.metaLabel)}>Consistency</div>
                    <div className="text-2xl font-bold text-white">{progress.consistency_index}%</div>
                    <Rail value={progress.consistency_index} tone="blue" label="Consistency index" />
                  </div>
                )}
                {progress.learning_efficiency > 0 && (
                  <div>
                    <div className={cn("mb-1 uppercase", styles.metaLabel)}>Efficiency</div>
                    <div className="text-2xl font-bold text-white">{progress.learning_efficiency}%</div>
                    <Rail value={progress.learning_efficiency} tone="green" label="Learning efficiency" />
                  </div>
                )}
              </div>
            </GlassPanel>
          )}

        </div>
      </div>

      {/* Personal level progression */}
      <div>
        <GlassPanel title="Level progress">
          <div className="space-y-4">
            <div className="flex justify-between text-xs">
              <span className="text-gray-400">Total XP</span>
              <span className="text-2xl font-bold text-white">{totalXp}</span>
            </div>
            <div role="progressbar" aria-label="Progress to next level" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(levelProgress)} aria-valuetext={`${xpToNext} XP to next level`} className="h-2 bg-white/5 rounded-full overflow-hidden">
              <div className="h-full bg-gradient-to-r from-amber-400 to-orange-500" style={{ width: `${levelProgress}%` }} />
            </div>
            <div className={cn("flex flex-wrap justify-between gap-2 uppercase", styles.metaLabel)}>
              <span>LVL {progress.level || 1}</span>
              <span>{xpToNext} XP to next</span>
              <span>LVL {(progress.level || 1) + 1}</span>
            </div>
          </div>
        </GlassPanel>
      </div>

      {/* Row 3a: Revision Queue — spaced-repetition plan for today */}
      <div id="analytics-focus" className="scroll-mt-28 space-y-6">
      {revisionQueue.length > 0 && (
        <GlassPanel title="Today's revision" tag="MEMORY" className="border-cyan-500/20">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {revisionQueue.slice(0, 6).map((entry) => {
              const tones = QUEUE_TONES[entry.bucket];
              return (
                <div key={entry.topic} className={cn("rounded-lg border p-4 flex flex-col justify-between", tones.card)}>
                  <div>
                    <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                      <h4 className={cn("text-sm font-bold uppercase truncate", tones.text)}>{entry.topic.replace(/_/g, " ")}</h4>
                      <span className={cn("shrink-0 rounded-full border px-2 py-0.5 font-bold", styles.microType, tones.chip)}>
                        {BUCKET_LABELS[entry.bucket]} · {entry.suggested_minutes}m
                      </span>
                    </div>
                    <div className="flex flex-wrap items-baseline gap-2">
                      <span className={cn("text-xl font-bold", tones.text)}>{Math.round(entry.retention_estimate * 100)}%</span>
                      <span className="text-xs text-gray-400">est. retention</span>
                      <span className="text-xs text-gray-400">· {entry.accuracy}% acc</span>
                    </div>
                    <p className="mt-2 text-[11px] leading-4 text-gray-400">{entry.reason}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleReviseTopic(entry.topic)}
                    className={cn("agentify-action mt-3 w-full rounded-md border border-[#0E7490]/30 bg-[#0E7490]/10 py-2 text-xs font-bold transition-all hover:bg-[#0E7490]/20", styles.accentText)}
                  >
                    REVISE NOW
                  </button>
                </div>
              );
            })}
          </div>
        </GlassPanel>
      )}

      {/* Row 3: Weak Topic Spotlight (new, actionable) */}
      {weakTopics.length > 0 && (
        <GlassPanel title="Topics to strengthen" tag="PRIORITY" className="border-red-500/20">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {weakTopics.map((topic) => (
              <div key={`${topic.subject}-${topic.topic}`} className="bg-red-500/5 border border-red-500/20 rounded-lg p-4 flex flex-col justify-between">
                <div>
                  <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                    <h4 className={cn("text-sm font-bold uppercase", styles.toneDanger)}>{topic.topic}</h4>
                    <span className={styles.metaLabel}>{topic.subject}</span>
                  </div>
                  <div className="flex flex-wrap items-baseline gap-2">
                    <span className={cn("text-xl font-bold", styles.toneDanger)}>{topic.accuracy}%</span>
                    <span className="text-xs text-gray-400">{topic.sessions} sessions</span>
                    {topic.trend !== 0 && (
                      <span className={cn("text-xs", topic.trend > 0 ? styles.tonePositive : styles.toneDanger)}>
                        {topic.trend > 0 ? "up improving" : "down declining"}
                      </span>
                    )}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => handleReviseTopic(topic.topic)}
                  className={cn("agentify-action mt-3 w-full rounded-md border border-[#0E7490]/30 bg-[#0E7490]/10 py-2 text-xs font-bold transition-all hover:bg-[#0E7490]/20", styles.accentText)}
                >
                  REVISE NOW
                </button>
              </div>
            ))}
          </div>
        </GlassPanel>
      )}
      </div>

      {/* Detailed personal study history */}
      <div className="space-y-6">
          <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
            <GlassPanel title="Weekly study time" tag="TIME">
              {weeklyLabels.length ? (
                <div className="space-y-4">
                  {weeklyLabels.map((label, i) => {
                    const maxDuration = Math.max(...weeklyDurations);
                    const percent = maxDuration > 0 ? Math.round((weeklyDurations[i] / maxDuration) * 100) : 0;
                    return (
                      <div key={label} className={styles.weeklyRow}>
                        <span className="text-xs text-gray-400">{label}</span>
                        <Rail value={percent} tone="amber" label={`Relative study time for ${label}`} />
                        <span className="text-right text-xs text-white font-mono">{formatMinutes(weeklyDurations[i])}</span>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <EmptyState title="No weekly data" detail="Complete timestamped sessions to see weekly study time." />
              )}
            </GlassPanel>

            <GlassPanel title="Subject breakdown" tag="SUBJ">
              {subjects.length ? (
                <div className="space-y-4">
                  {subjects.map((subj) => (
                    <div key={subj.subject} className="flex items-center justify-between gap-3 border-b border-white/5 pb-3 last:border-0">
                      <div className="min-w-0">
                        <div className="text-sm font-bold text-white uppercase">{subj.subject}</div>
                        <div className={styles.metaLabel}>{subj.sessions} sessions / {formatMinutes(subj.duration)}</div>
                      </div>
                      <div className="shrink-0 text-right">
                        <div className={cn("text-lg font-bold", toneText(getScoreTone(subj.accuracy)))}>{subj.accuracy}%</div>
                        <div className={styles.metaLabel}>focus {subj.focus}</div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <EmptyState title="No subject data" detail="Complete sessions to populate subject breakdown." />
              )}
            </GlassPanel>
          </div>

          {/* Row 5: Heatmap + Topic Matrix */}
          <div className="grid gap-6 xl:grid-cols-[minmax(0,0.7fr)_minmax(0,1fr)]">
            <GlassPanel title="Activity heatmap" tag="35D" right={<TonePill tone="amber">{heatmap.reduce((a, b) => a + b.value, 0)} sessions</TonePill>}>
              {heatmap.length ? (
                <div className="space-y-2" role="list" aria-label="Study sessions during the last 35 days">
                  {Array.from({ length: Math.ceil(heatmap.length / 7) }, (_, i) => heatmap.slice(i * 7, i * 7 + 7)).map((week, wi) => (
                    <div key={wi} className="grid grid-cols-7 gap-2">
                      {week.map((item) => {
                        const intensity = item.value === 0 ? 0.08 : 0.24 + (item.value / Math.max(...heatmap.map((h) => h.value)) / 1.15);
                        return (
                          <div
                            key={item.key}
                            role="listitem"
                            aria-label={`${item.label}: ${item.value} sessions`}
                            title={`${item.label}: ${item.value} sessions`}
                            className="aspect-square rounded-sm border border-white/10"
                            style={{ backgroundColor: `rgba(255, 170, 10, ${intensity})` }}
                          />
                        );
                      })}
                    </div>
                  ))}
                </div>
              ) : (
                <EmptyState title="No activity grid" detail="Timestamped sessions unlock the 35-day activity view." />
              )}
            </GlassPanel>

            <GlassPanel title="Topic matrix" tag="LOG">
              {topics.length ? (
                <div role="region" aria-label="Topic matrix, scroll to see all columns" tabIndex={0} className={cn("overflow-auto", styles.scrollRegion)}>
                  <table className={styles.matrixTable}>
                    <caption className="sr-only">Topic performance, study time, and recent accuracy trends</caption>
                    <thead>
                      <tr className={cn("border-b border-white/10 bg-white/[0.02] font-mono uppercase tracking-[0.2em]", styles.metaLabel)}>
                        <th scope="col">Topic</th>
                        <th scope="col">Subject</th>
                        <th scope="col" className="text-right"><abbr title="Accuracy">Acc</abbr></th>
                        <th scope="col" className="text-right">Sessions</th>
                        <th scope="col" className="text-right">Time</th>
                        <th scope="col" className="text-right">Trend</th>
                      </tr>
                    </thead>
                    <tbody>
                    {topics.map((topic) => {
                      const trend = getTopicTrend(sessions, topic.topic, topic.subject);
                      return (
                        <tr key={`${topic.subject}-${topic.topic}`} className="border-b border-white/5 text-xs hover:bg-white/[0.02]">
                          <th scope="row" className="text-white font-mono font-normal uppercase">{topic.topic}</th>
                          <td className="text-gray-400">{topic.subject}</td>
                          <td className={cn("text-right font-bold", toneText(getScoreTone(topic.accuracy)))}>{topic.accuracy}%</td>
                          <td className="text-right text-gray-300">{topic.sessions}</td>
                          <td className="text-right text-gray-300">{formatMinutes(topic.duration)}</td>
                          <td className="text-right text-gray-400">
                            {trend === 1 ? "up" : trend === -1 ? "down" : "flat"}
                          </td>
                        </tr>
                      );
                    })}
                    </tbody>
                  </table>
                </div>
              ) : (
                <EmptyState title="No topic data" detail="Complete sessions to populate topic breakdown." />
              )}
            </GlassPanel>
          </div>
      </div>
    </div>
    </div>
  );
}
