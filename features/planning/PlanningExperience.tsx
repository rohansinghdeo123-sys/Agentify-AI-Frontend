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
  fetchPlanningCatalog,
  generatePlanningRoadmap,
  isPlanningPlanSupported,
  planningCatalogChapterMatches,
  planningErrorMessage,
  PlanningApiError,
  type PlanningCatalogChapter,
} from "./api";
import {
  type PlanningDraft,
  type PlanningPlan,
  type PlanningScope,
  type PlanningStudyTime,
} from "./contracts";
import {
  clearActivePlanningPlan,
  readActivePlanningPlanState,
  readPlanningDraft,
  writeActivePlanningPlan,
  writePlanningDraft,
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
  selectedChapter: PlanningCatalogChapter | undefined;
  scope: PlanningScope;
  activePlan: PlanningPlan | null;
  generating: boolean;
  refreshingPlan: boolean;
  refreshNotice: string;
  error: string;
  staleNotice: string;
  setClassLevel: (classLevel: string) => void;
  setSubject: (subject: string) => void;
  setChapter: (chapter: string) => void;
  setStudyTimeToday: (studyTimeToday: PlanningStudyTime | "") => void;
  retryCatalog: () => void;
  createPlan: (signal?: AbortSignal) => Promise<PlanningPlan | null>;
  refreshActivePlan: (options?: { force?: boolean }) => Promise<void>;
  clearError: () => void;
};

const PlanningExperienceContext = createContext<PlanningExperienceValue | null>(null);

const DEFAULT_DRAFT: PlanningDraft = {
  classLevel: "",
  subject: "",
  chapter: "",
  studyTimeToday: "",
};

