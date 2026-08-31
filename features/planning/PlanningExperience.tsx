"use client";

import { useAuth } from "@/context/AuthContext";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  BUILTIN_PLANNING_CHAPTERS,
  fetchPlanningCatalog,
  generatePlanningPortfolio,
  planningCatalogClassMatches,
  planningCatalogChapterMatches,
  planningCatalogScopeMatches,
  planningErrorMessage,
  PlanningApiError,
  type PlanningCatalogChapter,
} from "./api";
import {
  planningPlanFromPortfolioState,
  type PlanningChapterProficiency,
  type PlanningDraft,
  type PlanningPlan,
  type PlanningPortfolio,
  type PlanningPortfolioState,
  type PlanningScope,
  type PlanningStudyTime,
} from "./contracts";
import {
  clearPlanningPortfolio,
  readPlanningDraft,
  readPlanningPortfolioState,
  writePlanningDraft,
  writePlanningPortfolio,
  writePlanningPortfolioState,
} from "./storage";

type PlanningExperienceValue = {
  authBusy: boolean;
  hydrated: boolean;
  userId: string;
  draft: PlanningDraft;
  classOptions: Array<{ label: string; value: string }>;
  subjectOptions: Array<{ label: string; value: string }>;
  chapters: PlanningCatalogChapter[];
  catalogSettled: boolean;
  catalogNotice: string;
  selectedChapters: PlanningCatalogChapter[];
  scopes: PlanningScope[];
  portfolio: PlanningPortfolio | null;
  activePlan: PlanningPlan | null;
  generating: boolean;
  refreshingPlan: boolean;
  refreshNotice: string;
  error: string;
  staleNotice: string;
  setClassLevel: (classLevel: string) => void;
  setSubject: (subject: string) => void;
  setChapterSelected: (chapter: string, selected: boolean) => void;
  setChapterProficiency: (chapter: string, chapterProficiency: PlanningChapterProficiency) => void;
  setStudyTimeToday: (studyTimeToday: PlanningStudyTime | "") => void;
  selectActiveChapter: (chapterSlug: string) => void;
  retryCatalog: () => void;
  createPortfolio: (signal?: AbortSignal) => Promise<PlanningPortfolio | null>;
  refreshActivePlan: (options?: { force?: boolean }) => Promise<void>;
  clearError: () => void;
};

const PlanningExperienceContext = createContext<PlanningExperienceValue | null>(null);

const DEFAULT_DRAFT: PlanningDraft = {
  classLevel: "",
  subject: "",
  chapterChoices: [],
  studyTimeToday: "",
};

function portfolioMatchesCatalog(
  portfolio: PlanningPortfolio,
  catalog: PlanningCatalogChapter[],
) {
  return portfolio.chapters.every((chapter) => catalog.some((candidate) => (
    planningCatalogScopeMatches(candidate, portfolio.class_level, portfolio.subject)
    && planningCatalogChapterMatches(candidate, chapter.chapter_slug)
  )));
}

