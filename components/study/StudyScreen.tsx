"use client";

import { useRouteHeadingFocus } from "@/components/exam/useRouteHeadingFocus";
import { AppIcon } from "@/components/ui/Polished";
import Link from "next/link";
import type { ReactNode } from "react";
import styles from "./study-screen.module.css";

export function StudyScreen({
  eyebrow,
  title,
  description,
  backHref,
  backLabel = "Study Home",
  aside,
  children,
  className,
}: {
  eyebrow: string;
  title: string;
  description: string;
  backHref?: string;
  backLabel?: string;
  aside?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  const headingRef = useRouteHeadingFocus();

  return (
    <section className={[styles.screen, className].filter(Boolean).join(" ")}>
      <div className={styles.ambient} aria-hidden="true"><span /><span /></div>
      <div className={styles.frame} data-study-scroll>
        <header className={styles.header}>
          <div className={styles.copy}>
            {backHref ? (
              <Link href={backHref} className={styles.backLink}>
                <AppIcon name="arrowRight" />
                <span>{backLabel}</span>
              </Link>
            ) : null}
            <p className={styles.eyebrow}>{eyebrow}</p>
            <h1 ref={headingRef} tabIndex={-1}>{title}</h1>
            <p className={styles.description}>{description}</p>
          </div>
          {aside ? <div className={styles.aside}>{aside}</div> : null}
        </header>
        <div className={styles.body}>{children}</div>
      </div>
    </section>
  );
}

export function StudySyncPill({ state }: { state: "loading" | "synced" | "offline" }) {
  return (
    <span className={styles.syncPill} data-state={state} role="status">
      <i aria-hidden="true" />
      {state === "synced" ? "Synced" : state === "offline" ? "Device history" : "Connecting"}
    </span>
  );
}
