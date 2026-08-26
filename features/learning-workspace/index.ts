export { default as LearningJourney } from "@/features/learning-workspace/LearningJourneyPersonalized";
export { default as RecentWork } from "@/features/learning-workspace/RecentWork";
export {
  LEARNING_WORKSPACE_STEPS,
  getContinueDestination,
  getRecommendedMode,
  getSessionDestination,
} from "@/features/learning-workspace/config";
export { recommendLearningWorkspace } from "@/features/learning-workspace/recommendation";
export type { LearningRecommendation } from "@/features/learning-workspace/recommendation";
export {
  fetchLatestLearningSession,
  latestLearningSessionFromPayload,
  normalizeLearningSession,
} from "@/features/learning-workspace/evidence";
export type {
  LearningModeId,
  ProgressSummary,
  SessionRecord,
} from "@/features/learning-workspace/types";
