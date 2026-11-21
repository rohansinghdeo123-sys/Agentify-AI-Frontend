import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/utils";

export type AppIconName =
  | "analytics"
  | "arrowRight"
  | "book"
  | "check"
  | "clock"
  | "copy"
  | "dashboard"
  | "download"
  | "history"
  | "home"
  | "mic"
  | "mission"
  | "panelLeft"
  | "plus"
  | "search"
  | "send"
  | "spark"
  | "study"
  | "trophy"
  | "trash"
  | "x";

export function AppIcon({ name, className }: { name: AppIconName; className?: string }) {
  const common = "polished-app-icon h-4 w-4";

  if (name === "dashboard") {
    return (
      <svg aria-hidden="true" viewBox="0 0 24 24" className={cn(common, className)}>
        <path d="M4 5.5A1.5 1.5 0 0 1 5.5 4h4A1.5 1.5 0 0 1 11 5.5v4A1.5 1.5 0 0 1 9.5 11h-4A1.5 1.5 0 0 1 4 9.5v-4Z" />
        <path d="M13 5.5A1.5 1.5 0 0 1 14.5 4h4A1.5 1.5 0 0 1 20 5.5v4a1.5 1.5 0 0 1-1.5 1.5h-4A1.5 1.5 0 0 1 13 9.5v-4Z" />
        <path d="M4 14.5A1.5 1.5 0 0 1 5.5 13h4a1.5 1.5 0 0 1 1.5 1.5v4A1.5 1.5 0 0 1 9.5 20h-4A1.5 1.5 0 0 1 4 18.5v-4Z" />
        <path d="M13 14.5a1.5 1.5 0 0 1 1.5-1.5h4a1.5 1.5 0 0 1 1.5 1.5v4a1.5 1.5 0 0 1-1.5 1.5h-4a1.5 1.5 0 0 1-1.5-1.5v-4Z" />
      </svg>
    );
  }

  if (name === "study") {
    return (
      <svg aria-hidden="true" viewBox="0 0 24 24" className={cn(common, className)}>
        <path d="M5 6.5A2.5 2.5 0 0 1 7.5 4h9A2.5 2.5 0 0 1 19 6.5v6A2.5 2.5 0 0 1 16.5 15H12l-4.5 4v-4A2.5 2.5 0 0 1 5 12.5v-6Z" />
        <path d="M8 8h8M8 11h5" />
      </svg>
    );
  }

  if (name === "mission") {
    return (
      <svg aria-hidden="true" viewBox="0 0 24 24" className={cn(common, className)}>
        <path d="M12 21a9 9 0 1 0-9-9" />
        <path d="M12 17a5 5 0 1 0-5-5" />
        <path d="M12 13a1 1 0 1 0-1-1" />
        <path d="M4 20 12 12M4 20h4M4 20v-4" />
      </svg>
    );
  }

  if (name === "history") {
    return (
      <svg aria-hidden="true" viewBox="0 0 24 24" className={cn(common, className)}>
        <path d="M12 8v5l3 2" />
        <path d="M4.5 12a7.5 7.5 0 1 0 2.2-5.3" />
        <path d="M4.5 5.5v4h4" />
      </svg>
    );
  }

  if (name === "panelLeft") {
    return (
      <svg aria-hidden="true" viewBox="0 0 24 24" className={cn(common, className)}>
        <rect x="3.5" y="4" width="17" height="16" rx="2.5" />
        <path d="M9 4v16" />
      </svg>
    );
  }

  if (name === "search") {
    return (
      <svg aria-hidden="true" viewBox="0 0 24 24" className={cn(common, className)}>
        <circle cx="10.8" cy="10.8" r="5.8" />
        <path d="m15 15 4.5 4.5" />
      </svg>
    );
  }

  if (name === "trophy") {
    return (
      <svg aria-hidden="true" viewBox="0 0 24 24" className={cn(common, className)}>
        <path d="M8 4h8v6a4 4 0 0 1-8 0V4ZM8 6H4v1a4 4 0 0 0 4 4m8-5h4v1a4 4 0 0 1-4 4m-4 3v4m-4 2h8" />
      </svg>
    );
  }

  if (name === "analytics") {
    return (
      <svg aria-hidden="true" viewBox="0 0 24 24" className={cn(common, className)}>
        <path d="M5 19V5" />
        <path d="M5 19h14" />
        <path d="M8 16v-4" />
        <path d="M12 16V8" />
        <path d="M16 16v-6" />
      </svg>
    );
  }

  if (name === "book") {
    return (
      <svg aria-hidden="true" viewBox="0 0 24 24" className={cn(common, className)}>
        <path d="M5 5.5A2.5 2.5 0 0 1 7.5 3H20v16H7.5A2.5 2.5 0 0 0 5 21V5.5Z" />
        <path d="M5 5.5A2.5 2.5 0 0 0 7.5 8H20" />
      </svg>
    );
  }

  if (name === "mic") {
    return (
      <svg aria-hidden="true" viewBox="0 0 24 24" className={cn(common, className)}>
        <path d="M12 14a3 3 0 0 0 3-3V6a3 3 0 0 0-6 0v5a3 3 0 0 0 3 3Z" />
        <path d="M5 11a7 7 0 0 0 14 0" />
        <path d="M12 18v3" />
      </svg>
    );
  }

  if (name === "send") {
    return (
      <svg aria-hidden="true" viewBox="0 0 24 24" className={cn(common, className)}>
        <path d="M4 12 20 4l-5 16-3-7-8-1Z" />
        <path d="m12 13 8-9" />
      </svg>
    );
  }

  if (name === "copy") {
    return (
      <svg aria-hidden="true" viewBox="0 0 24 24" className={cn(common, className)}>
        <path d="M9 9h10v10H9z" />
        <path d="M5 15H4a1 1 0 0 1-1-1V5a2 2 0 0 1 2-2h9a1 1 0 0 1 1 1v1" />
      </svg>
    );
  }

  if (name === "check") {
    return (
      <svg aria-hidden="true" viewBox="0 0 24 24" className={cn(common, className)}>
        <path d="m5 12 4 4L19 6" />
      </svg>
    );
  }

  if (name === "trash") {
    return (
      <svg aria-hidden="true" viewBox="0 0 24 24" className={cn(common, className)}>
        <path d="M4 7h16" />
        <path d="M10 11v6M14 11v6" />
        <path d="M6 7l1 14h10l1-14" />
        <path d="M9 7V4h6v3" />
      </svg>
    );
  }

  if (name === "plus") {
    return (
      <svg aria-hidden="true" viewBox="0 0 24 24" className={cn(common, className)}>
        <path d="M12 5v14M5 12h14" />
      </svg>
    );
  }

  if (name === "download") {
    return (
      <svg aria-hidden="true" viewBox="0 0 24 24" className={cn(common, className)}>
        <path d="M12 4v10" />
        <path d="m8 10 4 4 4-4" />
        <path d="M5 20h14" />
      </svg>
    );
  }

  if (name === "x") {
    return (
      <svg aria-hidden="true" viewBox="0 0 24 24" className={cn(common, className)}>
        <path d="M6 6l12 12M18 6 6 18" />
      </svg>
    );
  }

  if (name === "clock") {
    return (
      <svg aria-hidden="true" viewBox="0 0 24 24" className={cn(common, className)}>
        <path d="M12 7v5l3 2" />
        <path d="M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
      </svg>
    );
  }

  if (name === "home") {
    return (
      <svg aria-hidden="true" viewBox="0 0 24 24" className={cn(common, className)}>
        <path d="m4 11 8-7 8 7" />
        <path d="M6 10v10h12V10" />
      </svg>
    );
  }

  if (name === "arrowRight") {
    return (
      <svg aria-hidden="true" viewBox="0 0 24 24" className={cn(common, className)}>
        <path d="M5 12h14" />
        <path d="m13 6 6 6-6 6" />
      </svg>
    );
  }

  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className={cn(common, className)}>
      <path d="M12 3l1.7 5.1L19 10l-5.3 1.9L12 17l-1.7-5.1L5 10l5.3-1.9L12 3Z" />
      <path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8L19 15Z" />
    </svg>
  );
}