export function PlanningExperienceProvider({ children }: { children: ReactNode }) {
  const { userId, loading, claimsLoading, getAuthHeaders, profile } = useAuth();
  const authBusy = loading || claimsLoading;
  const [draft, setDraft] = useState<PlanningDraft>(DEFAULT_DRAFT);
  const [portfolioState, setPortfolioState] = useState<PlanningPortfolioState | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [refreshingPlan, setRefreshingPlan] = useState(false);
  const [refreshNotice, setRefreshNotice] = useState("");
  const [error, setError] = useState("");
  const [staleNotice, setStaleNotice] = useState("");
  const [catalogChapters, setCatalogChapters] = useState<PlanningCatalogChapter[]>([]);
  const [catalogSettled, setCatalogSettled] = useState(false);
  const [catalogLoaded, setCatalogLoaded] = useState(false);
  const [catalogNotice, setCatalogNotice] = useState("");
  const [catalogReload, setCatalogReload] = useState(0);
  const loadedUserRef = useRef("");
  const generationRef = useRef(0);
  const generationInFlightRef = useRef(false);
  const refreshIdRef = useRef(0);
  const refreshInFlightRef = useRef(false);
  const refreshAbortRef = useRef<AbortController | null>(null);
  const lastRefreshAtRef = useRef(0);
  const currentInputRef = useRef("");
  const activeChapterSlugRef = useRef("");

  const classOptions = useMemo(() => Array.from(new Set(catalogChapters.map((chapter) => chapter.classLevel)))
    .map((value) => ({ label: value || "Your class", value }))
    .sort((left, right) => left.label.localeCompare(right.label, undefined, { numeric: true })), [catalogChapters]);
  const subjectOptions = useMemo(() => Array.from(new Set(
    catalogChapters
      .filter((chapter) => planningCatalogScopeMatches(chapter, draft.classLevel, chapter.subject))
      .map((chapter) => chapter.subject),
  )).map((value) => ({ label: value, value }))
    .sort((left, right) => left.label.localeCompare(right.label)), [catalogChapters, draft.classLevel]);
  const chapters = useMemo(() => catalogChapters.filter((chapter) => (
    planningCatalogScopeMatches(chapter, draft.classLevel, draft.subject)
  )).sort((left, right) => (
    (left.order ?? Number.MAX_SAFE_INTEGER) - (right.order ?? Number.MAX_SAFE_INTEGER)
    || left.label.localeCompare(right.label)
  )), [catalogChapters, draft.classLevel, draft.subject]);
  const selectedChapters = useMemo(() => draft.chapterChoices.flatMap((choice) => {
    const chapter = chapters.find((candidate) => planningCatalogChapterMatches(candidate, choice.chapter));
    return chapter ? [chapter] : [];
  }), [chapters, draft.chapterChoices]);
  const scopes = useMemo<PlanningScope[]>(() => draft.chapterChoices.flatMap((choice) => {
    const selected = chapters.find((candidate) => planningCatalogChapterMatches(candidate, choice.chapter));
    if (!selected || !choice.chapterProficiency) return [];
    return [{
      chapter: selected.value,
      chapterLabel: selected.label,
      subject: selected.subject,
      classLevel: selected.classLevel,
      chapterProficiency: choice.chapterProficiency,
      studyTimeToday: draft.studyTimeToday,
    }];
  }), [chapters, draft.chapterChoices, draft.studyTimeToday]);
  const supportCatalog = catalogChapters.length ? catalogChapters : BUILTIN_PLANNING_CHAPTERS;
  const portfolio = useMemo(() => (
    portfolioState && portfolioMatchesCatalog(portfolioState.portfolio, supportCatalog)
      ? portfolioState.portfolio
      : null
  ), [portfolioState, supportCatalog]);
  const activePlan = useMemo(() => (
    portfolioState && portfolio
      ? planningPlanFromPortfolioState(portfolioState)
      : null
  ), [portfolio, portfolioState]);
  currentInputRef.current = JSON.stringify({ userId, scopes });

  useEffect(() => {
    activeChapterSlugRef.current = portfolioState?.activeChapterSlug || "";
  }, [portfolioState?.activeChapterSlug]);

  useEffect(() => {
    if (authBusy) return;
    const controller = new AbortController();
    setCatalogSettled(false);
    setCatalogLoaded(false);
    setCatalogNotice("");

    if (!userId) {
      setCatalogChapters([]);
      setCatalogNotice("Sign in again to load your syllabus chapters.");
      setCatalogSettled(true);
      return () => controller.abort();
    }

    void fetchPlanningCatalog({ userId, getAuthHeaders }, controller.signal)
      .then((catalog) => {
        if (controller.signal.aborted) return;
        setCatalogChapters(catalog.chapters);
        setCatalogLoaded(true);
      })
      .catch((catalogError: unknown) => {
        if (controller.signal.aborted) return;
        setCatalogChapters([]);
        setCatalogNotice(
          catalogError instanceof PlanningApiError && catalogError.message
            ? catalogError.message
            : "Planning chapters could not be loaded. Check your connection and try again.",
        );
      })
      .finally(() => {
        if (!controller.signal.aborted) setCatalogSettled(true);
      });

    return () => controller.abort();
  }, [authBusy, catalogReload, getAuthHeaders, userId]);

  useEffect(() => {
    if (authBusy) return;
    const accountKey = userId || "guest";
    if (loadedUserRef.current === accountKey) return;
    loadedUserRef.current = accountKey;
    generationRef.current += 1;
    generationInFlightRef.current = false;
    refreshIdRef.current += 1;
    refreshInFlightRef.current = false;
    refreshAbortRef.current?.abort();
    refreshAbortRef.current = null;
    lastRefreshAtRef.current = 0;
    setGenerating(false);
    setRefreshingPlan(false);
    setRefreshNotice("");
    setHydrated(false);
    if (userId) {
      const savedDraft = readPlanningDraft(userId);
      const savedPortfolio = readPlanningPortfolioState(userId);
      setDraft(savedDraft ?? DEFAULT_DRAFT);
      setPortfolioState(savedPortfolio.state);
      if (savedPortfolio.retired) {
        setStaleNotice("Your chapter choices are safe. An older plan format was retired so you can build the new roadmap.");
        clearPlanningPortfolio(userId);
      } else if (savedPortfolio.invalid) {
        setStaleNotice("An older saved roadmap could not be restored safely. Choose your chapters to create a fresh roadmap.");
        clearPlanningPortfolio(userId);
      } else {
        setStaleNotice("");
      }
    } else {
      setDraft(DEFAULT_DRAFT);
      setPortfolioState(null);
      setStaleNotice("");
    }
    setHydrated(true);
  }, [authBusy, userId]);

  useEffect(() => {
    if (!catalogLoaded || !catalogChapters.length) return;
    setDraft((current) => {
      const availableClasses = Array.from(new Set(catalogChapters.map((chapter) => chapter.classLevel)));
      const normalizedProfileClass = profile?.classLevel?.trim() || "";
      const currentClass = availableClasses.find((value) => planningCatalogClassMatches(value, current.classLevel));
      const profileClass = availableClasses.find((value) => planningCatalogClassMatches(value, normalizedProfileClass));
      const classLevel = currentClass
        ? currentClass
        : profileClass
          ? profileClass
          : availableClasses.length === 1
            ? availableClasses[0]
            : "";
      const availableSubjects = Array.from(new Set(
        catalogChapters.filter((chapter) => planningCatalogScopeMatches(chapter, classLevel, chapter.subject)).map((chapter) => chapter.subject),
      ));
      const subject = availableSubjects.includes(current.subject)
        ? current.subject
        : availableSubjects.length === 1
          ? availableSubjects[0]
          : "";
      const availableChapters = catalogChapters.filter((chapter) => (
        planningCatalogScopeMatches(chapter, classLevel, subject)
      ));
      const chapterChoices = current.chapterChoices.flatMap((choice) => {
        const matched = availableChapters.find((chapter) => planningCatalogChapterMatches(chapter, choice.chapter))
          || (!current.classLevel && !current.subject
            ? catalogChapters.find((chapter) => planningCatalogChapterMatches(chapter, choice.chapter))
            : undefined);
        if (!matched || !planningCatalogScopeMatches(matched, classLevel, subject)) return [];
        return [{ ...choice, chapter: matched.value }];
      }).filter((choice, index, all) => all.findIndex((item) => item.chapter === choice.chapter) === index);
      if (
        classLevel === current.classLevel
        && subject === current.subject
        && JSON.stringify(chapterChoices) === JSON.stringify(current.chapterChoices)
      ) return current;
      return { ...current, classLevel, subject, chapterChoices };
    });
  }, [catalogChapters, catalogLoaded, profile?.classLevel]);

  useEffect(() => {
    if (!hydrated || !userId) return;
    writePlanningDraft(userId, draft);
  }, [draft, hydrated, userId]);

  const retirePortfolio = useCallback((notice: string) => {
    refreshIdRef.current += 1;
    refreshInFlightRef.current = false;
    refreshAbortRef.current?.abort();
    refreshAbortRef.current = null;
    setRefreshingPlan(false);
    setRefreshNotice("");
    setPortfolioState(null);
    setStaleNotice(notice);
    if (userId) clearPlanningPortfolio(userId);
  }, [userId]);

  useEffect(() => {
    if (!catalogLoaded || !portfolioState || !catalogChapters.length) return;
    if (!portfolioMatchesCatalog(portfolioState.portfolio, catalogChapters)) {
      retirePortfolio("A saved chapter is no longer available in Planning. Choose the chapters you want to keep.");
    }
  }, [catalogChapters, catalogLoaded, portfolioState, retirePortfolio]);

  const changeSetup = useCallback((next: PlanningDraft) => {
    generationRef.current += 1;
    generationInFlightRef.current = false;
    setGenerating(false);
    setDraft(next);
    setError("");
  }, []);

  const setClassLevel = useCallback((classLevel: string) => {
    changeSetup({ ...draft, classLevel, subject: "", chapterChoices: [] });
  }, [changeSetup, draft]);

  const setSubject = useCallback((subject: string) => {
    changeSetup({ ...draft, subject, chapterChoices: [] });
  }, [changeSetup, draft]);

  const setChapterSelected = useCallback((chapter: string, selected: boolean) => {
    const exists = draft.chapterChoices.some((choice) => choice.chapter === chapter);
    if (selected && !exists) {
      if (draft.chapterChoices.length >= 6) {
        setError("Choose up to six chapters at a time so the roadmap stays clear.");
        return;
      }
      changeSetup({ ...draft, chapterChoices: [...draft.chapterChoices, { chapter, chapterProficiency: "" }] });
      return;
    }
    if (!selected && exists) {
      changeSetup({
        ...draft,
        chapterChoices: draft.chapterChoices.filter((choice) => choice.chapter !== chapter),
      });
    }
  }, [changeSetup, draft]);

  const setChapterProficiency = useCallback((chapter: string, chapterProficiency: PlanningChapterProficiency) => {
    changeSetup({
      ...draft,
      chapterChoices: draft.chapterChoices.map((choice) => (
        choice.chapter === chapter
          ? { ...choice, chapterProficiency }
          : choice
      )),
    });
  }, [changeSetup, draft]);

  const setStudyTimeToday = useCallback((studyTimeToday: PlanningStudyTime | "") => {
    changeSetup({ ...draft, studyTimeToday });
  }, [changeSetup, draft]);

  const selectActiveChapter = useCallback((chapterSlug: string) => {
    if (!portfolioState?.portfolio.chapters.some((chapter) => chapter.chapter_slug === chapterSlug)) return;
    activeChapterSlugRef.current = chapterSlug;
    setPortfolioState((current) => {
      if (!current || !current.portfolio.chapters.some((chapter) => chapter.chapter_slug === chapterSlug)) return current;
      const next = { ...current, activeChapterSlug: chapterSlug };
      if (userId) writePlanningPortfolioState(userId, next);
      return next;
    });
  }, [portfolioState, userId]);

  const createPortfolio = useCallback(async (signal?: AbortSignal) => {
    if (!userId || authBusy || generating || generationInFlightRef.current) return null;
    if (!selectedChapters.length || scopes.length !== selectedChapters.length) {
      setError("Choose at least one chapter and tell AgentifyAI how well you know each one.");
      return null;
    }
    const generationId = generationRef.current + 1;
    refreshIdRef.current += 1;
    refreshInFlightRef.current = false;
    refreshAbortRef.current?.abort();
    refreshAbortRef.current = null;
    setRefreshingPlan(false);
    setRefreshNotice("");
    generationRef.current = generationId;
    generationInFlightRef.current = true;
    const requestInput = currentInputRef.current;
    setGenerating(true);
    setError("");
    try {
      const nextPortfolio = await generatePlanningPortfolio(
        { userId, getAuthHeaders },
        scopes,
        signal,
      );
      if (signal?.aborted || generationId !== generationRef.current || requestInput !== currentInputRef.current) return null;
      if (!portfolioMatchesCatalog(nextPortfolio, catalogChapters)) {
        setError("The planner returned a chapter that is not available in Planning yet. Please try again.");
        return null;
      }
      const state = writePlanningPortfolio(userId, nextPortfolio);
      setPortfolioState(state);
      lastRefreshAtRef.current = Date.now();
      setStaleNotice("");
      return nextPortfolio;
    } catch (requestError) {
      if (signal?.aborted || generationId !== generationRef.current || requestInput !== currentInputRef.current) return null;
      setError(planningErrorMessage(requestError));
      return null;
    } finally {
      if (generationId === generationRef.current) {
        generationInFlightRef.current = false;
        setGenerating(false);
      }
    }
  }, [authBusy, catalogChapters, generating, getAuthHeaders, scopes, selectedChapters.length, userId]);

  const refreshActivePlan = useCallback(async (options?: { force?: boolean }) => {
    if (!portfolioState || !userId || authBusy || !catalogLoaded || refreshInFlightRef.current) return;
    if (!portfolioMatchesCatalog(portfolioState.portfolio, catalogChapters)) return;
    if (!options?.force && Date.now() - lastRefreshAtRef.current < 30_000) return;

    const refreshScopes: PlanningScope[] = portfolioState.portfolio.chapters.map((chapter) => ({
      chapter: chapter.chapter_slug,
      chapterLabel: chapter.chapter,
      subject: portfolioState.portfolio.subject,
      classLevel: portfolioState.portfolio.class_level,
      chapterProficiency: chapter.chapter_proficiency,
      studyTimeToday: portfolioState.portfolio.study_time_today ?? "",
      ...(portfolioState.portfolio.session_duration_minutes
        ? { sessionDurationMinutes: portfolioState.portfolio.session_duration_minutes }
        : {}),
    }));
    const refreshId = refreshIdRef.current + 1;
    refreshIdRef.current = refreshId;
    refreshInFlightRef.current = true;
    lastRefreshAtRef.current = Date.now();
    refreshAbortRef.current?.abort();
    const controller = new AbortController();
    refreshAbortRef.current = controller;
    setRefreshingPlan(true);
    setRefreshNotice("");
    try {
      const refreshed = await generatePlanningPortfolio(
        { userId, getAuthHeaders },
        refreshScopes,
        controller.signal,
      );
      if (controller.signal.aborted || refreshId !== refreshIdRef.current) return;
      if (!portfolioMatchesCatalog(refreshed, catalogChapters)) {
        setRefreshNotice("Your saved roadmap is still available, but its latest progress could not be verified. Try again.");
        return;
      }
      const state = writePlanningPortfolio(userId, refreshed, activeChapterSlugRef.current);
      setPortfolioState(state);
      setRefreshNotice("");
    } catch (refreshError) {
      if (controller.signal.aborted || refreshId !== refreshIdRef.current) return;
      setRefreshNotice(`${planningErrorMessage(refreshError)} Your saved roadmap is still available.`);
    } finally {
      if (refreshId === refreshIdRef.current) {
        refreshInFlightRef.current = false;
        refreshAbortRef.current = null;
        setRefreshingPlan(false);
      }
    }
  }, [authBusy, catalogChapters, catalogLoaded, getAuthHeaders, portfolioState, userId]);

  useEffect(() => () => {
    refreshAbortRef.current?.abort();
  }, []);

  const value = useMemo<PlanningExperienceValue>(() => ({
    authBusy,
    hydrated,
    userId,
    draft,
    classOptions,
    subjectOptions,
    chapters,
    catalogSettled,
    catalogNotice,
    selectedChapters,
    scopes,
    portfolio,
    activePlan,
    generating,
    refreshingPlan,
    refreshNotice,
    error,
    staleNotice,
    setClassLevel,
    setSubject,
    setChapterSelected,
    setChapterProficiency,
    setStudyTimeToday,
    selectActiveChapter,
    retryCatalog: () => setCatalogReload((value) => value + 1),
    createPortfolio,
    refreshActivePlan,
    clearError: () => setError(""),
  }), [
    activePlan,
    authBusy,
    catalogNotice,
    catalogSettled,
    chapters,
    classOptions,
    createPortfolio,
    draft,
    error,
    generating,
    hydrated,
    portfolio,
    refreshingPlan,
    refreshNotice,
    refreshActivePlan,
    scopes,
    selectedChapters,
    selectActiveChapter,
    setChapterProficiency,
    setChapterSelected,
    setClassLevel,
    setStudyTimeToday,
    setSubject,
    staleNotice,
    subjectOptions,
    userId,
  ]);

  return (
    <PlanningExperienceContext.Provider value={value}>
      {children}
    </PlanningExperienceContext.Provider>
  );
}

export function usePlanningExperience() {
  const value = useContext(PlanningExperienceContext);
  if (!value) throw new Error("usePlanningExperience must be used inside PlanningExperienceProvider");
  return value;
}