export function PlanningExperienceProvider({ children }: { children: ReactNode }) {
  const { userId, loading, claimsLoading, getAuthHeaders, profile } = useAuth();
  const authBusy = loading || claimsLoading;
  const [draft, setDraft] = useState<PlanningDraft>(DEFAULT_DRAFT);
  const [activePlan, setActivePlan] = useState<PlanningPlan | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [refreshingPlan, setRefreshingPlan] = useState(false);
  const [refreshNotice, setRefreshNotice] = useState("");
  const [error, setError] = useState("");
  const [staleNotice, setStaleNotice] = useState("");
  const [catalogChapters, setCatalogChapters] = useState<PlanningCatalogChapter[]>([]);
  const [catalogSettled, setCatalogSettled] = useState(false);
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

  const classOptions = useMemo(() => Array.from(new Set(catalogChapters.map((chapter) => chapter.classLevel)))
    .map((value) => ({ label: value || "Your class", value }))
    .sort((left, right) => left.label.localeCompare(right.label, undefined, { numeric: true })), [catalogChapters]);
  const subjectOptions = useMemo(() => Array.from(new Set(
    catalogChapters
      .filter((chapter) => chapter.classLevel === draft.classLevel)
      .map((chapter) => chapter.subject),
  )).map((value) => ({ label: value, value }))
    .sort((left, right) => left.label.localeCompare(right.label)), [catalogChapters, draft.classLevel]);
  const chapters = useMemo(() => catalogChapters.filter((chapter) => (
    chapter.classLevel === draft.classLevel && chapter.subject === draft.subject
  )).sort((left, right) => (
    (left.order ?? Number.MAX_SAFE_INTEGER) - (right.order ?? Number.MAX_SAFE_INTEGER)
    || left.label.localeCompare(right.label)
  )), [catalogChapters, draft.classLevel, draft.subject]);
  const selectedChapter = useMemo(
    () => chapters.find((chapter) => planningCatalogChapterMatches(chapter, draft.chapter)),
    [chapters, draft.chapter],
  );
  const scope = useMemo<PlanningScope>(() => ({
    chapter: selectedChapter?.value || "",
    chapterLabel: selectedChapter?.label || "",
    subject: selectedChapter?.subject || draft.subject,
    classLevel: selectedChapter?.classLevel || draft.classLevel,
    studyTimeToday: draft.studyTimeToday,
  }), [draft.classLevel, draft.studyTimeToday, draft.subject, selectedChapter]);
  currentInputRef.current = JSON.stringify({ userId, scope });

  useEffect(() => {
    if (authBusy) return;
    const controller = new AbortController();
    setCatalogSettled(false);
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
      const savedPlanState = readActivePlanningPlanState(userId);
      setDraft(savedDraft ?? DEFAULT_DRAFT);
      setActivePlan(savedPlanState.plan);
      if (savedPlanState.retired) {
        setStaleNotice("Your chapter choice is safe. An older focus brief was retired so you can build the new NCERT-ordered roadmap.");
        clearActivePlanningPlan(userId);
      } else if (savedPlanState.invalid) {
        setStaleNotice("An older saved plan could not be restored safely. Choose a chapter to create a fresh learning roadmap.");
        clearActivePlanningPlan(userId);
      } else {
        setStaleNotice("");
      }
    } else {
      setDraft(DEFAULT_DRAFT);
      setActivePlan(null);
      setStaleNotice("");
    }
    setHydrated(true);
  }, [authBusy, userId]);

  useEffect(() => {
    if (!catalogSettled || !catalogChapters.length) return;
    setDraft((current) => {
      const exact = catalogChapters.find((chapter) => (
        chapter.classLevel === current.classLevel
        && chapter.subject === current.subject
        && planningCatalogChapterMatches(chapter, current.chapter)
      ));
      if (exact) {
        return exact.value === current.chapter ? current : { ...current, chapter: exact.value };
      }
      const legacyMatch = current.chapter && !current.classLevel && !current.subject
        ? catalogChapters.find((chapter) => (
            planningCatalogChapterMatches(chapter, current.chapter)
            && (!profile?.classLevel || chapter.classLevel === profile.classLevel)
          )) || catalogChapters.find((chapter) => planningCatalogChapterMatches(chapter, current.chapter))
        : undefined;
      if (legacyMatch) {
        return {
          ...current,
          classLevel: legacyMatch.classLevel,
          subject: legacyMatch.subject,
          chapter: legacyMatch.value,
        };
      }
      const availableClasses = Array.from(new Set(catalogChapters.map((chapter) => chapter.classLevel)));
      const normalizedProfileClass = profile?.classLevel?.trim() || "";
      const validCurrentClass = availableClasses.includes(current.classLevel);
      const classLevel = validCurrentClass
        ? current.classLevel
        : availableClasses.includes(normalizedProfileClass)
          ? normalizedProfileClass
          : availableClasses.length === 1
            ? availableClasses[0]
            : "";
      const availableSubjects = Array.from(new Set(
        catalogChapters.filter((chapter) => chapter.classLevel === classLevel).map((chapter) => chapter.subject),
      ));
      const subject = availableSubjects.includes(current.subject)
        ? current.subject
        : availableSubjects.length === 1
          ? availableSubjects[0]
          : "";
      const availableChapters = catalogChapters.filter((chapter) => (
        chapter.classLevel === classLevel && chapter.subject === subject
      ));
      const matchedChapter = availableChapters.find((item) => planningCatalogChapterMatches(item, current.chapter));
      const chapter = matchedChapter
        ? matchedChapter.value
        : availableChapters.length === 1
          ? availableChapters[0].value
          : "";
      if (
        classLevel === current.classLevel
        && subject === current.subject
        && chapter === current.chapter
      ) return current;
      return { ...current, classLevel, subject, chapter };
    });
  }, [catalogChapters, catalogSettled, profile?.classLevel]);

  useEffect(() => {
    if (!hydrated || !userId) return;
    writePlanningDraft(userId, draft);
  }, [draft, hydrated, userId]);

  const retireActivePlan = useCallback((notice = "The previous roadmap was cleared because your planning choices changed.") => {
    if (!activePlan) return;
    refreshIdRef.current += 1;
    refreshInFlightRef.current = false;
    refreshAbortRef.current?.abort();
    refreshAbortRef.current = null;
    setRefreshingPlan(false);
    setRefreshNotice("");
    setActivePlan(null);
    setStaleNotice(notice);
    if (userId) clearActivePlanningPlan(userId);
  }, [activePlan, userId]);

  useEffect(() => {
    if (!catalogSettled || !activePlan) return;
    const planStillMatches = isPlanningPlanSupported(activePlan, catalogChapters);
    if (!planStillMatches) {
      retireActivePlan("That saved roadmap is not available in Planning yet. Choose the supported chapter to continue.");
    }
  }, [activePlan, catalogChapters, catalogSettled, retireActivePlan]);

  const changeSetup = useCallback((next: PlanningDraft) => {
    if (
      next.classLevel === draft.classLevel
      && next.subject === draft.subject
      && next.chapter === draft.chapter
      && next.studyTimeToday === draft.studyTimeToday
    ) return;
    generationRef.current += 1;
    generationInFlightRef.current = false;
    setGenerating(false);
    retireActivePlan();
    setDraft((current) => ({ ...current, ...next }));
    setError("");
  }, [draft.chapter, draft.classLevel, draft.studyTimeToday, draft.subject, retireActivePlan]);

  const setClassLevel = useCallback((classLevel: string) => {
    changeSetup({ ...draft, classLevel, subject: "", chapter: "" });
  }, [changeSetup, draft]);

  const setSubject = useCallback((subject: string) => {
    changeSetup({ ...draft, subject, chapter: "" });
  }, [changeSetup, draft]);

  const setChapter = useCallback((chapter: string) => {
    changeSetup({ ...draft, chapter });
  }, [changeSetup, draft]);

  const setStudyTimeToday = useCallback((studyTimeToday: PlanningStudyTime | "") => {
    changeSetup({ ...draft, studyTimeToday });
  }, [changeSetup, draft]);

  const createPlan = useCallback(async (signal?: AbortSignal) => {
    if (!userId || authBusy || generating || generationInFlightRef.current) return null;
    if (!selectedChapter || !scope.chapter || !scope.subject) {
      setError("Choose your class, subject, and chapter before generating the learning roadmap.");
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
      const roadmap = await generatePlanningRoadmap(
        { userId, getAuthHeaders },
        scope,
        signal,
      );
      if (
        signal?.aborted
        || generationId !== generationRef.current
        || requestInput !== currentInputRef.current
      ) return null;
      const plan: PlanningPlan = {
        roadmap,
        scope,
      };
      if (!isPlanningPlanSupported(plan, catalogChapters)) {
        setError("The planner returned a chapter that is not available in Planning yet. Please try again.");
        return null;
      }
      setActivePlan(plan);
      lastRefreshAtRef.current = Date.now();
      setStaleNotice("");
      writeActivePlanningPlan(userId, plan);
      return plan;
    } catch (requestError) {
      if (
        signal?.aborted
        || generationId !== generationRef.current
        || requestInput !== currentInputRef.current
      ) return null;
      setError(planningErrorMessage(requestError));
      return null;
    } finally {
      if (generationId === generationRef.current) {
        generationInFlightRef.current = false;
        setGenerating(false);
      }
    }
  }, [authBusy, catalogChapters, generating, getAuthHeaders, scope, selectedChapter, userId]);

  const refreshActivePlan = useCallback(async (options?: { force?: boolean }) => {
    if (
      !activePlan
      || !userId
      || authBusy
      || !catalogSettled
      || refreshInFlightRef.current
      || !isPlanningPlanSupported(activePlan, catalogChapters)
    ) return;
    if (!options?.force && Date.now() - lastRefreshAtRef.current < 30_000) return;

    const refreshId = refreshIdRef.current + 1;
    refreshIdRef.current = refreshId;
    refreshInFlightRef.current = true;
    lastRefreshAtRef.current = Date.now();
    refreshAbortRef.current?.abort();
    const controller = new AbortController();
    refreshAbortRef.current = controller;
    const savedScope = activePlan.scope;
    setRefreshingPlan(true);
    setRefreshNotice("");
    try {
      const roadmap = await generatePlanningRoadmap(
        { userId, getAuthHeaders },
        savedScope,
        controller.signal,
      );
      const refreshedPlan: PlanningPlan = { roadmap, scope: savedScope };
      if (
        controller.signal.aborted
        || refreshId !== refreshIdRef.current
      ) return;
      if (!isPlanningPlanSupported(refreshedPlan, catalogChapters)) {
        setRefreshNotice("Your saved roadmap is still available, but its latest progress could not be verified. Try again.");
        return;
      }
      setActivePlan(refreshedPlan);
      writeActivePlanningPlan(userId, refreshedPlan);
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
  }, [activePlan, authBusy, catalogChapters, catalogSettled, getAuthHeaders, userId]);

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
    selectedChapter,
    scope,
    activePlan: activePlan && catalogSettled && isPlanningPlanSupported(activePlan, catalogChapters)
      ? activePlan
      : null,
    generating,
    refreshingPlan,
    refreshNotice,
    error,
    staleNotice,
    setClassLevel,
    setSubject,
    setChapter,
    setStudyTimeToday,
    retryCatalog: () => setCatalogReload((value) => value + 1),
    createPlan,
    refreshActivePlan,
    clearError: () => setError(""),
  }), [
    activePlan,
    authBusy,
    catalogChapters,
    catalogNotice,
    catalogSettled,
    chapters,
    classOptions,
    createPlan,
    draft,
    error,
    generating,
    hydrated,
    refreshingPlan,
    refreshNotice,
    refreshActivePlan,
    scope,
    selectedChapter,
    setClassLevel,
    setChapter,
    setSubject,
    setStudyTimeToday,
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