export function IconButton({
  label,
  icon,
  className,
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  label: string;
  icon: AppIconName;
  children?: ReactNode;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={children ? undefined : label}
      className={cn("agentify-action ds-icon-button polished-icon-button px-3", className)}
      {...props}
    >
      <AppIcon name={icon} />
      {children ? <span>{children}</span> : null}
    </button>
  );
}

export function LoadingState({ title, detail }: { title: string; detail?: string }) {
  return (
    <div className="flex min-h-[64svh] items-center justify-center p-4" role="status" aria-live="polite">
      <div className="agentify-state-panel ds-card polished-loading-card w-full max-w-md p-5">
        <div className="flex items-center gap-3">
          <span className="h-3 w-3 rounded-full bg-[color:var(--ds-accent-teal-strong)] shadow-[0_0_0_6px_var(--ds-accent-teal-soft)]" />
          <p className="text-sm font-semibold text-[color:var(--ds-text-primary)]">{title}</p>
        </div>
        {detail ? <p className="mt-2 text-sm leading-6 text-[color:var(--ds-text-muted)]">{detail}</p> : null}
        <div className="mt-5 space-y-2">
          <span className="polished-skeleton block h-3 w-5/6 rounded-full" />
          <span className="polished-skeleton block h-3 w-2/3 rounded-full" />
          <span className="polished-skeleton block h-3 w-4/5 rounded-full" />
        </div>
      </div>
    </div>
  );
}

