"use client";

import { useAuth } from "@/context/AuthContext";
import { useCatalog } from "@/lib/catalog";
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
  generatePlanningMission,
  planningErrorMessage,
  submitPlanningCheckpoint,
} from "./api";
import {
  buildPlanningReport,
  calculatePlanningFocusScore,
  confidenceToScore,
  DEFAULT_PLANNING_PROFILE,
  getMissionQuestion,
  type PlanningCheckpointResult,
  type PlanningDraft,
  type PlanningPlan,
  type PlanningProfile,
  type PlanningScope,
} from "./contracts";
import {
  clearActivePlanningPlan,
  mergePlanningHistory,
  readActivePlanningPlanState,
  readPlanningDraft,
  readPlanningHistory,
  writeActivePlanningPlan,
  writePlanningDraft,
  writePlanningHistory,
} from "./storage";

type CheckpointInput = {
  answer: string;
  confidence: string;
  hintCount: number;
  retryCount: number;
  startedAt: string;
  firstAnswerAt: string | null;
};

type PlanningExperienceValue = {
  authBusy: boolean;
  hydrated: boolean;
  userId: string;
  draft: PlanningDraft;
  chapters: ReturnType<typeof useCatalog>["chapters"];
  catalogSource: "published" | "starter";
  catalogSettled: boolean;
  selectedChapter: ReturnType<typeof useCatalog>["chapters"][number] | undefined;
  scope: PlanningScope;
  activePlan: PlanningPlan | null;
  history: PlanningPlan[];
  generating: boolean;
  savingCheckpoint: boolean;
  error: string;
  staleNotice: string;
  setChapter: (chapter: string) => void;
  updateProfile: (key: keyof PlanningProfile, value: PlanningProfile[keyof PlanningProfile]) => void;
  togglePlanStep: (index: number) => void;
  createPlan: (signal?: AbortSignal) => Promise<PlanningPlan | null>;
  submitCheckpoint: (input: CheckpointInput, signal?: AbortSignal) => Promise<PlanningCheckpointResult | null>;
  loadHistoryPlan: (missionId: string) => PlanningPlan | null;
  clearError: () => void;
};

const PlanningExperienceContext = createContext<PlanningExperienceValue | null>(null);

const DEFAULT_DRAFT: PlanningDraft = {
  chapter: "hydrocarbon",
  profile: DEFAULT_PLANNING_PROFILE,
};

