import { cn } from "@/lib/utils";
import { HEALTH_STYLES, humanize, type HealthStyle } from "./format";
import type { HealthState } from "./types";

export function HealthDot({ state, pulse }: { state: HealthState; pulse?: boolean }) {
  const style: HealthStyle = HEALTH_STYLES[state];
  return (
    <span className="relative inline-flex h-2.5 w-2.5 shrink-0">
      {pulse && state !== "unknown" ? (
        <span className={cn("absolute inline-flex h-full w-full animate-ping rounded-full opacity-60", style.dot)} />
      ) : null}
      <span className={cn("relative inline-flex h-2.5 w-2.5 rounded-full", style.dot)} />
    </span>
  );
}

export function HealthBadge({
  state,
  label,
  pulse,
  className,
}: {
  state: HealthState;
  label?: string;
  pulse?: boolean;
  className?: string;
}) {
  const style = HEALTH_STYLES[state];
  const text = label ?? humanize(state);
  return (
    <span
      className={cn(
        "inline-flex min-h-8 items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-bold uppercase tracking-[0.1em]",
        style.chip,
        className,
      )}
    >
      <HealthDot state={state} pulse={pulse} />
      {text}
    </span>
  );
}