export function LoadingSkeleton({
  rows = 3,
  className,
}: {
  rows?: number;
  className?: string;
}) {
  return (
    <div className={cn("space-y-3", className)} role="status" aria-label="Loading content">
      {Array.from({ length: rows }, (_, index) => (
        <span
          key={index}
          className="polished-skeleton block h-3 rounded-full"
          style={{ width: `${Math.max(52, 92 - index * 11)}%` }}
        />
      ))}
    </div>
  );
}

export function EmptyState({
  icon = "spark",
  title,
  detail,
  action,
}: {
  icon?: AppIconName;
  title: string;
  detail: string;
  action?: ReactNode;
}) {
  return (
    <div className="agentify-state-panel ds-card polished-empty-state flex min-h-[280px] flex-col items-center justify-center border-dashed p-7 text-center">
      <span className="polished-icon-surface flex h-14 w-14 items-center justify-center rounded-[var(--ds-radius-md)] bg-[color:var(--ds-accent-teal-soft)] text-[color:var(--ds-accent-teal)]">
        <AppIcon name={icon} className="h-6 w-6" />
      </span>
      <h2 className="mt-5 text-2xl font-semibold tracking-tight text-[color:var(--ds-text-primary)]">{title}</h2>
      <p className="mt-3 max-w-xl text-sm leading-6 text-[color:var(--ds-text-muted)]">{detail}</p>
      {action ? <div className="mt-6 flex flex-wrap justify-center gap-3">{action}</div> : null}
    </div>
  );
}

export function ErrorState({
  title = "Something went wrong",
  detail,
  action,
}: {
  title?: string;
  detail: string;
  action?: ReactNode;
}) {
  return (
    <div className="agentify-state-panel ds-card polished-empty-state flex min-h-[280px] flex-col items-center justify-center border-[color:var(--ds-danger)] bg-[color:var(--ds-danger-soft)] p-7 text-center" role="alert">
      <span className="polished-icon-surface flex h-14 w-14 items-center justify-center rounded-[var(--ds-radius-md)] bg-[color:var(--ds-danger-soft)] text-[color:var(--ds-danger)]">
        <AppIcon name="x" className="h-6 w-6" />
      </span>
      <h2 className="mt-5 text-2xl font-semibold tracking-tight text-[color:var(--ds-text-primary)]">{title}</h2>
      <p className="mt-3 max-w-xl text-sm leading-6 text-[color:var(--ds-text-secondary)]">{detail}</p>
      {action ? <div className="mt-6 flex flex-wrap justify-center gap-3">{action}</div> : null}
    </div>
  );
}

export function AlertState({ message, tone = "rose" }: { message: string; tone?: "rose" | "amber" | "blue" }) {
  const styles =
    tone === "amber"
      ? "border-[color:var(--ds-warning)] bg-[color:var(--ds-warning-soft)] text-[color:var(--ds-warning)]"
      : tone === "blue"
        ? "border-[color:var(--ds-info)] bg-[color:var(--ds-info-soft)] text-[color:var(--ds-info)]"
        : "border-[color:var(--ds-danger)] bg-[color:var(--ds-danger-soft)] text-[color:var(--ds-danger)]";

  return (
    <p className={cn("agentify-alert ds-alert", styles)} role={tone === "rose" ? "alert" : "status"} aria-live={tone === "rose" ? "assertive" : "polite"}>
      {message}
    </p>
  );
}
