"use client";

import { EmptyState } from "@/components/ui/Polished";
import { cn } from "@/lib/utils";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { HealthBadge, HealthDot } from "./HealthBadge";
import { MUTED, PANEL, SOFT_PANEL, TEXT, classifyHealth, formatPercent, formatTime, humanize } from "./format";
import type { AdminChapterEvidence, AdminContentEvidence, AdminContentEvidenceChapter, AdminEvidenceOverview, AdminSubtopicEvidence, HealthState } from "./types";

const NUM = "font-mono tabular-nums";
const EYEBROW = "text-xs font-bold uppercase tracking-[0.14em] text-[color:var(--agentify-muted-text)]";
const DIFFICULTY = ["", "Very easy", "Easy", "Medium", "Hard", "Very hard"];

function formatPercentagePoints(value: number | null | undefined) {
  return value == null || Number.isNaN(Number(value)) ? "—" : `${Math.round(Number(value))}%`;
}

function evidenceState(value?: string): HealthState {
  const normalized = String(value || "").toLowerCase();
  if (["ready", "verified", "healthy", "published"].includes(normalized)) return "healthy";
  if (["lexical_only", "content_ready_unverified_provenance", "attention"].includes(normalized)) return "warning";
  if (["incomplete", "mismatch", "database_unavailable", "readiness_check_failed"].includes(normalized)) return "error";
  return classifyHealth(value);
}

function toneForPercent(value: number, warning = 70) {
  if (value >= 99) return "text-[var(--ds-success)]";
  if (value >= warning) return "text-[var(--ds-warning)]";
  return "text-[var(--ds-danger)]";
}

function Metric({ label, value, detail, tone }: { label: string; value: string; detail: string; tone?: string }) {
  return <div className={cn(SOFT_PANEL, "min-w-0 p-4")}><p className={EYEBROW}>{label}</p><p className={cn("mt-2 text-xl font-semibold", NUM, tone || TEXT)}>{value}</p><p className={cn("mt-1 text-sm leading-5", MUTED)}>{detail}</p></div>;
}

function StatusProof({ state, label, value, detail }: { state: HealthState; label: string; value: string; detail: string }) {
  return <div className={cn(PANEL, "p-5")}><div className="flex flex-wrap items-center justify-between gap-3"><p className={EYEBROW}>{label}</p><HealthBadge state={state} label={value} pulse={state === "healthy"} /></div><p className={cn("mt-3 text-sm leading-6", MUTED)}>{detail}</p></div>;
}

function SourceReference({ verified, missing }: { verified: number[]; missing: number[] }) {
  if (!verified.length && !missing.length) return <span className="inline-flex rounded-lg border border-[var(--ds-danger)] bg-[var(--ds-danger-soft)] px-2.5 py-1.5 text-xs font-semibold text-[var(--ds-danger)]">No source-page reference</span>;
  return <span className={cn("inline-flex flex-wrap items-center gap-1 rounded-lg border px-2.5 py-1.5 text-xs font-semibold", missing.length ? "border-[var(--ds-warning)] bg-[var(--ds-warning-soft)]" : "border-[color:var(--agentify-border)] bg-[color:var(--agentify-card-bg)]")}><span>{missing.length ? "Verified / missing pages" : "Verified source pages"}</span><span className={cn(NUM, "text-[var(--ds-accent-teal)]")}>{verified.join(", ") || "none"}{missing.length ? ` / ${missing.join(", ")}` : ""}</span></span>;
}

