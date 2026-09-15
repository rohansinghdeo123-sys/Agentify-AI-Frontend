"use client";

import { ExamScreen, ExamStatusMessage } from "@/components/exam/ExamScreen";
import { AppIcon } from "@/components/ui/Polished";
import { useAuth } from "@/context/AuthContext";
import { examApiRequest } from "@/features/exam/api";
import {
  planningExamCatalogChapter,
  planningExamQuery,
  readPlanningExamScope,
} from "@/features/exam/mcq/planningScope";
import type {
  LegacyProbableQuestion,
  PaperOut,
  PatternSummary,
  ProbableQuestionSet,
} from "@/features/exam/contracts";
import { formatExamConfidence, formatExamDateTime, formatExamLabel, formatExamMarks } from "@/features/exam/papersFormat";
import {
  fromPatternQuestion,
  fromSyllabusQuestion,
  normalizeSyllabusProbables,
  sortProbableQuestions,
  type ProbableDisplayQuestion,
} from "@/features/exam/probableNormalizers";
import { BUILTIN_CHAPTERS, findChapterForTopic, useCatalog } from "@/lib/catalog";
import {
  DEFAULT_CLASS_LEVEL,
  EXAM_GUARDRAIL,
  GENERATION_MODES,
  MATERIAL_NOT_FOUND_MESSAGE,
  SUBJECT,
  type GenerationMode,
} from "@/lib/examConfig";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import styles from "./probable.module.css";

type ProbableMode = "syllabus" | "paper_pattern";

const DEFAULT_DISCLAIMER =
  "Probable questions are practice guidance based on available learning material and observed paper patterns. They are not a prediction or guarantee of the actual exam paper.";

function normalizeTopic(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}

function sameChapter(left: string | null | undefined, right: string | null | undefined) {
  const normalize = (value: string | null | undefined) => String(value || "").trim().toLowerCase();
  const a = normalize(left);
  const b = normalize(right);
  return Boolean(a && b && a === b);
}

function priorityNumber(priority: ProbableDisplayQuestion["priority"]) {
  return priority === "high" ? "01" : priority === "medium" ? "02" : "03";
}

