"use client";

import { useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import { EmptyState } from "@/components/ui/Polished";
import { HealthBadge } from "./HealthBadge";
import {
  MUTED,
  PANEL,
  SOFT_PANEL,
  TEXT,
  classifyHealth,
  formatBytes,
  formatCompact,
  formatPercent,
  formatTime,
} from "./format";
import type { ContentReport, ReportChapter } from "./types";

const DIFFICULTY_LABEL = ["", "Very easy", "Easy", "Medium", "Hard", "Very hard"];
const NUM = "font-mono tabular-nums";

// Pipeline stages a chapter passes through; the reached stage lights up.
const STAGES = ["Ingested", "Concepts", "Embedded", "Published"] as const;
function stageReached(chapter: ReportChapter): number {
  if (chapter.status === "published" || chapter.status === "approved") return 4;
  if (chapter.embedded_chunks > 0) return 3;
  if (chapter.concept_count > 0) return 2;
  if (chapter.chunk_count > 0) return 1;
  return 0;
}

function Field({ label, value, tone }: { label: string; value: React.ReactNode; tone?: string }) {
  return (
    <div className="rounded-lg border border-[color:var(--agentify-border)] bg-[color:var(--agentify-hover-bg)] px-2.5 py-1.5">
      <p className={cn("text-xs font-bold uppercase tracking-[0.1em]", MUTED)}>{label}</p>
      <p className={cn("mt-0.5 text-xs font-semibold", NUM, tone || TEXT)}>{value}</p>
    </div>
  );
}

function ChapterDetail({ chapter }: { chapter: ReportChapter }) {
  const reached = stageReached(chapter);
  return (
    <div className="space-y-3">
      {/* Pipeline stages */}
      <div className="flex flex-wrap items-center gap-1.5">
        {STAGES.map((stage, i) => {
          const done = i < reached;
          const held = chapter.status === "needs_review" && i === reached;
          return (
            <span key={stage} className="flex items-center">
              <span
                className="rounded-md border px-2 py-1 text-xs font-semibold"
                style={done
                  ? { borderColor: "var(--ds-success)", background: "var(--ds-success-soft)", color: "var(--ds-success)" }
                  : held
                    ? { borderColor: "var(--ds-warning)", background: "var(--ds-warning-soft)", color: "var(--ds-warning)" }
                    : { borderColor: "var(--agentify-border)", color: "var(--agentify-muted-text)" }}
              >
                {stage}
              </span>
              {i < STAGES.length - 1 ? <span className="mx-0.5 text-xs" style={{ color: done ? "var(--ds-success)" : "var(--agentify-muted-text)" }}>›</span> : null}
            </span>
          );
        })}
        {chapter.status === "needs_review" ? (
          <span className="ml-1 rounded-full border border-[var(--ds-warning)] bg-[var(--ds-warning-soft)] px-2 py-1 text-xs font-bold text-[var(--ds-warning)]">held for review</span>
        ) : null}
      </div>

      {/* Quality + data + provenance fields */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-6">
        <Field label="Coverage" value={formatPercent(chapter.coverage_score)} tone={covTone(chapter.coverage_score)} />
        <Field label="Extraction" value={formatPercent(chapter.extraction_quality)} />
        <Field label="Error rate" value={formatPercent(chapter.error_rate)} tone={errTone(chapter.error_rate)} />
        <Field label="Pages" value={`${chapter.extracted_page_count}/${chapter.page_count}`} />
        <Field label="Chunks" value={`${chapter.embedded_chunks}/${chapter.chunk_count}`} />
        <Field label="Memory" value={formatBytes(chapter.memory_bytes)} />
        <Field label="Tokens" value={formatCompact(chapter.chunk_tokens)} />
        <Field label="Vectors" value={chapter.embedding_dims ? `${chapter.embedding_dims}d` : "—"} />
        <Field label="Ready" value={chapter.ready_for_approval ? "yes" : "no"} tone={chapter.ready_for_approval ? "text-[var(--ds-success)]" : "text-[var(--ds-warning)]"} />
        <Field label="Version" value={chapter.version || "—"} />
        <Field label="Published" value={chapter.published_at ? formatTime(chapter.published_at) : "—"} />
        <Field label="Updated" value={chapter.updated_at ? formatTime(chapter.updated_at) : "—"} />
      </div>

      {/* Why it needs review */}
      {chapter.missing_source_pages.length || (chapter.issues && chapter.issues.length) ? (
        <div className={cn(SOFT_PANEL, "p-2.5")}>
          <p className={cn("text-xs font-bold uppercase tracking-[0.1em]", "text-[var(--ds-warning)]")}>Review notes</p>
          {chapter.missing_source_pages.length ? (
            <p className={cn("mt-1 text-xs", MUTED)}>Uncovered pages: <span className={NUM}>{chapter.missing_source_pages.join(", ")}</span></p>
          ) : null}
          {(chapter.issues || []).slice(0, 6).map((issue, i) => (
            <p key={i} className={cn("mt-1 text-xs", issue.severity === "error" ? "text-[var(--ds-danger)]" : MUTED)}>
              • {issue.message}{issue.concept_id ? <span className="opacity-70"> ({issue.concept_id})</span> : null}
            </p>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function errTone(rate: number): string {
  if (rate <= 0) return "text-[var(--ds-success)]";
  if (rate < 0.15) return "text-[var(--ds-warning)]";
  return "text-[var(--ds-danger)]";
}
function covTone(score: number): string {
  if (score >= 0.7) return "text-[var(--ds-success)]";
  if (score >= 0.4) return "text-[var(--ds-warning)]";
  return "text-[var(--ds-danger)]";
}

function Kpi({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: string }) {
  return (
    <div className="rounded-xl border border-[color:var(--agentify-border)] bg-[color:var(--agentify-hover-bg)] px-3 py-2.5">
      <p className={cn("text-xs font-bold uppercase tracking-[0.12em]", MUTED)}>{label}</p>
      <p className={cn("mt-1 text-lg font-semibold tracking-tight", NUM, tone || TEXT)}>{value}</p>
      {sub ? <p className={cn("mt-0.5 text-xs", MUTED)}>{sub}</p> : null}
    </div>
  );
}

function SubtopicTable({ chapter }: { chapter: ReportChapter }) {
  if (!chapter.concepts.length) {
    return <p className={cn("px-2 py-3 text-xs", MUTED)}>No subtopics generated for this chapter yet.</p>;
  }
  const sorted = [...chapter.concepts].sort((a, b) => b.chars - a.chars);
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[640px] border-collapse text-left text-xs">
        <thead>
          <tr className={cn("text-xs font-bold uppercase tracking-[0.1em]", MUTED)}>
            <th className="px-2 py-1.5">Subtopic</th>
            <th className="px-2 py-1.5">Difficulty</th>
            <th className="px-2 py-1.5">Importance</th>
            <th className="px-2 py-1.5">Weightage</th>
            <th className={cn("px-2 py-1.5 text-right")}>Memory</th>
            <th className={cn("px-2 py-1.5 text-right")}>Tokens</th>
            <th className="px-2 py-1.5">Pages</th>
            <th className={cn("px-2 py-1.5 text-right")}>Issues</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((c) => (
            <tr key={c.concept_id} className="border-t border-[color:var(--agentify-border)] hover:bg-[color:var(--agentify-active-bg)]">
              <td className={cn("px-2 py-1.5 font-medium", TEXT)}>{c.title || c.concept_id}</td>
              <td className={cn("px-2 py-1.5", MUTED)}>{DIFFICULTY_LABEL[c.difficulty_level] || `L${c.difficulty_level}`}</td>
              <td className={cn("px-2 py-1.5", MUTED)}>{c.importance_level || "—"}</td>
              <td className={cn("px-2 py-1.5", MUTED)}>{c.typical_exam_weightage || "—"}</td>
              <td className={cn("px-2 py-1.5 text-right", NUM, TEXT)}>{formatBytes(c.chars)}</td>
              <td className={cn("px-2 py-1.5 text-right", NUM, MUTED)}>{formatCompact(c.tokens)}</td>
              <td className={cn("px-2 py-1.5", NUM, MUTED)}>{c.source_pages.length ? c.source_pages.join(",") : "—"}</td>
              <td className={cn("px-2 py-1.5 text-right", NUM, c.validation_issues ? "text-[var(--ds-danger)]" : MUTED)}>{c.validation_issues}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {chapter.concepts_truncated ? (
        <p className={cn("mt-2 px-2 text-xs", MUTED)}>Showing {chapter.concepts.length} of {chapter.concept_count} subtopics.</p>
      ) : null}
    </div>
  );
}

function ChapterRow({ chapter, maxMemory }: { chapter: ReportChapter; maxMemory: number }) {
  const [open, setOpen] = useState(false);
  const embPct = chapter.chunk_count ? (chapter.embedded_chunks / chapter.chunk_count) * 100 : 0;
  const memShare = maxMemory ? (chapter.memory_bytes / maxMemory) * 100 : 0;
  return (
    <>
      <tr
        className="cursor-pointer border-t border-[color:var(--agentify-border)] hover:bg-[color:var(--agentify-active-bg)]"
        onClick={() => setOpen((v) => !v)}
      >
        <td className="px-2 py-2">
          <span className={cn("inline-block w-3 text-xs", MUTED)}>{open ? "▾" : "▸"}</span>
          <span className={cn("text-xs", MUTED)}>{chapter.subject || "—"}</span>
        </td>
        <td className={cn("px-2 py-2 font-medium", TEXT)}>
          <span className="line-clamp-1">{chapter.chapter_name || `Chapter ${chapter.chapter_number ?? ""}`}</span>
          <span className={cn("text-xs", MUTED)}>Class {chapter.class_level || "—"}</span>
        </td>
        <td className="px-2 py-2"><HealthBadge state={classifyHealth(chapter.status)} label={chapter.status} /></td>
        <td className={cn("px-2 py-2 text-right", NUM, MUTED)}>{chapter.page_count}</td>
        <td className={cn("px-2 py-2 text-right", NUM, TEXT)}>{chapter.concept_count}</td>
        <td className={cn("px-2 py-2 text-right", NUM, MUTED)}>{formatCompact(chapter.chunk_count)}</td>
        <td className="px-2 py-2 text-right">
          <span className={cn(NUM, TEXT)}>{formatBytes(chapter.memory_bytes)}</span>
          <span className="mt-1 block h-1 overflow-hidden rounded-full bg-[color:var(--agentify-border)]">
            <span className="block h-full rounded-full bg-[var(--ds-accent-teal)]" style={{ width: `${Math.max(3, memShare)}%` }} />
          </span>
        </td>
        <td className={cn("px-2 py-2 text-right", NUM, embPct >= 99 ? "text-[var(--ds-success)]" : MUTED)}>{Math.round(embPct)}%</td>
        <td className={cn("px-2 py-2 text-right", NUM, covTone(chapter.coverage_score))}>{formatPercent(chapter.coverage_score)}</td>
        <td className={cn("px-2 py-2 text-right", NUM, errTone(chapter.error_rate))}>{formatPercent(chapter.error_rate)}</td>
      </tr>
      {open ? (
        <tr className="border-t border-[color:var(--agentify-border)] bg-[color:var(--agentify-hover-bg)]">
          <td colSpan={10} className="px-3 py-3">
            <div className="space-y-3">
              <ChapterDetail chapter={chapter} />
              <SubtopicTable chapter={chapter} />
            </div>
          </td>
        </tr>
      ) : null}
    </>
  );
}

export function DataIngestionReport({ report }: { report: ContentReport | null }) {
  const subjectMemory = useMemo(() => {
    const map = new Map<string, number>();
    for (const ch of report?.chapters || []) {
      map.set(ch.subject || "Unspecified", (map.get(ch.subject || "Unspecified") || 0) + ch.memory_bytes);
    }
    return [...map.entries()].sort((a, b) => b[1] - a[1]);
  }, [report]);

  const chapters = useMemo(
    () => [...(report?.chapters || [])].sort((a, b) => b.memory_bytes - a.memory_bytes),
    [report],
  );

  if (!report) {
    return (
      <EmptyState
        icon="book"
        title="Ingestion report unavailable"
        detail="The content ingestion report could not be loaded from the backend. Ensure the content pipeline tables exist and retry."
      />
    );
  }
  if (!report.totals.chapters) {
    return (
      <EmptyState
        icon="book"
        title="No study content ingested yet"
        detail="Once chapters are ingested and approved, their data size, subjects, and subtopics will appear here."
      />
    );
  }

  const t = report.totals;
  const needsReview = chapters.filter((c) => c.status !== "published" && c.status !== "approved").length;
  const maxMemory = Math.max(...chapters.map((c) => c.memory_bytes), 1);
  const maxSubject = Math.max(...subjectMemory.map(([, v]) => v), 1);
  const embPct = t.chunks ? (t.embedded_chunks / t.chunks) * 100 : 0;

  return (
    <div className={cn(PANEL, "p-4 sm:p-5")}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className={cn("text-sm font-semibold", TEXT)}>Knowledge base — data &amp; memory</p>
          <p className={cn("mt-0.5 text-xs", MUTED)}>
            {report.database_dialect} · {report.embeddings_enabled ? `vectors ${t.embedding_dims}d (${report.embeddings_model})` : "no embeddings (lexical only)"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {needsReview > 0 ? (
            <span className="rounded-full border border-[var(--ds-warning)] bg-[var(--ds-warning-soft)] px-2.5 py-1 text-xs font-bold text-[var(--ds-warning)]">
              {needsReview} need review
            </span>
          ) : (
            <span className="rounded-full border border-[var(--ds-success)] bg-[var(--ds-success-soft)] px-2.5 py-1 text-xs font-bold text-[var(--ds-success)]">all published</span>
          )}
          <HealthBadge state={report.embeddings_enabled ? "healthy" : "warning"} label={report.embeddings_enabled ? "Semantic" : "Lexical"} />
        </div>
      </div>

      {/* KPI strip */}
      <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-6">
        <Kpi label="Total memory" value={formatBytes(t.memory_bytes)} sub={`${formatBytes(t.embedding_bytes)} vectors`} tone="text-[var(--ds-success)]" />
        <Kpi label="Indexed text" value={formatBytes(t.chunk_chars)} sub={`${formatCompact(t.chunks)} chunks`} />
        <Kpi label="Tokens" value={formatCompact(t.tokens)} sub="estimated" />
        <Kpi label="Embedded" value={`${Math.round(embPct)}%`} sub={`${formatCompact(t.embedded_chunks)}/${formatCompact(t.chunks)}`} tone={embPct >= 99 ? "text-[var(--ds-success)]" : undefined} />
        <Kpi label="Subtopics" value={formatCompact(t.concepts)} sub={`${t.chapters} chapters`} />
        <Kpi label="Error rate" value={formatPercent(t.error_rate)} sub={`${t.concepts_with_issues} flagged`} tone={errTone(t.error_rate)} />
      </div>

      {/* Memory by subject */}
      {subjectMemory.length ? (
        <div className="mt-4">
          <p className={cn("mb-2 text-xs font-bold uppercase tracking-[0.12em]", MUTED)}>Memory by subject</p>
          <div className="space-y-1.5">
            {subjectMemory.map(([subject, bytes]) => (
              <div key={subject} className="flex items-center gap-3">
                <span className={cn("w-28 shrink-0 truncate text-xs font-medium", TEXT)}>{subject}</span>
                <span className="h-2 flex-1 overflow-hidden rounded-full bg-[color:var(--agentify-border)]">
                  <span className="block h-full rounded-full bg-[linear-gradient(90deg,#0E7490,#14B8A6)]" style={{ width: `${Math.max(3, (bytes / maxSubject) * 100)}%` }} />
                </span>
                <span className={cn("w-20 shrink-0 text-right text-xs", NUM, MUTED)}>{formatBytes(bytes)}</span>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {/* Dense chapter table */}
      <div className="mt-5 overflow-x-auto">
        <table className="w-full min-w-[820px] border-collapse text-left text-xs">
          <thead>
            <tr className={cn("text-xs font-bold uppercase tracking-[0.1em]", MUTED)}>
              <th className="px-2 py-2">Subject</th>
              <th className="px-2 py-2">Chapter</th>
              <th className="px-2 py-2">Status</th>
              <th className="px-2 py-2 text-right">Pages</th>
              <th className="px-2 py-2 text-right">Subtopics</th>
              <th className="px-2 py-2 text-right">Chunks</th>
              <th className="px-2 py-2 text-right">Memory</th>
              <th className="px-2 py-2 text-right">Emb%</th>
              <th className="px-2 py-2 text-right">Cov</th>
              <th className="px-2 py-2 text-right">Err</th>
            </tr>
          </thead>
          <tbody>
            {chapters.map((chapter) => (
              <ChapterRow key={chapter.id} chapter={chapter} maxMemory={maxMemory} />
            ))}
          </tbody>
        </table>
      </div>
      <p className={cn("mt-3 text-xs", MUTED)}>Click a chapter to expand its subtopics (sorted by memory). Memory = indexed chunk text + embedding vectors.</p>
    </div>
  );
}
