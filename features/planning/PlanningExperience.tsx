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
  generatePlanningMission,
  planningErrorMessage,
  type PlanningCatalogChapter,
} from "./api";
import { type PlanningDraft, type PlanningPlan, type PlanningScope } from "./contracts";
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
  error: string;
  staleNotice: string;
  setClassLevel: (classLevel: string) => void;
  setSubject: (subject: string) => void;
  setChapter: (chapter: string) => void;
  retryCatalog: () => void;
  createPlan: (signal?: AbortSignal) => Promise<PlanningPlan | null>;
  clearError: () => void;
};

const PlanningExperienceContext = createContext<PlanningExperienceValue | null>(null);

const DEFAULT_DRAFT: PlanningDraft = {
  classLevel: "",
  subject: "",
  chapter: "",
};

export function PlanningExperienceProvider({ children }: { children: ReactNode }) {
  const { userId, loading, claimsLoading, getAuthHeaders, profile } = useAuth();
  const authBusy = loading || claimsLoading;
  const [draft, setDraft] = useState<PlanningDraft>(DEFAULT_DRAFT);
  const [activePlan, setActivePlan] = useState<PlanningPlan | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState("");
  const [staleNotice, setStaleNotice] = useState("");
  const [catalogChapters, setCatalogChapters] = useState<PlanningCatalogChapter[]>([]);
  const [catalogSettled, setCatalogSettled] = useState(false);
  const [catalogNotice, setCatalogNotice] = useState("");
  const [catalogReload, setCatalogReload] = useState(0);
  const loadedUserRef = useRef("");
  const generationRef = useRef(0);
  const generationInFlightRef = useRef(false);
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
    () => chapters.find((chapter) => chapter.value === draft.chapter),
    [chapters, draft.chapter],
  );
  const scope = useMemo<PlanningScope>(() => ({
    chapter: selectedChapter?.value || "",
    chapterLabel: selectedChapter?.label || "",
    subject: selectedChapter?.subject || draft.subject,
    classLevel: selectedChapter?.classLevel || draft.classLevel,
  }), [draft.classLevel, draft.subject, selectedChapter]);
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
      .catch(() => {
        if (controller.signal.aborted) return;
        setCatalogChapters([]);
        setCatalogNotice("Your syllabus could not be loaded. Check your connection and try again.");
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
    setGenerating(false);
    setHydrated(false);
    if (userId) {
      const savedDraft = readPlanningDraft(userId);
      const savedPlanState = readActivePlanningPlanState(userId);
      setDraft(savedDraft ?? DEFAULT_DRAFT);
      setActivePlan(savedPlanState.plan);
      if (savedPlanState.retired) {
        setStaleNotice("An older detailed plan was retired because Planning now uses quick chapter focus briefs.");
        clearActivePlanningPlan(userId);
      } else if (savedPlanState.invalid) {
        setStaleNotice("An older saved plan could not be restored safely. Choose a chapter to create a fresh focus brief.");
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
        && chapter.value === current.chapter
      ));
      if (exact) return current;
      const legacyMatch = current.chapter && !current.classLevel && !current.subject
        ? catalogChapters.find((chapter) => (
            chapter.value === current.chapter
            && (!profile?.classLevel || chapter.classLevel === profile.classLevel)
          )) || catalogChapters.find((chapter) => chapter.value === current.chapter)
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
      const chapter = availableChapters.some((item) => item.value === current.chapter)
        ? current.chapter
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

  const retireActivePlan = useCallback(() => {
    if (!activePlan) return;
    setActivePlan(null);
    setStaleNotice("The previous focus brief was cleared because the chapter selection changed.");
    if (userId) clearActivePlanningPlan(userId);
  }, [activePlan, userId]);

  useEffect(() => {
    if (!catalogSettled || !activePlan) return;
    const planStillMatches = Boolean(
      selectedChapter
      && activePlan.scope.chapter === selectedChapter.value
      && activePlan.scope.subject === selectedChapter.subject
      && activePlan.scope.classLevel === selectedChapter.classLevel,
    );
    if (!planStillMatches) retireActivePlan();
  }, [activePlan, catalogSettled, retireActivePlan, selectedChapter]);

  const changeSetup = useCallback((next: Pick<PlanningDraft, "classLevel" | "subject" | "chapter">) => {
    if (
      next.classLevel === draft.classLevel
      && next.subject === draft.subject
      && next.chapter === draft.chapter
    ) return;
    generationRef.current += 1;
    generationInFlightRef.current = false;
    setGenerating(false);
    retireActivePlan();
    setDraft((current) => ({ ...current, ...next }));
    setError("");
  }, [draft.chapter, draft.classLevel, draft.subject, retireActivePlan]);

  const setClassLevel = useCallback((classLevel: string) => {
    changeSetup({ classLevel, subject: "", chapter: "" });
  }, [changeSetup]);

  const setSubject = useCallback((subject: string) => {
    changeSetup({ classLevel: draft.classLevel, subject, chapter: "" });
  }, [changeSetup, draft.classLevel]);

  const setChapter = useCallback((chapter: string) => {
    changeSetup({ classLevel: draft.classLevel, subject: draft.subject, chapter });
  }, [changeSetup, draft.classLevel, draft.subject]);

  const createPlan = useCallback(async (signal?: AbortSignal) => {
    if (!userId || authBusy || generating || generationInFlightRef.current) return null;
    if (!selectedChapter || !scope.chapter || !scope.subject) {
      setError("Choose your class, subject, and chapter before generating the focus plan.");
      return null;
    }
    const generationId = generationRef.current + 1;
    generationRef.current = generationId;
    generationInFlightRef.current = true;
    const requestInput = currentInputRef.current;
    setGenerating(true);
    setError("");
    try {
      const mission = await generatePlanningMission(
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
        mission,
        scope,
      };
      setActivePlan(plan);
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
  }, [authBusy, generating, getAuthHeaders, scope, selectedChapter, userId]);

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
    activePlan,
    generating,
    error,
    staleNotice,
    setClassLevel,
    setSubject,
    setChapter,
    retryCatalog: () => setCatalogReload((value) => value + 1),
    createPlan,
    clearError: () => setError(""),
  }), [
    activePlan,
    authBusy,
    catalogNotice,
    catalogSettled,
    chapters,
    classOptions,
    createPlan,
    draft,
    error,
    generating,
    hydrated,
    scope,
    selectedChapter,
    setClassLevel,
    setChapter,
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
