"use client";

import { useAuth } from "@/context/AuthContext";
import { findCatalogTopic, reconcileSelection, useCatalog } from "@/lib/catalog";
import type { RevisionEntry } from "@/lib/revision";
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
  fetchPlanningRadar,
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
  readActivePlanningPlan,
  readPlanningDraft,
  readPlanningHistory,
  writeActivePlanningPlan,
  writePlanningDraft,
  writePlanningHistory,
} from "./storage";

type RadarState = "loading" | "ready" | "empty" | "unavailable";

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
  selectedTopic: { label: string; value: string } | undefined;
  scope: PlanningScope;
  activePlan: PlanningPlan | null;
  history: PlanningPlan[];
  radar: RevisionEntry[];
  radarState: RadarState;
  generating: boolean;
  savingCheckpoint: boolean;
  error: string;
  staleNotice: string;
  setScope: (chapter: string, topic: string) => void;
  setChapter: (chapter: string) => void;
  setTopic: (topic: string) => void;
  updateProfile: (key: keyof PlanningProfile, value: PlanningProfile[keyof PlanningProfile]) => void;
  applyRadarTopic: (entry: RevisionEntry) => boolean;
  createPlan: (signal?: AbortSignal) => Promise<PlanningPlan | null>;
  submitCheckpoint: (input: CheckpointInput, signal?: AbortSignal) => Promise<PlanningCheckpointResult | null>;
  loadHistoryPlan: (missionId: string) => PlanningPlan | null;
  clearError: () => void;
};

const PlanningExperienceContext = createContext<PlanningExperienceValue | null>(null);

const DEFAULT_DRAFT: PlanningDraft = {
  chapter: "hydrocarbon",
  topic: "alkanes",
  profile: DEFAULT_PLANNING_PROFILE,
};

