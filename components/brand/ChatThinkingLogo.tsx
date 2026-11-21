"use client";

import { useId, type CSSProperties } from "react";

import { cn } from "@/lib/utils";

export type ChatThinkingLogoState = "idle" | "thinking" | "streaming" | "complete";

type ChatThinkingLogoProps = {
  state?: ChatThinkingLogoState;
  size?: number;
  className?: string;
  label?: string;
};

const PARTICLES = [
  { cx: 46, cy: 49, r: 1.1 },
  { cx: 55, cy: 45, r: 0.85 },
  { cx: 61, cy: 54, r: 0.95 },
  { cx: 39, cy: 56, r: 0.75 },
  { cx: 52, cy: 60, r: 0.7 },
];

export default function ChatThinkingLogo({
  state = "idle",
  size = 44,
  className,
  label = "AgentifyAI status",
}: ChatThinkingLogoProps) {
  const labelled = label.trim().length > 0;
  const gradientId = useId().replace(/:/g, "");
  const goldId = `${gradientId}-agentify-logo-gold`;
  const edgeId = `${gradientId}-agentify-logo-edge`;
  const sweepId = `${gradientId}-agentify-logo-sweep`;
  const glowId = `${gradientId}-agentify-logo-soft-glow`;
  const coreId = `${gradientId}-agentify-logo-core`;

  return (
    <span
      className={cn("chat-thinking-logo", `is-${state}`, className)}
      style={
        {
          "--chat-logo-size": `${size}px`,
          "--agentify-logo-gold": `url(#${goldId})`,
          "--agentify-logo-edge": `url(#${edgeId})`,
          "--agentify-logo-sweep": `url(#${sweepId})`,
        } as CSSProperties
      }
      role={labelled ? "img" : undefined}
      aria-label={labelled ? label : undefined}
      aria-hidden={labelled ? undefined : true}
      data-state={state}
    >
      <svg
        className="chat-thinking-logo-svg"
        viewBox="0 0 100 100"
        focusable="false"
        aria-hidden="true"
        shapeRendering="geometricPrecision"
      >
        <defs>
          <linearGradient id={goldId} x1="23" y1="14" x2="78" y2="88" gradientUnits="userSpaceOnUse">
            <stop offset="0" stopColor="#FFF7D5" />
            <stop offset="0.28" stopColor="#FFD16A" />
            <stop offset="0.58" stopColor="#E5A23A" />
            <stop offset="0.82" stopColor="#9D641D" />
            <stop offset="1" stopColor="#FFE7A6" />
          </linearGradient>
          <linearGradient id={edgeId} x1="17" y1="18" x2="86" y2="86" gradientUnits="userSpaceOnUse">
            <stop offset="0" stopColor="#FFF1BA" />
            <stop offset="0.36" stopColor="#A86E21" />
            <stop offset="0.7" stopColor="#5D3510" />
            <stop offset="1" stopColor="#FFE7A6" />
          </linearGradient>
          <linearGradient id={sweepId} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stopColor="rgba(255,240,184,0)" />
            <stop offset="0.48" stopColor="rgba(255,246,199,0.96)" />
            <stop offset="1" stopColor="rgba(255,240,184,0)" />
          </linearGradient>
          <radialGradient id={coreId} cx="50%" cy="50%" r="52%">
            <stop offset="0" stopColor="#F9FFF8" />
            <stop offset="0.34" stopColor="#A7F3D0" />
            <stop offset="0.72" stopColor="#14B8A6" />
            <stop offset="1" stopColor="rgba(20,184,166,0)" />
          </radialGradient>
          <filter id={glowId} x="-40%" y="-40%" width="180%" height="180%">
            <feGaussianBlur stdDeviation="2.2" result="blur" />
            <feColorMatrix
              in="blur"
              type="matrix"
              values="1 0 0 0 0.95 0 0.72 0 0 0.49 0 0 0.28 0 0.08 0 0 0 0.75 0"
              result="goldGlow"
            />
            <feMerge>
              <feMergeNode in="goldGlow" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        <g className="chat-logo-crisp-shadow">
          <path d="M50 12 78.5 58.5H68L50 29.8 32 58.5H21.5L50 12Z" />
          <path d="M50 88 21.5 41.5H32L50 70.2 68 41.5H78.5L50 88Z" />
          <path d="M13.5 45.6H42.8L38 53.9H13.5V45.6Z" />
          <path d="M44 45.6H86.5V53.9H39.2L44 45.6Z" />
        </g>

        <g className="chat-logo-ambient" filter={`url(#${glowId})`}>
          <path className="chat-logo-upper" d="M50 12 78.5 58.5H68L50 29.8 32 58.5H21.5L50 12Z" />
          <path className="chat-logo-lower" d="M50 88 21.5 41.5H32L50 70.2 68 41.5H78.5L50 88Z" />
          <path className="chat-logo-bar" d="M13.5 45.6H42.8L38 53.9H13.5V45.6Z" />
          <path className="chat-logo-bar" d="M44 45.6H86.5V53.9H39.2L44 45.6Z" />
        </g>

        <g className="chat-logo-edge-lines">
          <path d="M50 18.4 72.3 54.9h-4.1L50 25.5 31.8 54.9h-4.1L50 18.4Z" />
          <path d="M50 81.6 27.7 45.1h4.1L50 74.5l18.2-29.4h4.1L50 81.6Z" />
        </g>

        <rect className="chat-logo-sweep" x="12.5" y="44.2" width="75" height="11.2" rx="1.4" />
        <g className="chat-logo-orbits">
          <ellipse className="chat-logo-orbit chat-logo-orbit-one" cx="50" cy="50" rx="28.5" ry="7.4" />
          <ellipse className="chat-logo-orbit chat-logo-orbit-two" cx="50" cy="50" rx="7.2" ry="28.2" />
        </g>
        <circle className="chat-logo-core" cx="50" cy="50" r="3.1" fill={`url(#${coreId})`} />

        <g className="chat-logo-particles">
          {PARTICLES.map((particle, index) => (
            <circle key={index} cx={particle.cx} cy={particle.cy} r={particle.r} />
          ))}
        </g>
      </svg>
    </span>
  );
}