export default function ProbableQuestionsPage() {
  const { profile, userId, loading, getAuthHeaders } = useAuth();
  const { chapters } = useCatalog();
  const searchParams = useSearchParams();
  const router = useRouter();

  const planningScope = useMemo(() => readPlanningExamScope(searchParams), [searchParams]);
  const planningChapter = useMemo(
    () => planningScope ? planningExamCatalogChapter(planningScope) : null,
    [planningScope],
  );
  const scopeChapters = planningChapter ? [planningChapter] : chapters;
  const requestedTopic = planningScope?.topic || normalizeTopic(searchParams.get("topic") || "alkanes") || "alkanes";
  const requestedChapter =
    planningScope?.chapter || searchParams.get("chapter") || findChapterForTopic(BUILTIN_CHAPTERS, requestedTopic) || "hydrocarbon";
  const selectedChapter = scopeChapters.find((item) => item.value === requestedChapter) || scopeChapters[0];
  const selectedTopic = selectedChapter?.topics.find((item) => item.value === requestedTopic) || selectedChapter?.topics[0];
  const classLevel = planningScope?.classLevel || profile?.classLevel || DEFAULT_CLASS_LEVEL;
  const activeSubject = planningScope?.subject || SUBJECT;
  const mode: ProbableMode = searchParams.get("mode") === "syllabus" ? "syllabus" : "paper_pattern";
  const scopeKey = `${selectedChapter?.value || ""}:${selectedTopic?.value || ""}`;

  const [papers, setPapers] = useState<PaperOut[]>([]);
  const [patternSummary, setPatternSummary] = useState<PatternSummary | null>(null);
  const [savedSets, setSavedSets] = useState<ProbableQuestionSet[]>([]);
  const [patternSet, setPatternSet] = useState<ProbableQuestionSet | null>(null);
  const [syllabusQuestions, setSyllabusQuestions] = useState<LegacyProbableQuestion[]>([]);
  const [syllabusScope, setSyllabusScope] = useState("");
  const [generationMode, setGenerationMode] = useState<GenerationMode>("mixed");
  const [questionCount, setQuestionCount] = useState(8);
  const [difficulty, setDifficulty] = useState("medium");
  const [source, setSource] = useState("");
  const [selectedQuestionId, setSelectedQuestionId] = useState("");
  const [loadingSources, setLoadingSources] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const scopeQuery = useMemo(() => {
    if (planningScope) return planningExamQuery(planningScope);
    const params = new URLSearchParams();
    if (selectedChapter?.value) params.set("chapter", selectedChapter.value);
    if (selectedTopic?.value) params.set("topic", selectedTopic.value);
    return params.toString();
  }, [planningScope, selectedChapter?.value, selectedTopic?.value]);

  const updateQuery = (updates: Record<string, string | null>) => {
    const params = new URLSearchParams(searchParams.toString());
    Object.entries(updates).forEach(([key, value]) => {
      if (value) params.set(key, value);
      else params.delete(key);
    });
    router.replace(`/dashboard/exam/probable?${params.toString()}`, { scroll: false });
  };

  const updateScope = (chapterValue: string, topicValue?: string) => {
    if (planningScope) return;
    const chapter = scopeChapters.find((item) => item.value === chapterValue) || scopeChapters[0];
    const topic = chapter?.topics.find((item) => item.value === topicValue) || chapter?.topics[0];
    setPatternSet(null);
    setSelectedQuestionId("");
    updateQuery({ chapter: chapter?.value || null, topic: topic?.value || null, analysis: null, set: null });
  };

  const loadSources = useCallback(async () => {
    if (!userId) return;
    setLoadingSources(true);
    setError("");
    const paperParams = new URLSearchParams({ subject: activeSubject, limit: "100", offset: "0" });
    const results = await Promise.allSettled([
      examApiRequest<{ total: number; papers: PaperOut[] }>(`/exam/papers?${paperParams.toString()}`, {
        getAuthHeaders,
        timeoutMs: 18000,
        cacheKey: `exam-papers:${userId}:${activeSubject}`,
        cacheTtlMs: 30000,
      }),
      examApiRequest<PatternSummary>("/exam/pattern/summary", {
        getAuthHeaders,
        timeoutMs: 18000,
        cacheKey: `exam-pattern-summary:${userId}`,
        cacheTtlMs: 30000,
      }),
      examApiRequest<{ total: number; sets: ProbableQuestionSet[] }>("/exam/probable-questions?limit=50&offset=0", {
        getAuthHeaders,
        timeoutMs: 18000,
        cacheKey: `exam-probable-sets:${userId}`,
        cacheTtlMs: 30000,
      }),
    ]);

    if (results[0].status === "fulfilled") setPapers(results[0].value.papers || []);
    if (results[1].status === "fulfilled") setPatternSummary(results[1].value);
    if (results[2].status === "fulfilled") setSavedSets(results[2].value.sets || []);
    if (results.every((result) => result.status === "rejected")) {
      const reason = results[0].status === "rejected" ? results[0].reason : null;
      setError(reason instanceof Error ? reason.message : "Could not load paper-pattern sources.");
    }
    setLoadingSources(false);
  }, [activeSubject, getAuthHeaders, userId]);

  useEffect(() => {
    if (loading || !userId) return;
    void loadSources();
  }, [loadSources, loading, userId]);

  const scopedAnalyses = useMemo(
    () => (patternSummary?.analyses || []).filter((analysis) => analysis.subject === activeSubject && sameChapter(analysis.chapter_name, selectedChapter?.label)),
    [activeSubject, patternSummary?.analyses, selectedChapter?.label],
  );
  const scopedPapers = useMemo(
    () => papers.filter((paper) => paper.parse_status === "analyzed" && paper.subject === activeSubject && sameChapter(paper.chapter_name, selectedChapter?.label)),
    [activeSubject, papers, selectedChapter?.label],
  );
  const scopedSets = useMemo(
    () => savedSets.filter((set) => set.subject === activeSubject && sameChapter(set.chapter_name, selectedChapter?.label)),
    [activeSubject, savedSets, selectedChapter?.label],
  );

  useEffect(() => {
    const requestedAnalysis = Number(searchParams.get("analysis"));
    const requestedSet = Number(searchParams.get("set"));
    const matchingSet = Number.isInteger(requestedSet) ? scopedSets.find((set) => set.id === requestedSet) : null;
    setPatternSet(matchingSet || scopedSets[0] || null);

    const availableSources = [
      ...scopedAnalyses.map((analysis) => `analysis:${analysis.id}`),
      ...(scopedPapers.length ? ["papers:all"] : []),
      ...scopedPapers.map((paper) => `paper:${paper.id}`),
    ];
    const requestedSource = Number.isInteger(requestedAnalysis) ? `analysis:${requestedAnalysis}` : "";
    setSource((current) => {
      if (requestedSource && availableSources.includes(requestedSource)) return requestedSource;
      if (availableSources.includes(current)) return current;
      return availableSources[0] || "";
    });
  }, [scopedAnalyses, scopedPapers, scopedSets, searchParams]);

  const activePatternSet = patternSet && sameChapter(patternSet.chapter_name, selectedChapter?.label)
    ? patternSet
    : scopedSets[0] || null;
  const patternQuestions = useMemo(
    () => sortProbableQuestions((activePatternSet?.probable_questions || []).map(fromPatternQuestion).filter((question) => question.question)),
    [activePatternSet],
  );
  const syllabusDisplayQuestions = useMemo(
    () => syllabusScope === scopeKey ? sortProbableQuestions(syllabusQuestions.map(fromSyllabusQuestion)) : [],
    [scopeKey, syllabusQuestions, syllabusScope],
  );
  const visibleQuestions = mode === "paper_pattern" ? patternQuestions : syllabusDisplayQuestions;
  const selectedQuestion = visibleQuestions.find((question) => question.id === selectedQuestionId) || visibleQuestions[0] || null;

  const generateSyllabus = async () => {
    if (!userId || !selectedChapter || !selectedTopic || generating) return;
    setGenerating(true);
    setError("");
    setNotice("");
    try {
      const sessionId = `probable-${userId}-${selectedTopic.value}-${Date.now()}`;
      const payload = await examApiRequest<unknown>("/generate-probable-questions", {
        getAuthHeaders,
        method: "POST",
        retries: 0,
        timeoutMs: 50000,
        body: {
          topic: selectedTopic.label,
          section_id: selectedTopic.value,
          session_id: sessionId,
          difficulty,
          subject: activeSubject,
          chapter: selectedChapter.label,
          class_level: classLevel,
          ...(planningScope ? { catalog_source: planningScope.catalogSource } : {}),
          strict_grounding: true,
          retrieval_required: true,
          fallback_to_general_knowledge: false,
          include_source: true,
          system_guardrail: EXAM_GUARDRAIL,
          required_not_found_response: MATERIAL_NOT_FOUND_MESSAGE,
        },
      });
      const normalized = normalizeSyllabusProbables(payload, `${selectedChapter.label} / ${selectedTopic.label}`);
      if (!normalized.length) throw new Error(MATERIAL_NOT_FOUND_MESSAGE);
      setSyllabusQuestions(normalized);
      setSyllabusScope(scopeKey);
      setSelectedQuestionId(normalized[0]?.id || "");
      setNotice(`${normalized.length} syllabus-grounded practice questions are ready.`);
    } catch (generationError) {
      setError(generationError instanceof Error ? generationError.message : "Could not generate syllabus questions.");
    } finally {
      setGenerating(false);
    }
  };

  const generatePattern = async () => {
    if (!userId || !selectedChapter || !source || generating) return;
    setGenerating(true);
    setError("");
    setNotice("");
    try {
      const [sourceKind, sourceValue] = source.split(":");
      const analysisId = sourceKind === "analysis" ? Number(sourceValue) : undefined;
      const paperIds = sourceKind === "paper"
        ? [Number(sourceValue)]
        : source === "papers:all"
          ? scopedPapers.map((paper) => paper.id)
          : null;
      const result = await examApiRequest<ProbableQuestionSet>("/exam/probable-questions/generate", {
        getAuthHeaders,
        method: "POST",
        retries: 0,
        timeoutMs: 60000,
        invalidate: "exam-probable-sets",
        body: {
          analysis_id: analysisId,
          paper_ids: analysisId ? null : paperIds,
          class_level: classLevel,
          subject: activeSubject,
          chapter_name: selectedChapter.label,
          generation_mode: generationMode,
          count: questionCount,
          use_syllabus_grounding: true,
        },
      });
      setPatternSet(result);
      setSavedSets((current) => [result, ...current.filter((item) => item.id !== result.id)]);
      setSelectedQuestionId(result.probable_questions[0]?.id || "");
      setNotice(`${result.probable_questions.length} paper-pattern practice questions are ready.`);
      updateQuery({ mode: "paper_pattern", set: String(result.id) });
    } catch (generationError) {
      setError(generationError instanceof Error ? generationError.message : "Could not generate paper-pattern questions.");
    } finally {
      setGenerating(false);
    }
  };

  const disclaimer = mode === "paper_pattern" ? activePatternSet?.disclaimer || DEFAULT_DISCLAIMER : DEFAULT_DISCLAIMER;
  const canGeneratePattern = Boolean(source && (scopedAnalyses.length || scopedPapers.length));

  return (
    <ExamScreen
      eyebrow="Probable questions"
      title="Practice what the evidence says matters most."
      description="Choose one source method, generate a focused set, then work through one question at a time."
      backHref={`/dashboard/exam${scopeQuery ? `?${scopeQuery}` : ""}`}
      backLabel="Exam mode"
      actions={<Link href={`/dashboard/exam/papers${scopeQuery ? `?${scopeQuery}` : ""}`} className={styles.headerLink}>Question Paper Lab <AppIcon name="arrowRight" /></Link>}
    >
      <div className={styles.workspace}>
        <aside className={styles.builder} aria-label="Probable question setup" aria-busy={generating}>
          <div className={styles.modeSwitch} aria-label="Question source">
            <button type="button" aria-pressed={mode === "paper_pattern"} data-active={mode === "paper_pattern" ? "true" : "false"} disabled={generating} onClick={() => updateQuery({ mode: "paper_pattern" })}>
              <AppIcon name="analytics" />
              <span><strong>Paper pattern</strong><small>Use uploaded evidence</small></span>
            </button>
            <button type="button" aria-pressed={mode === "syllabus"} data-active={mode === "syllabus" ? "true" : "false"} disabled={generating} onClick={() => updateQuery({ mode: "syllabus" })}>
              <AppIcon name="book" />
              <span><strong>Syllabus</strong><small>Use selected material</small></span>
            </button>
          </div>

          <div className={styles.builderSection}>
            <div className={styles.sectionLabel}>
              <span>01</span>
              <div><p>Learning scope</p><strong>{activeSubject} · {classLevel}</strong></div>
            </div>

            <label className={styles.field}>
              <span>Chapter</span>
              <select value={selectedChapter?.value || ""} onChange={(event) => updateScope(event.target.value)} disabled={generating || !scopeChapters.length || Boolean(planningScope)}>
                {scopeChapters.map((chapter) => <option key={chapter.value} value={chapter.value}>{chapter.label}</option>)}
              </select>
            </label>
            <label className={styles.field}>
              <span>Topic</span>
              <select value={selectedTopic?.value || ""} onChange={(event) => updateScope(selectedChapter?.value || "", event.target.value)} disabled={generating || !selectedChapter?.topics.length || Boolean(planningScope)}>
                {(selectedChapter?.topics || []).map((topic) => <option key={topic.value} value={topic.value}>{topic.label}</option>)}
              </select>
            </label>
          </div>

          <div className={styles.builderSection}>
            <div className={styles.sectionLabel}>
              <span>02</span>
              <div><p>Generation setup</p><strong>{mode === "paper_pattern" ? "Pattern evidence" : "Syllabus grounding"}</strong></div>
            </div>

            {mode === "paper_pattern" ? (
              <>
                {scopedAnalyses.length || scopedPapers.length ? (
                  <label className={styles.field}>
                    <span>Pattern source</span>
                    <select value={source} disabled={generating} onChange={(event) => setSource(event.target.value)}>
                      {scopedAnalyses.map((analysis) => (
                        <option key={`analysis-${analysis.id}`} value={`analysis:${analysis.id}`}>
                          Saved analysis · {analysis.source_paper_ids.length} paper{analysis.source_paper_ids.length === 1 ? "" : "s"} · {formatExamDateTime(analysis.created_at)}
                        </option>
                      ))}
                      {scopedPapers.length ? <option value="papers:all">All {scopedPapers.length} analyzed papers</option> : null}
                      {scopedPapers.map((paper) => <option key={`paper-${paper.id}`} value={`paper:${paper.id}`}>{paper.paper_title || paper.file_name}</option>)}
                    </select>
                  </label>
                ) : (
                  <div className={styles.noSource}>
                    <span><AppIcon name="download" /></span>
                    <div><strong>No analyzed papers for this chapter</strong><p>Upload a readable paper to unlock pattern-based questions.</p></div>
                    <Link href={`/dashboard/exam/papers${scopeQuery ? `?${scopeQuery}` : ""}`}>Open Paper Lab</Link>
                  </div>
                )}
                <label className={styles.field}>
                  <span>Question mix</span>
                  <select value={generationMode} disabled={generating} onChange={(event) => setGenerationMode(event.target.value as GenerationMode)}>
                    {GENERATION_MODES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
                  </select>
                </label>
                <label className={styles.field}>
                  <span>Questions</span>
                  <select value={questionCount} disabled={generating} onChange={(event) => setQuestionCount(Number(event.target.value))}>
                    {[5, 8, 10, 12].map((count) => <option key={count} value={count}>{count} questions</option>)}
                  </select>
                </label>
              </>
            ) : (
              <>
                <label className={styles.field}>
                  <span>Difficulty</span>
                  <select value={difficulty} disabled={generating} onChange={(event) => setDifficulty(event.target.value)}>
                    <option value="easy">Foundation</option>
                    <option value="medium">Standard</option>
                    <option value="hard">Challenge</option>
                  </select>
                </label>
                <div className={styles.groundingNote}><AppIcon name="check" /><span>Only your selected study material will be used.</span></div>
              </>
            )}

            <button
              type="button"
              className={styles.generateButton}
              disabled={generating || !userId || (mode === "paper_pattern" && !canGeneratePattern)}
              onClick={() => void (mode === "paper_pattern" ? generatePattern() : generateSyllabus())}
            >
              <AppIcon name="spark" />
              {generating ? "Building focused questions…" : "Generate questions"}
            </button>
          </div>

          {mode === "paper_pattern" && scopedSets.length ? (
            <label className={`${styles.field} ${styles.savedField}`}>
              <span>Previous sets</span>
              <select
                value={activePatternSet?.id || ""}
                disabled={generating}
                onChange={(event) => {
                  const next = scopedSets.find((set) => set.id === Number(event.target.value)) || null;
                  setPatternSet(next);
                  setSelectedQuestionId("");
                  updateQuery({ set: next ? String(next.id) : null });
                }}
              >
                {scopedSets.map((set) => <option key={set.id} value={set.id}>{formatExamLabel(set.generation_mode)} · {set.probable_questions.length} questions · {formatExamDateTime(set.created_at)}</option>)}
              </select>
            </label>
          ) : null}
        </aside>

        <section className={styles.results} aria-labelledby="probable-results-heading" aria-busy={generating}>
          <div className={styles.resultsHeader}>
            <div>
              <p>{mode === "paper_pattern" ? "Ranked by pattern signal" : "Grounded in syllabus material"}</p>
              <h2 id="probable-results-heading">{visibleQuestions.length ? `${visibleQuestions.length} focused questions` : "Your question set"}</h2>
            </div>
            {activePatternSet && mode === "paper_pattern" ? (
              <div className={styles.confidence}><span>Confidence</span><strong>{formatExamConfidence(activePatternSet.confidence_score)}</strong></div>
            ) : null}
          </div>

          {error ? <ExamStatusMessage tone="error">{error}</ExamStatusMessage> : null}
          {notice ? <ExamStatusMessage tone="success">{notice}</ExamStatusMessage> : null}

          {loadingSources && !papers.length && !patternSummary ? (
            <div className={styles.loadingResult}><span /><span /><span /></div>
          ) : visibleQuestions.length && selectedQuestion ? (
            <div className={styles.resultGrid}>
              <div className={styles.questionList} aria-label="Probable questions">
                {visibleQuestions.map((question, index) => (
                  <button
                    key={question.id}
                    type="button"
                    className={styles.questionItem}
                    data-active={selectedQuestion.id === question.id ? "true" : "false"}
                    data-priority={question.priority}
                    onClick={() => setSelectedQuestionId(question.id)}
                  >
                    <span className={styles.listNumber}>{String(index + 1).padStart(2, "0")}</span>
                    <span className={styles.listCopy}>
                      <strong>{question.question}</strong>
                      <small>{formatExamLabel(question.priority)} priority · {formatExamMarks(question.marks)} marks</small>
                    </span>
                    <AppIcon name="arrowRight" />
                  </button>
                ))}
              </div>

              <article className={styles.questionDetail} data-priority={selectedQuestion.priority}>
                <div className={styles.priorityMark}>
                  <span>{priorityNumber(selectedQuestion.priority)}</span>
                  <div><p>{formatExamLabel(selectedQuestion.priority)} priority</p><strong>{formatExamMarks(selectedQuestion.marks)} marks</strong></div>
                </div>
                <h3>{selectedQuestion.question}</h3>
                <div className={styles.questionMeta}>
                  <span>{formatExamLabel(selectedQuestion.questionType)}</span>
                  {selectedQuestion.topic ? <span>{selectedQuestion.topic}</span> : null}
                </div>
                <div className={styles.reasonCard}>
                  <p>Why this is in your set</p>
                  <strong>{selectedQuestion.rationale}</strong>
                </div>
                <div className={styles.sourceLine}>
                  <AppIcon name="book" />
                  <span><strong>Source trace</strong>{selectedQuestion.source}</span>
                </div>

                {mode === "paper_pattern" && activePatternSet?.priority_topics?.length ? (
                  <div className={styles.priorityTopics}>
                    <p>Priority topics from this run</p>
                    <div>{activePatternSet.priority_topics.slice(0, 5).map((item) => <span key={`${item.topic}-${item.weight}`}>{item.topic}</span>)}</div>
                  </div>
                ) : null}
              </article>
            </div>
          ) : (
            <div className={styles.emptyResults}>
              <span><AppIcon name={mode === "paper_pattern" ? "analytics" : "book"} /></span>
              <h3>{mode === "paper_pattern" ? "Build from real paper evidence" : "Build from your selected material"}</h3>
              <p>{mode === "paper_pattern" ? "Choose a saved analysis or analyzed paper, then generate a prioritized practice set." : "Select a chapter and topic, then generate syllabus-grounded theory questions."}</p>
              {mode === "paper_pattern" && !canGeneratePattern ? <Link href={`/dashboard/exam/papers${scopeQuery ? `?${scopeQuery}` : ""}`}>Upload a question paper <AppIcon name="arrowRight" /></Link> : null}
            </div>
          )}

          <footer className={styles.disclaimer}>
            <span><AppIcon name="check" /></span>
            <div><strong>Practice guidance, not a promise</strong><p>{disclaimer}</p></div>
          </footer>
        </section>
      </div>
    </ExamScreen>
  );
}