function SubtopicEvidence({ subtopic }: { subtopic: AdminSubtopicEvidence }) {
  const checks = [
    subtopic.content_checks.has_definition ? "definition" : "",
    subtopic.content_checks.has_explanation ? "explanation" : "",
    subtopic.content_checks.key_point_count ? `${subtopic.content_checks.key_point_count} key points` : "",
    subtopic.content_checks.example_count ? `${subtopic.content_checks.example_count} examples` : "",
    subtopic.content_checks.formula_count ? `${subtopic.content_checks.formula_count} formulas` : "",
  ].filter(Boolean);
  return (
    <article className={cn(SOFT_PANEL, "p-4")}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"><div className="min-w-0"><p className={EYEBROW}>Learning unit / subtopic</p><h4 className={cn("mt-1 text-base font-semibold leading-6", TEXT)}>{subtopic.title || subtopic.concept_id}</h4></div><HealthBadge state={subtopic.validation.passed ? "healthy" : "warning"} label={subtopic.validation.passed ? "validated" : `${subtopic.validation.issues.length} issues`} /></div>
      <div className="mt-3 flex flex-wrap gap-2"><SourceReference verified={subtopic.source_proof.verified_page_numbers} missing={subtopic.source_proof.missing_page_numbers} /><span className={cn(SOFT_PANEL, "px-2.5 py-1.5 text-xs", MUTED)}>{DIFFICULTY[subtopic.difficulty_level] || `Difficulty ${subtopic.difficulty_level}`}</span>{subtopic.importance_level ? <span className={cn(SOFT_PANEL, "px-2.5 py-1.5 text-xs", MUTED)}>{humanize(subtopic.importance_level)} importance</span> : null}{subtopic.exam_weightage ? <span className={cn(SOFT_PANEL, "px-2.5 py-1.5 text-xs", MUTED)}>{humanize(subtopic.exam_weightage)} exam weight</span> : null}</div>
      <p className={cn("mt-3 text-sm leading-6", MUTED)}>{checks.length ? `Structured checks: ${checks.join(" · ")}.` : "No structured teaching checks recorded."}</p>
      {!subtopic.validation.passed ? <ul className="mt-3 space-y-1">{subtopic.validation.issues.map((issue, index) => <li key={`${issue.code}-${index}`} className={cn("text-sm", issue.severity === "error" ? "text-[var(--ds-danger)]" : "text-[var(--ds-warning)]")}>{issue.message || humanize(issue.code)}</li>)}</ul> : null}
    </article>
  );
}

function ChapterDetail({ detail }: { detail: AdminChapterEvidence }) {
  const chapter = detail.chapter;
  const retrieval = detail.retrieval_evidence;
  const sourceRanges = retrieval.source_page_ranges.map((range) => range.page_start === range.page_end ? String(range.page_start) : `${range.page_start}–${range.page_end}`);
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4"><Metric label="Source coverage" value={formatPercent(chapter.coverage_score)} detail={`${detail.subtopics.filter((item) => item.source_proof.verified).length}/${detail.pagination.total} units verified`} /><Metric label="Extraction" value={formatPercent(chapter.extraction_quality)} detail="Stored extraction score" /><Metric label="Embedding proof" value={formatPercentagePoints(retrieval.embedding_coverage_percent)} detail={`${retrieval.embedded_chunk_count}/${retrieval.chunk_count} chunks`} tone={toneForPercent(retrieval.embedding_coverage_percent)} /><Metric label="Blocking issues" value={String(chapter.blocking_issue_count)} detail={chapter.blocking_issue_count ? "Requires review" : "Approval gate clear"} tone={chapter.blocking_issue_count ? "text-[var(--ds-danger)]" : "text-[var(--ds-success)]"} /></div>
      <div className="grid gap-3 lg:grid-cols-2"><div className={cn(SOFT_PANEL, "p-4 text-sm")}><p className={EYEBROW}>Source integrity</p><div className="mt-2 flex items-center gap-2"><HealthDot state={chapter.source_integrity.published_hash_matches ? "healthy" : "error"} /><p className={cn("font-semibold", chapter.source_integrity.published_hash_matches ? "text-[var(--ds-success)]" : "text-[var(--ds-danger)]")}>{chapter.source_integrity.published_hash_matches ? "Published hash matches source" : "Published hash mismatch"}</p></div><p className={cn("mt-2 break-all", NUM, MUTED)}>source {chapter.source_integrity.source_hash || "—"}</p><p className={cn("mt-1 break-all", NUM, MUTED)}>published {chapter.source_integrity.published_source_hash || "—"}</p></div><div className={cn(SOFT_PANEL, "p-4 text-sm")}><p className={EYEBROW}>Retrieval source range</p><p className={cn("mt-2 leading-6", TEXT)}>{sourceRanges.length ? `Pages ${sourceRanges.join(", ")}` : "No chunk page ranges recorded."}</p><p className={cn("mt-2", MUTED)}>Stored dimensions: {retrieval.stored_embedding_dimensions.join(", ") || "none"}{retrieval.source_page_ranges_truncated ? " · range list truncated" : ""}</p></div></div>
      {chapter.blocking_issues.length ? <div className="rounded-xl border border-[var(--ds-danger)] bg-[var(--ds-danger-soft)] p-4"><p className="font-semibold text-[var(--ds-danger)]">Blocking validation evidence</p><ul className="mt-2 list-disc space-y-1 pl-5">{chapter.blocking_issues.map((issue) => <li key={issue} className="text-sm text-[var(--ds-danger)]">{humanize(issue)}</li>)}</ul></div> : null}
      <section aria-label={`Subtopic evidence for ${chapter.chapter_name}`}><div className="flex flex-wrap items-end justify-between gap-2"><div><p className={EYEBROW}>Progressive evidence</p><h4 className={cn("mt-1 text-lg font-semibold", TEXT)}>Learning units and source references</h4></div><p className={cn("text-sm", MUTED)}>{detail.subtopics.length} of {detail.pagination.total} shown</p></div><div className="mt-3 grid gap-3 lg:grid-cols-2">{detail.subtopics.map((subtopic) => <SubtopicEvidence key={subtopic.id} subtopic={subtopic} />)}</div>{detail.pagination.has_more ? <p className={cn("mt-3 text-sm", MUTED)}>More units exist than this bounded evidence response can display.</p> : null}</section>
    </div>
  );
}