export function PlanningExperienceProvider({ children }: { children: ReactNode }) {
  const { userId, loading, claimsLoading, getAuthHeaders } = useAuth();
  const { chapters, source, settled } = useCatalog();
  const authBusy = loading || claimsLoading;
  const [draft, setDraft] = useState<PlanningDraft>(DEFAULT_DRAFT);
  const [activePlan, setActivePlan] = useState<PlanningPlan | null>(null);
  const [history, setHistory] = useState<PlanningPlan[]>([]);
  const [hydrated, setHydrated] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [savingCheckpoint, setSavingCheckpoint] = useState(false);
  const [error, setError] = useState("");
  const [staleNotice, setStaleNotice] = useState("");
  const loadedUserRef = useRef("");
  const generationRef = useRef(0);
  const generationInFlightRef = useRef(false);
  const currentInputRef = useRef("");

  const selectedChapter = useMemo(
    () => chapters.find((chapter) => chapter.value === draft.chapter) || chapters[0],
    [chapters, draft.chapter],
  );
  const scope = useMemo<PlanningScope>(() => ({
    chapter: selectedChapter?.value || draft.chapter,
    chapterLabel: selectedChapter?.label || draft.chapter.replace(/_/g, " "),
    subject: selectedChapter?.subject || "Chemistry",
    classLevel: selectedChapter?.classLevel || "",
  }), [draft.chapter, selectedChapter]);
  currentInputRef.current = JSON.stringify({ userId, scope, profile: draft.profile, source });

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
      const savedHistory = readPlanningHistory(userId);
      setDraft(savedDraft ?? DEFAULT_DRAFT);
      setActivePlan(savedPlanState.plan);
      setHistory(savedHistory);
      if (savedPlanState.retired) {
        setStaleNotice("An older topic-based plan was retired because Planning is now chapter-based. Choose a chapter to build a fresh roadmap.");
        clearActivePlanningPlan(userId);
      } else if (savedPlanState.invalid) {
        setStaleNotice("A saved plan could not be restored safely. Choose a chapter to build a fresh roadmap.");
        clearActivePlanningPlan(userId);
      } else {
        setStaleNotice("");
      }
    } else {
      setDraft(DEFAULT_DRAFT);
      setActivePlan(null);
      setHistory([]);
      setStaleNotice("");
    }
    setHydrated(true);
  }, [authBusy, userId]);

  useEffect(() => {
    if (!chapters.length) return;
    setDraft((current) => {
      if (chapters.some((chapter) => chapter.value === current.chapter)) return current;
      return { ...current, chapter: chapters[0].value };
    });
  }, [chapters]);

  useEffect(() => {
    if (!hydrated || !userId) return;
    writePlanningDraft(userId, draft);
  }, [draft, hydrated, userId]);

  const retireActivePlan = useCallback(() => {
    if (!activePlan) return;
    setActivePlan(null);
    setStaleNotice("The previous plan no longer matches this setup. It remains available in device history.");
    if (userId) clearActivePlanningPlan(userId);
  }, [activePlan, userId]);

  const setChapter = useCallback((chapter: string) => {
    if (chapter === draft.chapter) return;
    generationRef.current += 1;
    generationInFlightRef.current = false;
    setGenerating(false);
    retireActivePlan();
    setDraft((current) => ({ ...current, chapter }));
    setError("");
  }, [draft.chapter, retireActivePlan]);

  const updateProfile = useCallback((
    key: keyof PlanningProfile,
    value: PlanningProfile[keyof PlanningProfile],
  ) => {
    if (draft.profile[key] === value) return;
    generationRef.current += 1;
    generationInFlightRef.current = false;
    setGenerating(false);
    retireActivePlan();
    setDraft((current) => ({
      ...current,
      profile: { ...current.profile, [key]: value },
    }));
    setError("");
  }, [draft.profile, retireActivePlan]);

  const createPlan = useCallback(async (signal?: AbortSignal) => {
    if (!userId || authBusy || generating || generationInFlightRef.current) return null;
    const generationId = generationRef.current + 1;
    generationRef.current = generationId;
    generationInFlightRef.current = true;
    const requestInput = currentInputRef.current;
    setGenerating(true);
    setError("");
    const startedAt = Date.now();
    try {
      const mission = await generatePlanningMission(
        { userId, getAuthHeaders },
        scope,
        draft.profile,
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
        profile: { ...draft.profile },
        catalogSource: source === "published" ? "published" : "starter",
        createdAt: new Date().toISOString(),
        responseLatencyMs: Date.now() - startedAt,
      };
      setActivePlan(plan);
      setStaleNotice("");
      setHistory((current) => {
        const next = mergePlanningHistory(current, plan);
        writePlanningHistory(userId, next);
        return next;
      });
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
  }, [authBusy, draft.profile, generating, getAuthHeaders, scope, source, userId]);

  const togglePlanStep = useCallback((index: number) => {
    if (!activePlan || !userId || !Number.isInteger(index) || index < 0) return;
    const completed = new Set(activePlan.completedStepIndexes || []);
    if (completed.has(index)) completed.delete(index);
    else completed.add(index);
    const nextPlan: PlanningPlan = {
      ...activePlan,
      completedStepIndexes: Array.from(completed).sort((left, right) => left - right),
    };
    setActivePlan(nextPlan);
    writeActivePlanningPlan(userId, nextPlan);
    setHistory((current) => {
      const next = mergePlanningHistory(current, nextPlan);
      writePlanningHistory(userId, next);
      return next;
    });
  }, [activePlan, userId]);

  const submitCheckpoint = useCallback(async (input: CheckpointInput, signal?: AbortSignal) => {
    if (!userId || !activePlan || savingCheckpoint || activePlan.checkpoint) return activePlan?.checkpoint || null;
    const question = getMissionQuestion(activePlan.mission);
    if (!question || !input.answer) return null;
    setSavingCheckpoint(true);
    setError("");
    const completedAt = new Date();
    const startedAtMs = new Date(input.startedAt).getTime();
    const durationSeconds = Number.isFinite(startedAtMs)
      ? Math.max(1, Math.round((completedAt.getTime() - startedAtMs) / 1000))
      : 1;
    const correct = input.answer === question.correct;
    const confidenceBefore = confidenceToScore(activePlan.profile.prerequisiteConfidence);
    const confidenceAfter = confidenceToScore(input.confidence);
    const focusScore = calculatePlanningFocusScore({
      correct,
      durationSeconds,
      hintCount: input.hintCount,
      retryCount: input.retryCount,
      confidenceAfter,
    });
    const attemptId = `planning-${userId}-${activePlan.mission.mission_id}`;

    try {
      await submitPlanningCheckpoint(
        { userId, getAuthHeaders },
        {
          chapter: activePlan.scope.chapter,
          subject: activePlan.scope.subject,
          correct,
          durationSeconds,
          focusScore,
          startedAt: input.startedAt,
          completedAt: completedAt.toISOString(),
          responseLatencyMs: activePlan.responseLatencyMs || 0,
          hintCount: input.hintCount,
          retryCount: input.retryCount,
          confidenceBefore,
          confidenceAfter,
          replayData: {
            attempt_id: attemptId,
            plan_id: activePlan.mission.mission_id,
            source: "planning_checkpoint",
            scope: activePlan.scope,
            telemetry: {
              started_at: input.startedAt,
              first_answer_at: input.firstAnswerAt,
              completed_at: completedAt.toISOString(),
              duration_seconds: durationSeconds,
              hint_count: input.hintCount,
              retry_count: input.retryCount,
              confidence_before: confidenceBefore,
              confidence_after: confidenceAfter,
              focus_score: focusScore,
            },
            questions: [{
              id: question.id,
              text: question.question,
              topic: question.topic || activePlan.scope.chapter,
              subtopic: question.subtopic || "",
              options: question.options,
              correct_answer: question.correct,
              user_answer: input.answer,
              is_correct: correct,
              ai_explanation: question.explanation || "",
            }],
          },
        },
        signal,
      );

      const checkpoint: PlanningCheckpointResult = {
        answer: input.answer,
        confidence: input.confidence,
        correct,
        focusScore,
        savedAt: completedAt.toISOString(),
        report: buildPlanningReport(activePlan.mission, correct, activePlan.scope.chapterLabel),
      };
      const nextPlan = { ...activePlan, checkpoint };
      setActivePlan(nextPlan);
      writeActivePlanningPlan(userId, nextPlan);
      setHistory((current) => {
        const next = mergePlanningHistory(current, nextPlan);
        writePlanningHistory(userId, next);
        return next;
      });
      return checkpoint;
    } catch (requestError) {
      if (signal?.aborted) return null;
      setError(planningErrorMessage(requestError));
      return null;
    } finally {
      setSavingCheckpoint(false);
    }
  }, [activePlan, getAuthHeaders, savingCheckpoint, userId]);

  const loadHistoryPlan = useCallback((missionId: string) => {
    const plan = history.find((entry) => entry.mission.mission_id === missionId) || null;
    if (!plan) return null;
    setActivePlan(plan);
    setDraft({ chapter: plan.scope.chapter, profile: { ...plan.profile } });
    setStaleNotice("");
    if (userId) writeActivePlanningPlan(userId, plan);
    return plan;
  }, [history, userId]);

  const value = useMemo<PlanningExperienceValue>(() => ({
    authBusy,
    hydrated,
    userId,
    draft,
    chapters,
    catalogSource: source === "published" ? "published" : "starter",
    catalogSettled: settled,
    selectedChapter,
    scope,
    activePlan,
    history,
    generating,
    savingCheckpoint,
    error,
    staleNotice,
    setChapter,
    updateProfile,
    togglePlanStep,
    createPlan,
    submitCheckpoint,
    loadHistoryPlan,
    clearError: () => setError(""),
  }), [
    activePlan,
    authBusy,
    chapters,
    createPlan,
    draft,
    error,
    generating,
    history,
    hydrated,
    loadHistoryPlan,
    savingCheckpoint,
    scope,
    selectedChapter,
    setChapter,
    settled,
    source,
    staleNotice,
    submitCheckpoint,
    togglePlanStep,
    updateProfile,
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
