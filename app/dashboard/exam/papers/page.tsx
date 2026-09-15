"use client";

import { AppIcon } from "@/components/ui/Polished";
import { ExamScreen, ExamStatusMessage } from "@/components/exam/ExamScreen";
import { useAuth } from "@/context/AuthContext";
import { examApiUpload, examApiRequest } from "@/features/exam/api";
import type { PaperOut, PaperUploadResponse } from "@/features/exam/contracts";
import {
  planningExamCatalogChapter,
  planningExamQuery,
  readPlanningExamScope,
} from "@/features/exam/mcq/planningScope";
import {
  formatExamDate,
  formatExamFileSize,
  formatExamLabel,
  paperStatusCopy,
} from "@/features/exam/papersFormat";
import { BUILTIN_CHAPTERS, findChapterForTopic, useCatalog } from "@/lib/catalog";
import { DEFAULT_CLASS_LEVEL, EXAM_TYPES, SUBJECT } from "@/lib/examConfig";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
} from "react";
import styles from "./papers.module.css";

type LibraryFilter = "all" | "ready" | "attention";

function normalizeTopic(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}

function isReadyPaper(paper: PaperOut) {
  return paper.parse_status === "analyzed";
}

export default function QuestionPaperLabPage() {
  const { profile, userId, loading, getAuthHeaders } = useAuth();
  const { chapters } = useCatalog();
  const searchParams = useSearchParams();
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);

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
  const selectedTopic =
    selectedChapter?.topics.find((item) => item.value === requestedTopic) || selectedChapter?.topics[0];
  const classLevel = planningScope?.classLevel || profile?.classLevel || DEFAULT_CLASS_LEVEL;
  const activeSubject = planningScope?.subject || SUBJECT;

  const [papers, setPapers] = useState<PaperOut[]>([]);
  const [paperFile, setPaperFile] = useState<File | null>(null);
  const [paperTitle, setPaperTitle] = useState("");
  const [examType, setExamType] = useState("unit_test");
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<LibraryFilter>("all");
  const [fetching, setFetching] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const scopeQuery = useMemo(() => {
    if (planningScope) return planningExamQuery(planningScope);
    const params = new URLSearchParams();
    if (selectedChapter?.value) params.set("chapter", selectedChapter.value);
    if (selectedTopic?.value) params.set("topic", selectedTopic.value);
    return params.toString();
  }, [planningScope, selectedChapter?.value, selectedTopic?.value]);

  const updateScope = (chapterValue: string, topicValue?: string) => {
    if (planningScope) return;
    const chapter = scopeChapters.find((item) => item.value === chapterValue) || scopeChapters[0];
    const topic = chapter?.topics.find((item) => item.value === topicValue) || chapter?.topics[0];
    const params = new URLSearchParams(searchParams.toString());
    if (chapter?.value) params.set("chapter", chapter.value);
    if (topic?.value) params.set("topic", topic.value);
    router.replace(`/dashboard/exam/papers?${params.toString()}`, { scroll: false });
  };

  const loadPapers = useCallback(async () => {
    if (!userId) return;
    setFetching(true);
    setError("");
    try {
      const params = new URLSearchParams({ subject: activeSubject, limit: "100", offset: "0" });
      const data = await examApiRequest<{ total: number; papers: PaperOut[] }>(
        `/exam/papers?${params.toString()}`,
        {
          getAuthHeaders,
          timeoutMs: 18000,
          cacheKey: `exam-papers:${userId}:${activeSubject}`,
          cacheTtlMs: 30000,
          forceFresh: true,
        },
      );
      setPapers(Array.isArray(data.papers) ? data.papers : []);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Could not load your paper library.");
    } finally {
      setFetching(false);
    }
  }, [activeSubject, getAuthHeaders, userId]);

  useEffect(() => {
    if (loading || !userId) return;
    void loadPapers();
  }, [loadPapers, loading, userId]);

  useEffect(() => {
    if (!paperFile) return;
    const guard = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    const guardClientNavigation = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const target = event.target instanceof Element ? event.target.closest("a[href]") : null;
      if (!target || target.getAttribute("target") === "_blank") return;
      if (window.confirm("Leave this page? Your selected paper has not been uploaded.")) return;
      event.preventDefault();
      event.stopPropagation();
    };
    window.addEventListener("beforeunload", guard);
    document.addEventListener("click", guardClientNavigation, true);
    return () => {
      window.removeEventListener("beforeunload", guard);
      document.removeEventListener("click", guardClientNavigation, true);
    };
  }, [paperFile]);

  const visiblePapers = useMemo(() => {
    const query = search.trim().toLowerCase();
    return papers.filter((paper) => {
      const matchesFilter =
        filter === "all" || (filter === "ready" ? isReadyPaper(paper) : !isReadyPaper(paper));
      const matchesSearch =
        !query ||
        `${paper.paper_title} ${paper.file_name} ${paper.exam_type}`.toLowerCase().includes(query);
      return matchesFilter && matchesSearch;
    });
  }, [filter, papers, search]);

  const onFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] || null;
    setError("");
    setNotice("");
    if (file && file.size > 8 * 1024 * 1024) {
      setPaperFile(null);
      event.target.value = "";
      setError("Choose a file smaller than 8 MB.");
      return;
    }
    setPaperFile(file);
  };

  const uploadPaper = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!paperFile || !selectedChapter || !userId || uploading) return;
    setUploading(true);
    setError("");
    setNotice("");
    try {
      const form = new FormData();
      form.append("file", paperFile);
      form.append("class_level", classLevel);
      form.append("subject", activeSubject);
      form.append("chapter_name", selectedChapter.label);
      form.append("exam_type", examType);
      if (paperTitle.trim()) form.append("paper_title", paperTitle.trim());

      const data = await examApiUpload<PaperUploadResponse>("/exam/papers/upload", form, {
        getAuthHeaders,
        timeoutMs: 60000,
        retries: 0,
        invalidate: ["exam-papers", "exam-pattern", "exam-probable"],
      });
      setPaperFile(null);
      setPaperTitle("");
      if (fileInputRef.current) fileInputRef.current.value = "";
      await loadPapers();
      const params = scopeQuery ? `?${scopeQuery}` : "";
      router.push(`/dashboard/exam/papers/${data.paper.id}${params}`);
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : "Paper upload failed.");
    } finally {
      setUploading(false);
    }
  };

  const readyCount = papers.filter(isReadyPaper).length;

  return (
    <ExamScreen
      eyebrow="Question paper lab"
      title="Turn past papers into usable exam intelligence."
      description="Upload and organize papers here. Open any paper for extracted questions, analysis, and pattern actions."
      backHref={`/dashboard/exam${scopeQuery ? `?${scopeQuery}` : ""}`}
      backLabel="Exam mode"
      actions={
        <Link href={`/dashboard/exam/probable${scopeQuery ? `?${scopeQuery}` : ""}`} className={styles.headerLink}>
          Probable questions <AppIcon name="arrowRight" />
        </Link>
      }
    >
      <div className={styles.pageGrid}>
        <aside className={styles.uploadRail} aria-label="Upload a question paper">
          <div className={styles.railHeading}>
            <span className={styles.stepBadge}>01</span>
            <div>
              <p>New source</p>
              <h2>Upload a paper</h2>
            </div>
          </div>

          <form className={styles.uploadForm} onSubmit={uploadPaper} aria-busy={uploading}>
            <label className={styles.scopeField}>
              <span>Chapter</span>
              <select
                value={selectedChapter?.value || ""}
                onChange={(event) => updateScope(event.target.value)}
                disabled={uploading || !scopeChapters.length || Boolean(planningScope)}
              >
                {scopeChapters.map((chapter) => (
                  <option key={chapter.value} value={chapter.value}>{chapter.label}</option>
                ))}
              </select>
            </label>

            <label className={styles.scopeField}>
              <span>Topic</span>
              <select
                value={selectedTopic?.value || ""}
                onChange={(event) => updateScope(selectedChapter?.value || "", event.target.value)}
                disabled={uploading || !selectedChapter?.topics.length || Boolean(planningScope)}
              >
                {(selectedChapter?.topics || []).map((topic) => (
                  <option key={topic.value} value={topic.value}>{topic.label}</option>
                ))}
              </select>
            </label>

            <label className={styles.fileDrop} data-selected={paperFile ? "true" : "false"}>
              <input
                ref={fileInputRef}
                type="file"
                disabled={uploading}
                accept=".pdf,.txt,.png,.jpg,.jpeg"
                onChange={onFileChange}
              />
              <span className={styles.fileIcon}><AppIcon name={paperFile ? "check" : "download"} /></span>
              <strong>{paperFile ? paperFile.name : "Choose a paper"}</strong>
              <small>{paperFile ? formatExamFileSize(paperFile.size) : "PDF, TXT, PNG or JPG · 8 MB max"}</small>
            </label>

            <label className={styles.field}>
              <span>Paper title <small>Optional</small></span>
              <input
                value={paperTitle}
                disabled={uploading}
                onChange={(event) => setPaperTitle(event.target.value)}
                placeholder="e.g. Mid-term 2025"
                maxLength={120}
              />
            </label>

            <label className={styles.field}>
              <span>Exam type</span>
              <select value={examType} disabled={uploading} onChange={(event) => setExamType(event.target.value)}>
                {EXAM_TYPES.map((item) => (
                  <option key={item.value} value={item.value}>{item.label}</option>
                ))}
              </select>
            </label>

            <button className={styles.primaryButton} type="submit" disabled={!paperFile || uploading || !userId}>
              {uploading ? "Reading your paper…" : "Upload and analyze"}
              {!uploading ? <AppIcon name="arrowRight" /> : null}
            </button>
          </form>

          <div className={styles.privacyNote}>
            <AppIcon name="check" />
            <p><strong>Private to your account.</strong> Scanned image PDFs may need OCR before questions can be extracted.</p>
          </div>
        </aside>

        <section className={styles.library} aria-labelledby="paper-library-heading">
          <div className={styles.libraryHeader}>
            <div>
              <span className={styles.stepBadge}>02</span>
              <p>Your sources</p>
              <h2 id="paper-library-heading">Paper library</h2>
            </div>
            <div className={styles.libraryStats} aria-label="Paper totals">
              <span><strong>{papers.length}</strong> total</span>
              <span><strong>{readyCount}</strong> ready</span>
            </div>
          </div>

          {error ? <ExamStatusMessage tone="error">{error}</ExamStatusMessage> : null}
          {notice ? <ExamStatusMessage tone="success">{notice}</ExamStatusMessage> : null}

          <div className={styles.libraryTools}>
            <label className={styles.searchField}>
              <AppIcon name="search" />
              <span className={styles.srOnly}>Search papers</span>
              <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search papers" />
            </label>
            <div className={styles.filterGroup} aria-label="Filter papers">
              {(["all", "ready", "attention"] as LibraryFilter[]).map((value) => (
                <button key={value} type="button" aria-pressed={filter === value} data-active={filter === value ? "true" : "false"} onClick={() => setFilter(value)}>
                  {value === "attention" ? "Needs attention" : formatExamLabel(value)}
                </button>
              ))}
            </div>
            <button className={styles.iconButton} type="button" onClick={() => void loadPapers()} disabled={fetching} aria-label="Refresh paper library">
              <AppIcon name="history" />
            </button>
          </div>

          <div className={styles.paperList} aria-live="polite" aria-busy={fetching}>
            {fetching && !papers.length ? (
              <div className={styles.loadingBlock}>
                <span />
                <span />
                <span />
              </div>
            ) : visiblePapers.length ? (
              visiblePapers.map((paper) => (
                <Link
                  key={paper.id}
                  href={`/dashboard/exam/papers/${paper.id}${scopeQuery ? `?${scopeQuery}` : ""}`}
                  className={styles.paperRow}
                >
                  <span className={styles.paperGlyph}><AppIcon name="book" /></span>
                  <span className={styles.paperIdentity}>
                    <strong>{paper.paper_title || paper.file_name}</strong>
                    <small>{formatExamLabel(paper.exam_type)} · {formatExamDate(paper.uploaded_at)}</small>
                  </span>
                  <span className={styles.paperMeasure}>
                    <strong>{paper.extracted_question_count}</strong>
                    <small>questions</small>
                  </span>
                  <span className={styles.statusPill} data-status={paper.parse_status}>
                    {paperStatusCopy(paper.parse_status)}
                  </span>
                  <AppIcon name="arrowRight" className={styles.rowArrow} />
                </Link>
              ))
            ) : (
              <div className={styles.emptyLibrary}>
                <span><AppIcon name={papers.length ? "search" : "download"} /></span>
                <h3>{papers.length ? "No papers match this view" : "Your first paper starts here"}</h3>
                <p>{papers.length ? "Try another search or filter." : "Upload a text-based paper to extract questions and reveal its exam pattern."}</p>
              </div>
            )}
          </div>
        </section>
      </div>
    </ExamScreen>
  );
}
