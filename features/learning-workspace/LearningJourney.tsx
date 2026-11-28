"use client";

import { AppIcon } from "@/components/ui/Polished";
import type { AtlasOverview, AtlasRuntime } from "@/features/atlas/scene/createAtlas";
import type { PlanningPortfolioProgress } from "@/features/planning/contracts";
import Link from "next/link";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { LEARNING_WORKSPACE_STEPS } from "./config";
import { journeySessionKeys } from "./journeySession";
import { recommendLearningWorkspace, type LearningRecommendation } from "./recommendation";
import type { LearningModeId } from "./types";
import styles from "./journey-landing.module.css";

// Label anchors in the 1000 by 880 Atlas overview, used without WebGL.
const WAYPOINTS = {
  planning: { x: 68.3, y: 68.7, action: "Open Planning" },
  study: { x: 49.9, y: 53.8, action: "Open Study Lab" },
  revision: { x: 73.0, y: 44.5, action: "Start a review" },
  exam: { x: 64.8, y: 34.6, action: "Open Exam" },
} as const;

const WAYPOINT_GLYPHS: Record<LearningModeId, string> = {
  planning: "M9 4H6a1.5 1.5 0 0 0-1.5 1.5v14A1.5 1.5 0 0 0 6 21h12a1.5 1.5 0 0 0 1.5-1.5v-14A1.5 1.5 0 0 0 18 4h-3 M9 3h6v3H9z M7.5 10l1 1 1.5-1.6m-2.5 5.5 1 1 1.5-1.6M13 10.5h3.5M13 15.5h3.5",
  study: "M12 5.8C9.9 4.1 6.8 3.7 3 4.5v14c3.8-.8 6.9-.4 9 1.2 2.1-1.6 5.2-2 9-1.2v-14c-3.8-.8-6.9-.4-9 1.3v13.9 M6 9.1c1.2 0 2.3.2 3.2.6M6 13.1c1.2 0 2.3.2 3.2.6m5.6-4c1-.4 2-.6 3.2-.6m-3.2 4.6c1-.4 2-.6 3.2-.6",
  revision: "M12 5.4a3.1 3.1 0 0 0-5.7-1.7 3.4 3.4 0 0 0-2.5 5.2 3.5 3.5 0 0 0 0 5.8 3.4 3.4 0 0 0 2.5 5.2 3.1 3.1 0 0 0 5.7-1.7V5.4Zm0 0a3.1 3.1 0 0 1 5.7-1.7 3.4 3.4 0 0 1 2.5 5.2 3.5 3.5 0 0 1 0 5.8 3.4 3.4 0 0 1-2.5 5.2 3.1 3.1 0 0 1-5.7-1.7M8.5 7.5c0 1.2-.8 2.2-2.1 2.5m2.1 6.5c0-1.2-.8-2.2-2.1-2.5m9.1-6.5c0 1.2.8 2.2 2.1 2.5m-2.1 6.5c0-1.2.8-2.2 2.1-2.5",
  exam: "M7 3.5h10v5a5 5 0 0 1-10 0v-5ZM7 6H3v1.5a4 4 0 0 0 4 4m10-5.5h4v1.5a4 4 0 0 1-4 4M12 14v5m-4.5 1.5h9",
};

type JourneyReturn = { mode: LearningModeId; view?: AtlasOverview };

