"use client";

import type { PlanningPortfolioProgress } from "@/features/planning/contracts";
import { useAuth } from "@/context/AuthContext";
import { readPlanningPortfolioState } from "@/features/planning/storage";
import { useEffect, useState } from "react";
import { fetchLatestLearningSession } from "./evidence";
import LearningJourney from "./LearningJourney";
import { recommendLearningWorkspace, type LearningRecommendation } from "./recommendation";

export default function LearningJourneyPersonalized() {
  const { userId, loading, claimsLoading, getAuthHeaders } = useAuth();
  const [recommendation, setRecommendation] = useState<LearningRecommendation>(() => (
    recommendLearningWorkspace(null)
  ));

  const [progress, setProgress] = useState<PlanningPortfolioProgress>();

  useEffect(() => {
    if (loading || claimsLoading) return;
    const controller = new AbortController();
    const saved = userId ? readPlanningPortfolioState(userId) : { state: null };
    void Promise.resolve().then(() => {
      if (!controller.signal.aborted) {
        setRecommendation(recommendLearningWorkspace(saved.state));
        setProgress(saved.state?.portfolio.aggregate_progress);
      }
    });

    // Reuse authenticated session evidence on every device. A demonstrated
    // assessment gap may override an older self-report, while a valid Planning
    // portfolio remains the source for chapter order and eligible next steps.
    if (userId) {
      void fetchLatestLearningSession({ userId, getAuthHeaders }, controller.signal)
        .then((session) => {
          if (!controller.signal.aborted) {
            setRecommendation(recommendLearningWorkspace(saved.state, session));
          }
        })
        .catch(() => {
          // The four workspaces remain usable when history is unavailable.
        });
    }

    return () => controller.abort();
  }, [claimsLoading, getAuthHeaders, loading, userId]);

  return <LearningJourney recommendation={recommendation} progress={progress} />;
}
