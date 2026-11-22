"use client";

import { AppIcon } from "@/components/ui/Polished";
import type { AtlasRuntime } from "@/features/atlas/scene/createAtlas";
import type { PlanningPortfolioProgress } from "@/features/planning/contracts";
import Link from "next/link";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { LEARNING_WORKSPACE_STEPS } from "./config";
import { recommendLearningWorkspace, type LearningRecommendation } from "./recommendation";
import type { LearningModeId } from "./types";
import styles from "./journey-landing.module.css";

// Positions are relative to the 800 by 720 crop of the source illustration.
const WAYPOINTS = {
  planning: { x: 66, y: 64, action: "Open Planning" },
  study: { x: 51.25, y: 49, action: "Open Study Lab" },
  revision: { x: 58.75, y: 35.5, action: "Start a review" },
  exam: { x: 67.25, y: 26.6, action: "Open Exam" },
} as const;

export default function LearningJourney({
  recommendation = recommendLearningWorkspace(null),
  progress,
  userId,
}: {
  recommendation?: LearningRecommendation;
  progress?: PlanningPortfolioProgress;
  userId?: string | null;
}) {
  const [choice, setChoice] = useState<LearningModeId | null>(null);
  const [atlasReady, setAtlasReady] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [reduced, setReduced] = useState(false);
  const opener = useRef<HTMLButtonElement>(null);
  const surface = useRef<HTMLDivElement>(null);
  const markers = useRef<(HTMLLIElement | null)[]>([]);
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);
  const atlas = useRef<AtlasRuntime | null>(null);
  const selected = useRef<LearningModeId | null>(null);
  const previewHeading = useRef<HTMLHeadingElement>(null);
  const active = LEARNING_WORKSPACE_STEPS.find((step) => step.id === choice);
  const recommended = active?.id === recommendation.mode;
  const mastered = !!progress?.total_units && progress.mastered_units === progress.total_units;

  useEffect(() => {
    if (choice) previewHeading.current?.focus({ preventScroll: true });
  }, [choice]);

  useEffect(() => {
    if (atlasReady) atlas.current?.markMastered(mastered);
  }, [atlasReady, mastered]);

  useEffect(() => {
    let cancelled = false;
    const root = document.documentElement;
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const key = `agentify-atlas-intro:${userId ?? "learner"}`;
    function syncPreferences() {
      const reduce = motion.matches || root.dataset.motion === "reduced";
      setReduced(reduce);
      atlas.current?.preferences(root.dataset.theme === "light", reduce);
      return reduce;
    }
    const preferences = new MutationObserver(syncPreferences);
    preferences.observe(root, { attributes: true, attributeFilter: ["data-theme", "data-motion"] });
    motion.addEventListener("change", syncPreferences);
    void import("@/features/atlas/scene/createAtlas").then(({ createAtlas }) => {
      if (cancelled || !surface.current) return;
      atlas.current = createAtlas(surface.current, markers.current, (available) => {
        setAtlasReady(available);
        if (!available) setPlaying(false);
      }, {
        onIntroChange: setPlaying,
        onSelect(id) {
          const index = LEARNING_WORKSPACE_STEPS.findIndex((step) => step.id === id);
          opener.current = buttons.current[index];
          selected.current = id;
          setChoice(id);
          atlas.current?.focus(id);
        },
      });
      const reduce = syncPreferences();
      setAtlasReady(true);
      if (selected.current) {
        atlas.current.focus(selected.current);
      } else if (!reduce) {
        try {
          if (sessionStorage.getItem(key)) return;
          sessionStorage.setItem(key, "1");
        } catch {
          // Replay stays available when a browser blocks session storage.
        }
        atlas.current.playIntro();
      }
    }).catch(() => {
      if (!cancelled) setAtlasReady(false);
    });
    return () => {
      cancelled = true;
      preferences.disconnect();
      motion.removeEventListener("change", syncPreferences);
      atlas.current?.dispose();
      atlas.current = null;
    };
  }, [userId]);

  const closePreview = () => {
    selected.current = null;
    setChoice(null);
    atlas.current?.focus(null);
    opener.current?.focus({ preventScroll: true });
  };

  return (
    <section className={styles.page} aria-labelledby="learning-journey-title" data-atlas={atlasReady ? "ready" : "fallback"}
      data-intro={playing || undefined} data-selected={choice ?? undefined}
      onKeyDown={(event) => {
        if (event.key === "Escape" && !event.defaultPrevented) {
          if (!choice && !playing) return;
          event.preventDefault();
          if (playing) atlas.current?.finishIntro();
          else closePreview();
        }
      }}>
      <h1 id="learning-journey-title" className={styles.title}>Your Learning <em>Journey</em></h1>
      <div ref={surface} className={styles.surface} aria-hidden="true" />

      <div className={styles.map}>
        <div className={styles.art} aria-hidden="true" />
        <span className={styles.routeSpark} aria-hidden="true" />
        {mastered ? <span className={styles.compassReward} data-mastered="true" aria-hidden="true" /> : null}
        <span className="sr-only" id="journey-recommendation">Suggested next step</span>
        {mastered ? <span className="sr-only" role="status">Plan mastered</span> : null}
        <ol className={styles.waypoints} aria-label="Explore the learning path">
          {LEARNING_WORKSPACE_STEPS.map((step, index) => {
            const point = WAYPOINTS[step.id];
            const suggested = recommendation.mode === step.id;
            const expanded = choice === step.id;
            return (
              <li key={step.id} ref={(node) => { markers.current[index] = node; }}
                className={styles.waypoint} data-mode={step.id} data-recommended={suggested || undefined} data-active={expanded || undefined}
                style={{ "--waypoint-x": `${point.x}%`, "--waypoint-y": `${point.y}%` } as CSSProperties}>
                <button type="button" className={styles.pin} aria-label={`Preview ${step.title}`}
                  ref={(node) => { buttons.current[index] = node; }}
                  aria-expanded={expanded} aria-controls={expanded ? "workspace-preview" : undefined}
                  aria-describedby={suggested ? "journey-recommendation" : undefined}
                  onPointerEnter={() => atlas.current?.highlight(step.id)}
                  onPointerLeave={() => atlas.current?.highlight(null)}
                  onClick={(event) => {
                    if (expanded) {
                      closePreview();
                    } else {
                      opener.current = event.currentTarget;
                      selected.current = step.id;
                      setChoice(step.id);
                      atlas.current?.focus(step.id);
                    }
                  }}>
                  <span className={styles.pinCore}><AppIcon name={step.icon} /></span>
                  <span className={styles.pinLabel} aria-hidden="true">{step.title}</span>
                </button>
              </li>
            );
          })}
        </ol>
      </div>

      {atlasReady && !active && (
        <div className={styles.controls} aria-label="Journey controls">
          {playing ? (
            <button type="button" onClick={() => atlas.current?.finishIntro()}>Skip intro</button>
          ) : (
            <>
              <button type="button" aria-label="Reset view" title="Reset view" onClick={() => atlas.current?.reset()}>
                <AppIcon name="home" />
              </button>
              {!reduced && <button type="button" aria-label="Replay intro" title="Replay intro" onClick={() => atlas.current?.playIntro()}>
                <AppIcon name="history" />
              </button>}
            </>
          )}
        </div>
      )}

      {active ? (
        <section key={active.id} id="workspace-preview" className={styles.preview} aria-labelledby="workspace-preview-title">
          <div className={styles.previewHeading}>
            <div>
              <p className={styles.kicker}>
                <AppIcon name={recommended ? "spark" : active.icon} />
                {recommended ? (recommendation.basis === "setup" ? "Suggested start" : "Suggested for you") : active.eyebrow}
              </p>
              <h2 id="workspace-preview-title" ref={previewHeading} tabIndex={-1}>{active.title}</h2>
            </div>
            <button type="button" className={styles.close} aria-label="Close workspace preview" onClick={closePreview}>
              <AppIcon name="x" />
            </button>
          </div>
          <p className={styles.detail}>{recommended ? recommendation.reason : active.description}</p>
          <Link className={styles.launch} href={active.href}>
            {recommended && recommendation.basis === "setup" ? "Create a plan" : WAYPOINTS[active.id].action}
            <AppIcon name="arrowRight" />
          </Link>
          {atlasReady && <button className={styles.back} type="button" onClick={closePreview}>Back to Journey</button>}
          {progress && progress.total_units > 0 ? (
            <div className={styles.mastery}>
              <span id="journey-mastery-title">
                {mastered ? "Plan mastered" : `${progress.mastered_units} of ${progress.total_units} topics mastered`}
              </span>
              <progress className="journey-progress" aria-labelledby="journey-mastery-title"
                value={progress.mastered_units} max={progress.total_units} />
            </div>
          ) : null}
        </section>
      ) : null}
    </section>
  );
}
