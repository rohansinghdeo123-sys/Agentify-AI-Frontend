"use client";

import ChatThinkingLogo from "@/components/brand/ChatThinkingLogo";
import { useEffect, useRef, useState } from "react";
import type { AtlasRuntime } from "./scene/createAtlas";
import { DESTINATIONS } from "./scene/layout";
import styles from "./atlas-preview.module.css";

export default function AtlasPreview() {
  const surface = useRef<HTMLDivElement>(null);
  const labelRefs = useRef<(HTMLSpanElement | null)[]>([]);
  const runtime = useRef<AtlasRuntime | null>(null);
  const [phase, setPhase] = useState<"loading" | "ready" | "unavailable">("loading");

  useEffect(() => {
    let cancelled = false;
    void import("./scene/createAtlas").then(({ createAtlas }) => {
      if (cancelled || !surface.current) return;
      try {
        runtime.current = createAtlas(surface.current, labelRefs.current, (available) => setPhase(available ? "ready" : "unavailable"));
        setPhase("ready");
      } catch {
        setPhase("unavailable");
      }
    }).catch(() => {
      if (!cancelled) setPhase("unavailable");
    });
    return () => {
      cancelled = true;
      runtime.current?.dispose();
      runtime.current = null;
    };
  }, []);

  return (
    <main id="main-content" className={styles.page} data-atlas-status={phase}>
      <div className={styles.stage}>
        <div ref={surface} className={styles.surface} aria-hidden="true" />
        <div className={styles.brand}>
          <ChatThinkingLogo size={31} label="" />
          <span>Agentify AI</span>
        </div>
        <header className={styles.title}>
          <p>Your personalised</p>
          <h1>Learning<br />Journey</h1>
          <span>Plan &nbsp;·&nbsp; Learn &nbsp;·&nbsp; Revise &nbsp;·&nbsp; Excel</span>
        </header>
        <div className={styles.plaques} aria-label="Atlas destinations">
          {DESTINATIONS.map((destination, index) => (
            <span key={destination.id} ref={(node) => { labelRefs.current[index] = node; }}
              className={styles.plaque} hidden={phase !== "ready"}>
              {destination.title}
            </span>
          ))}
        </div>
        {phase !== "ready" && (
          <div className={styles.notice} role="status">
            {phase === "loading" ? "Building the 3D atlas…" : "This preview needs WebGL 2. The overview screenshot remains available."}
          </div>
        )}
      </div>
      <footer className={styles.controls}>
        <span>Static 3D preview</span>
        <p>Drag to orbit. Scroll or pinch to zoom.</p>
        <button type="button" disabled={phase !== "ready"} onClick={() => runtime.current?.reset()}>
          Reset view
        </button>
      </footer>
    </main>
  );
}