export function PlanningExperienceProvider({ children }: { children: ReactNode }) {
  const { userId, loading, claimsLoading, getAuthHeaders } = useAuth();
  const { chapters, source, settled } = useCatalog();
  const authBusy = loading || claimsLoading;
  const [draft, setDraft] = useState<PlanningDraft>(DEFAULT_DRAFT);
  const [activePlan, setActivePlan] = useState<PlanningPlan | null>(null);
  const [history, setHistory] = useState<PlanningPlan[]>([]);
  const [radar, setRadar] = useState<RevisionEntry[]>([]);
  const [radarState, setRadarState] = useState<RadarState>("loading");
  const [hydrated, setHydrated] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [savingCheckpoint, setSavingCheckpoint] = useState(false);
  const [error, setError] = useState("");
  const [staleNotice, setStaleNotice] = useState("");
  const loadedUserRef = useRef("");

  const selectedChapter = useMemo(
    () => chapters.find((chapter) => chapter.value === draft.chapter) || chapters[0],
    [chapters, draft.chapter],
  );
  const selectedTopic = useMemo(
    () => selectedChapter?.topics.find((topic) => topic.value === draft.topic) || selectedChapter?.topics[0],
    [draft.topic, selectedChapter],
  );
  const scope = useMemo<PlanningScope>(() => ({
    chapter: selectedChapter?.value || draft.chapter,
    chapterLabel: selectedChapter?.label || draft.chapter.replace(/_/g, " "),
    topic: selectedTopic?.value || draft.topic,
    topicLabel: selectedTopic?.label || draft.topic.replace(/_/g, " "),
    subject: selectedChapter?.subject || "Chemistry",
    classLevel: selectedChapter?.classLevel || "",
  }), [draft.chapter, draft.topic, selectedChapter, selectedTopic]);

  useEffect(() => {
    if (authBusy) return;
    const accountKey = userId || "guest";
    if (loadedUserRef.current === accountKey) return;
    loadedUserRef.current = accountKey;
    setHydrated(false);
    if (userId) {
      const savedDraft = readPlanningDraft(userId);
      const savedPlan = readActivePlanningPlan(userId);
      const savedHistory = readPlanningHistory(userId);
      if (savedDraft?.profile) setDraft(savedDraft);
      setActivePlan(savedPlan);
      setHistory(savedHistory);
    } else {
      setDraft(DEFAULT_DRAFT);
      setActivePlan(null);
      setHistory([]);
    }
    setHydrated(true);
  }, [authBusy, userId]);

  useEffect(() => {
    if (!chapters.length) return;
    setDraft((current) => {
      const next = reconcileSelection(chapters, current.chapter, current.topic);
      if (!next.changed) return current;
      return { ...current, chapter: next.chapter, topic: next.topic };
    });
  }, [chapters]);

  useEffect(() => {
    if (!hydrated || !userId) return;
    writePlanningDraft(userId, draft);
  }, [draft, hydrated, userId]);

  useEffect(() => {
    if (authBusy || !userId) {
      setRadar([]);
      setRadarState("empty");
      return;
    }
    const controller = new AbortController();
    setRadarState("loading");
    void fetchPlanningRadar({ userId, getAuthHeaders }, 4, controller.signal)
      .then((payload) => {
        const next = payload.queue.filter((entry) => entry.bucket !== "fresh").slice(0, 3);
        setRadar(next);
        setRadarState(next.length ? "ready" : "empty");
      })
      .catch((requestError) => {
        if (controller.signal.aborted) return;
        setRadar([]);
        setRadarState("unavailable");
        if (requestError instanceof Error && requestError.name === "AbortError") return;
      });
    return () => controller.abort();
  }, [authBusy, getAuthHeaders, userId]);

  const retireActivePlan = useCallback(() => {
    if (!activePlan) return;
    setActivePlan(null);
    setStaleNotice("The previous plan no longer matches this setup. It remains available in device history.");
    if (userId) clearActivePlanningPlan(userId);
  }, [activePlan, userId]);

  const setScope = useCallback((chapter: string, topic: string) => {
    if (chapter === draft.chapter && topic === draft.topic) return;
    retireActivePlan();
    setDraft((current) => ({ ...current, chapter, topic }));
    setError("");
  }, [draft.chapter, draft.topic, retireActivePlan]);

  const setChapter = useCallback((chapter: string) => {
    const nextTopic = chapters.find((item) => item.value === chapter)?.topics[0]?.value || "";
    setScope(chapter, nextTopic);
  }, [chapters, setScope]);

  const setTopic = useCallback((topic: string) => {
    setScope(draft.chapter, topic);
  }, [draft.chapter, setScope]);

  const updateProfile = useCallback((
    key: keyof PlanningProfile,
    value: PlanningProfile[keyof PlanningProfile],
  ) => {
    if (draft.profile[key] === value) return;
    retireActivePlan();
    setDraft((current) => ({
      ...current,
      profile: { ...current.profile, [key]: value },
    }));
    setError("");
  }, [draft.profile, retireActivePlan]);

  const applyRadarTopic = useCallback((entry: RevisionEntry) => {
    for (const chapter of chapters) {
      const match = findCatalogTopic(chapter, entry.topic);
      if (match) {
        setScope(chapter.value, match.value);
        return true;
      }
    }
    return false;
  }, [chapters, setScope]);

  const createPlan = useCallback(async (signal?: AbortSignal) => {
    if (!userId || authBusy || generating) return null;
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
      if (signal?.aborted) return null;
      setError(planningErrorMessage(requestError));
      return null;
    } finally {
      setGenerating(false);
    }
  }, [authBusy, draft.profile, generating, getAuthHeaders, scope, source, userId]);

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
          topic: activePlan.scope.topic,
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
              topic: question.topic || activePlan.scope.topic,
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
        report: buildPlanningReport(activePlan.mission, correct),
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
    setDraft({ chapter: plan.scope.chapter, topic: plan.scope.topic, profile: { ...plan.profile } });
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
    selectedTopic,
    scope,
    activePlan,
    history,
    radar,
    radarState,
    generating,
    savingCheckpoint,
    error,
    staleNotice,
    setScope,
    setChapter,
    setTopic,
    updateProfile,
    applyRadarTopic,
    createPlan,
    submitCheckpoint,
    loadHistoryPlan,
    clearError: () => setError(""),
  }), [
    activePlan,
    applyRadarTopic,
    authBusy,
    chapters,
    createPlan,
    draft,
    error,
    generating,
    history,
    hydrated,
    loadHistoryPlan,
    radar,
    radarState,
    savingCheckpoint,
    scope,
    selectedChapter,
    selectedTopic,
    setChapter,
    setScope,
    setTopic,
    settled,
    source,
    staleNotice,
    submitCheckpoint,
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
