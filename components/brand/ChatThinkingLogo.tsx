import Image from "next/image";
import type { CSSProperties } from "react";
import { cn } from "@/lib/utils";

export type ChatThinkingLogoState = "idle" | "thinking" | "streaming" | "complete";

type ChatThinkingLogoProps = {
  state?: ChatThinkingLogoState;
  size?: number;
  className?: string;
  label?: string;
};

export default function ChatThinkingLogo({
  state = "idle",
  size = 44,
  className,
  label = "AgentifyAI status",
}: ChatThinkingLogoProps) {
  const labelled = label.trim().length > 0;

  return (
    <span
      className={cn("chat-thinking-logo", `is-${state}`, className)}
      style={{ "--chat-logo-size": `${size}px` } as CSSProperties}
      role={labelled ? "img" : undefined}
      aria-label={labelled ? label : undefined}
      aria-hidden={labelled ? undefined : true}
      data-state={state}
    >
      <Image src="/agentify-mark.svg" alt="" width={size} height={size} unoptimized />
    </span>
  );
}