function ChapterEvidence({ chapter, loadChapterEvidence, refreshVersion }: { chapter: AdminContentEvidenceChapter; loadChapterEvidence: (chapterId: number) => Promise<AdminChapterEvidence>; refreshVersion: number }) {
  const [detail, setDetail] = useState<AdminChapterEvidence | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [open, setOpen] = useState(false);
  const detailRef = useRef(false);
  const loadingRef = useRef(false);
  const state: HealthState = chapter.quality.ready && chapter.source_integrity.published_hash_matches ? "healthy" : chapter.quality.blocking_issue_count ? "error" : "warning";
  const load = useCallback(async (force = false) => {
    if ((!force && detailRef.current) || loadingRef.current) return;
    loadingRef.current = true;
    setLoading(true); setError("");
    try {
      setDetail(await loadChapterEvidence(chapter.chapter_id));
      detailRef.current = true;
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Chapter evidence could not load.");
    } finally {
      loadingRef.current = false;
      setLoading(false);
    }
  }, [chapter.chapter_id, loadChapterEvidence]);
  useEffect(() => {
    if (open && detailRef.current) void load(true);
  }, [load, open, refreshVersion]);
  return (
    <details className={cn(PANEL, "group overflow-hidden")} onToggle={(event) => { const nextOpen = event.currentTarget.open; setOpen(nextOpen); if (nextOpen) void load(); }}>
      <summary className="flex min-h-20 cursor-pointer list-none items-center justify-between gap-4 p-5 outline-none hover:bg-[color:var(--agentify-hover-bg)] focus-visible:ring-2 focus-visible:ring-[var(--ds-accent-teal)]"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><HealthDot state={state} /><span className={EYEBROW}>Chapter {chapter.chapter_number ?? "—"} · Class {chapter.class_level}</span></div><h3 className={cn("mt-2 text-lg font-semibold leading-6", TEXT)}>{chapter.chapter_name}</h3><p className={cn("mt-1 text-sm", MUTED)}>{chapter.counts.subtopics} learning units · {chapter.evidence.subtopics_with_verified_source_pages} source-verified · {formatPercent(chapter.quality.coverage_score)} coverage</p></div><div className="flex shrink-0 items-center gap-3"><HealthBadge state={classifyHealth(chapter.status)} label={chapter.status} /><span className={cn("text-2xl transition-transform group-open:rotate-90", MUTED)}>›</span></div></summary>
      <div className="border-t border-[color:var(--agentify-border)] p-5">{loading ? <p className={cn("text-sm", MUTED)}>Loading sanitized chapter evidence…</p> : error ? <div className="rounded-xl border border-[var(--ds-danger)] bg-[var(--ds-danger-soft)] p-4"><p className="text-sm text-[var(--ds-danger)]">{error}</p><button type="button" className="mt-3 min-h-11 rounded-lg border border-[var(--ds-danger)] px-4 text-sm font-semibold text-[var(--ds-danger)]" onClick={() => void load()}>Retry evidence</button></div> : detail ? <ChapterDetail detail={detail} /> : null}</div>
    </details>
  );
}

