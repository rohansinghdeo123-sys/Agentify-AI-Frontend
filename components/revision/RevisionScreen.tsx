import { AppIcon } from "@/components/ui/Polished";
import Link from "next/link";
import type { ReactNode } from "react";
import styles from "./revision-screen.module.css";

export type RevisionScreenProps = {
  eyebrow: string;
  title: string;
  description: string;
  backHref?: string | null;
  backLabel?: string;
  progress?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
};

export function RevisionScreen({
  eyebrow,
  title,
  description,
  backHref = "/dashboard/revision",
  backLabel = "Revision Home",
  progress,
  actions,
  children,
  className,
  bodyClassName,
}: RevisionScreenProps) {
  return (
    <section
      className={[styles.screen, className].filter(Boolean).join(" ")}
      aria-labelledby="revision-screen-title"
    >
      <div className={styles.ambient} aria-hidden="true">
        <span />
        <span />
      </div>

      <div className={styles.frame} data-revision-scroll>
        <header className={styles.header}>
          <div className={styles.headingBlock}>
            {backHref ? (
              <Link href={backHref} className={styles.backLink}>
                <AppIcon name="arrowRight" className={styles.backIcon} />
                <span>{backLabel}</span>
              </Link>
            ) : null}
            <p className={styles.eyebrow}>{eyebrow}</p>
            <h1 id="revision-screen-title" tabIndex={-1}>{title}</h1>
            <p className={styles.description}>{description}</p>
          </div>

          {progress || actions ? (
            <div className={styles.headerAside}>
              {progress ? <div className={styles.progress}>{progress}</div> : null}
              {actions ? <div className={styles.actions}>{actions}</div> : null}
            </div>
          ) : null}
        </header>

        <div className={[styles.body, bodyClassName].filter(Boolean).join(" ")}>{children}</div>
      </div>
    </section>
  );
}

export function RevisionStatusMessage({
  tone = "info",
  children,
}: {
  tone?: "info" | "success" | "warning" | "error";
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
