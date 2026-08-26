"use client";

import { AppIcon } from "@/components/ui/Polished";
import { useRouteHeadingFocus } from "./useRouteHeadingFocus";
import Link from "next/link";
import type { ReactNode } from "react";
import styles from "./exam-screen.module.css";

export type ExamScreenProps = {
  eyebrow: string;
  title: string;
  description: string;
  backHref?: string | null;
  backLabel?: string;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
};

export function ExamScreen({
  eyebrow,
  title,
  description,
  backHref = "/dashboard/exam",
  backLabel = "Exam Lab",
  actions,
  children,
  className,
  bodyClassName,
}: ExamScreenProps) {
  const headingRef = useRouteHeadingFocus();

  return (
    <div className={[styles.screen, className].filter(Boolean).join(" ")}>
      <div className={styles.ambient} aria-hidden="true" />
      <div className={styles.inner}>
        <header className={styles.header}>
          <div className={styles.headingBlock}>
            {backHref ? (
              <Link href={backHref} className={styles.backLink}>
                <AppIcon name="arrowRight" className={styles.backIcon} />
                <span>{backLabel}</span>
              </Link>
            ) : null}
            <p className={styles.eyebrow}>{eyebrow}</p>
            <h1 ref={headingRef} tabIndex={-1}>{title}</h1>
            <p className={styles.description}>{description}</p>
          </div>
          {actions ? <div className={styles.actions}>{actions}</div> : null}
        </header>

        <div className={[styles.body, bodyClassName].filter(Boolean).join(" ")}>{children}</div>
      </div>
    </div>
  );
}

export function ExamStatusMessage({
  tone = "info",
  children,
}: {
  tone?: "info" | "success" | "error";
  children: ReactNode;
}) {
  return (
    <div
      className={[styles.status, styles[tone]].join(" ")}
      role={tone === "error" ? "alert" : "status"}
      aria-live={tone === "error" ? "assertive" : "polite"}
    >
      <span className={styles.statusDot} aria-hidden="true" />
      <div>{children}</div>
    </div>
  );
}