export function DataIngestionReport({ overview, content, loadChapterEvidence, refreshVersion }: { overview: AdminEvidenceOverview; content: AdminContentEvidence | null; loadChapterEvidence: (chapterId: number) => Promise<AdminChapterEvidence>; refreshVersion: number }) {
  const subjects = useMemo(() => {
    const grouped = new Map<string, AdminContentEvidenceChapter[]>();
    for (const chapter of content?.items || []) grouped.set(chapter.subject || "Unspecified", [...(grouped.get(chapter.subject || "Unspecified") || []), chapter]);
    return [...grouped.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [content]);
  const release = overview.readiness.release;
  const retrieval = overview.readiness.semantic_retrieval;
  if (!content) return <EmptyState icon="book" title="Curriculum evidence unavailable" detail="The sanitized content evidence endpoint did not return. Agent operations remain available; refresh to retry curriculum evidence." />;
  if (!content.pagination.total) return <EmptyState icon="book" title="No curriculum has been ingested" detail="Published subjects, chapters and source references appear after the first quality-gated ingestion." />;
  return (
    <div className="space-y-5">
      <div className="grid gap-3 lg:grid-cols-2"><StatusProof state={evidenceState(release.status)} label="Curriculum release" value={release.status} detail={`${release.published.chapters || 0}/${release.expected.chapters || 0} expected chapters published · provenance ${humanize(release.release.provenance)}${release.release.restored_at ? ` · restored ${formatTime(release.release.restored_at)}` : ""}.`} /><StatusProof state={evidenceState(retrieval.status)} label="Retrieval contract" value={retrieval.status} detail={`${retrieval.configured_model || "No configured model"} · ${retrieval.stored_dimensions || 0} dimensions · ${retrieval.configured_endpoint_host || "no endpoint"}.`} /></div>
      <section className={cn(PANEL, "p-5")} aria-labelledby="measured-evidence-heading"><div><p className={EYEBROW}>Measured validation signals</p><h3 id="measured-evidence-heading" className={cn("mt-1 text-xl font-semibold", TEXT)}>Published curriculum confidence</h3></div><div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4"><Metric label="Source-page proof" value={formatPercentagePoints(overview.content.source_page_coverage_percent)} detail={`${overview.content.subtopics} learning units`} /><Metric label="Embedding coverage" value={formatPercentagePoints(overview.content.embedding_coverage_percent)} detail={`${overview.content.embedded_chunks}/${overview.content.chunks} chunks`} tone={toneForPercent(overview.content.embedding_coverage_percent)} /><Metric label="Chapters ready" value={`${overview.content.chapters_ready}/${overview.content.chapters}`} detail={`${overview.content.published_chapters} published`} /><Metric label="Grounded answers" value={formatPercentagePoints(overview.quality.grounded_rate_percent)} detail={`${overview.quality.grounded_turns}/${overview.quality.retrieval_turns} retrieval turns`} /></div><p className={cn("mt-3 text-xs leading-5", MUTED)}>These are observed source, validation, embedding and grounding signals. They do not make a synthetic factual-accuracy claim.</p></section>
      <section aria-labelledby="subject-inventory-heading"><div className="flex flex-wrap items-end justify-between gap-3"><div><p className={EYEBROW}>Curriculum inventory</p><h3 id="subject-inventory-heading" className={cn("mt-1 text-xl font-semibold", TEXT)}>Subjects and chapters</h3></div><p className={cn("text-sm", MUTED)}>{overview.content.subject_catalogs} subject catalogs · {content.pagination.total} chapters</p></div><div className="mt-5 space-y-7">{subjects.map(([subject, chapters]) => <section key={subject}><div className="mb-3 flex flex-wrap items-center justify-between gap-2 px-1"><h4 className={cn("text-lg font-semibold", TEXT)}>{subject}</h4><span className={cn("text-sm", NUM, MUTED)}>{chapters.length} chapters · {chapters.reduce((sum, chapter) => sum + chapter.counts.subtopics, 0)} units</span></div><div className="space-y-3">{chapters.sort((a, b) => Number(a.chapter_number || 999) - Number(b.chapter_number || 999)).map((chapter) => <ChapterEvidence key={chapter.chapter_id} chapter={chapter} loadChapterEvidence={loadChapterEvidence} refreshVersion={refreshVersion} />)}</div></section>)}</div>{content.pagination.has_more ? <p className={cn("mt-4 text-sm", MUTED)}>Only the first {content.pagination.limit} chapters are shown. Refine the evidence query to inspect additional curricula.</p> : null}</section>
    </div>
  );
}
