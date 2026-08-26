import { cn } from "@/lib/utils";
import { EmptyState } from "@/components/ui/Polished";
import { HealthDot } from "./HealthBadge";
import { MUTED, TEXT, classifyHealth, humanize, relativeTime } from "./format";
import type { AuditRow } from "./types";

// Scannable vertical timeline of founder/admin activity (real audit rows).
export function ActivityTimeline({ rows, limit = 25 }: { rows: AuditRow[]; limit?: number }) {
  if (!rows.length) {
    return (
      <EmptyState
        icon="history"
        title="No activity recorded yet"
        detail="Admin actions, content ingestion, and config changes will appear here as they happen."
      />
    );
  }

  return (
    <ol className="relative space-y-0">
      <span className="absolute left-[7px] top-2 bottom-2 w-px bg-[color:var(--agentify-border)]" aria-hidden="true" />
      {rows.slice(0, limit).map((row) => {
        const state = classifyHealth(row.status);
        const actor = row.actor_email || row.actor_uid || "system";
        const target = [row.target_type, row.target_id].filter(Boolean).join(" · ");
        return (
          <li key={row.id} className="relative flex gap-4 py-3 pl-1">
            <span className="relative z-10 mt-1.5">
              <HealthDot state={state} />
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                <p className={cn("truncate text-sm font-semibold", TEXT)}>{humanize(row.action)}</p>
                <time className={cn("shrink-0 text-xs", MUTED)}>{relativeTime(row.created_at)}</time>
              </div>
              <p className={cn("mt-0.5 truncate text-xs", MUTED)}>
                {actor}
                {target ? <span className="opacity-70"> — {target}</span> : null}
              </p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