function readJourneyReturn(key: string): JourneyReturn | null {
  try {
    const saved = JSON.parse(sessionStorage.getItem(key) ?? "null") as JourneyReturn | null;
    if (!saved || !LEARNING_WORKSPACE_STEPS.some(({ id }) => id === saved.mode)) return null;
    const view = saved.view;
    const point = (value?: number[]) => Array.isArray(value) && value.length === 3 && value.every(Number.isFinite);
    return {
      mode: saved.mode,
      view: view && Number.isFinite(view.aspect) && point(view.eye) && point(view.target) ? view : undefined,
    };
  } catch {
    return null;
  }
}

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
  const [atlasPhase, setAtlasPhase] = useState<"loading" | "ready" | "fallback">("loading");
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
  const atlasReady = atlasPhase === "ready";
  const { intro: introKey, return: returnKey } = journeySessionKeys(userId);

  useEffect(() => {
    if (choice) previewHeading.current?.focus({ preventScroll: true });
  }, [choice]);

  useEffect(() => {
    if (atlasReady) {
      atlas.current?.markMastered(mastered);
      atlas.current?.recommend(recommendation.mode);
    }
  }, [atlasReady, mastered, recommendation.mode]);

  useEffect(() => {
    let cancelled = false;
    let focusFrame = 0;
    const root = document.documentElement;
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    let returning = readJourneyReturn(returnKey);
    let introStarted = false;
    let presented = false;
    function rememberIntro() {
      try { sessionStorage.setItem(introKey, "1"); } catch { /* Storage is optional. */ }
    }
    function restoreFocus() {
      const saved = returning;
      if (!saved) return;
      cancelAnimationFrame(focusFrame);
      // Wait for the route's own focus handling and the visible marker layout.
      focusFrame = requestAnimationFrame(() => {
        focusFrame = requestAnimationFrame(() => {
          const index = LEARNING_WORKSPACE_STEPS.findIndex(({ id }) => id === saved.mode);
          buttons.current[index]?.focus({ preventScroll: true });
          returning = null;
          try { sessionStorage.removeItem(returnKey); } catch { /* Storage is optional. */ }
        });
      });
    }
    function syncPreferences() {
      const reduce = motion.matches || root.dataset.motion === "reduced";
      setReduced(reduce);
      atlas.current?.preferences(root.dataset.theme === "light", reduce);
      return reduce;
    }
    const preferences = new MutationObserver(syncPreferences);
    preferences.observe(root, { attributes: true, attributeFilter: ["data-theme", "data-motion"] });
    motion.addEventListener("change", syncPreferences);
    void import("@/features/atlas/scene/createAtlas").then(async ({ createAtlas }) => {
      if (cancelled || !surface.current) return;
      const runtime = createAtlas(surface.current, markers.current, (available) => {
        if (cancelled) return;
        setAtlasPhase(available ? "ready" : "fallback");
        if (!available) setPlaying(false);
        restoreFocus();
      }, {
        onIntroChange(playing) {
          if (cancelled) return;
          if (playing) {
            introStarted = true;
            if (presented) rememberIntro();
          }
          setPlaying(playing);
        },
        onSelect(id) {
          const index = LEARNING_WORKSPACE_STEPS.findIndex((step) => step.id === id);
          opener.current = buttons.current[index];
          selected.current = id;
          setChoice(id);
          atlas.current?.focus(id);
        },
      });
      atlas.current = runtime;
      const reduce = syncPreferences();
      if (selected.current) {
        runtime.focus(selected.current);
      } else if (returning) {
        if (returning.view) runtime.restoreOverview(returning.view);
      } else if (!reduce) {
        let played = false;
        try {
          played = !!sessionStorage.getItem(introKey);
        } catch {
          // Replay stays available when a browser blocks session storage.
        }
        if (!played) runtime.playIntro();
      }
      const available = await runtime.ready;
      if (!cancelled) {
        presented = available;
        if (presented && introStarted) rememberIntro();
        setAtlasPhase(available ? "ready" : "fallback");
        restoreFocus();
      }
    }).catch(() => {
      if (cancelled) return;
      setPlaying(false);
      setAtlasPhase("fallback");
      restoreFocus();
    });
    return () => {
      cancelled = true;
      cancelAnimationFrame(focusFrame);
      preferences.disconnect();
      motion.removeEventListener("change", syncPreferences);
      atlas.current?.dispose();
      atlas.current = null;
    };
  }, [introKey, returnKey]);

  const closePreview = () => {
    selected.current = null;
    setChoice(null);
    atlas.current?.focus(null);
    opener.current?.focus({ preventScroll: true });
  };

  return (
    <section className={styles.page} aria-labelledby="learning-journey-title" data-atlas={atlasPhase}
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
      {atlasPhase === "loading" && <p className={styles.loading} role="status">Loading your 3D journey…</p>}

      <div className={styles.map}>
        {atlasPhase === "fallback" && <div className={styles.art} aria-hidden="true" />}
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
                  onFocus={() => atlas.current?.highlight(step.id)}
                  onBlur={() => atlas.current?.highlight(null)}
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
                  <span className={styles.pinIcon} aria-hidden="true">
                    <svg viewBox="0 0 24 24"><path d={WAYPOINT_GLYPHS[step.id]} /></svg>
                  </span>
                  <span className={styles.pinCopy} aria-hidden="true">
                    {suggested && <span className={styles.nextCue}>{recommendation.basis === "setup" ? "Start" : "Next"}</span>}
                    {step.title}
                  </span>
                </button>
              </li>
            );
          })}
        </ol>
      </div>

      {atlasReady && !active && (
        <div className={styles.controls} aria-label="Journey controls">
          <button type="button" onClick={() => atlas.current?.reset()}>Reset view</button>
          {playing ? (
            <button type="button" onClick={() => atlas.current?.finishIntro()}>Skip intro</button>
          ) : (
            !reduced && <button type="button" onClick={() => atlas.current?.playIntro()}>Replay intro</button>
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
          <Link className={styles.launch} href={active.href}
            onNavigate={() => {
              try {
                sessionStorage.setItem(returnKey, JSON.stringify({ mode: active.id, view: atlas.current?.readOverview() }));
              } catch { /* Storage is optional. */ }
            }}>
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
