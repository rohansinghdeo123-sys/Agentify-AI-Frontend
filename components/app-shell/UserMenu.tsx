"use client";

import BackendStatus from "@/components/BackendStatus";
import { AppIcon } from "@/components/ui/Polished";
import Link from "next/link";
import { useEffect, useRef } from "react";

function getInitials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase() || "AI";
}

export default function UserMenu({
  compact = false,
  displayName,
  classLevel,
  canOpenAdminConsole,
  onLogout,
}: {
  compact?: boolean;
  displayName: string;
  classLevel: string;
  canOpenAdminConsole: boolean;
  onLogout: () => Promise<void>;
}) {
  const detailsRef = useRef<HTMLDetailsElement>(null);

  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        detailsRef.current?.removeAttribute("open");
        detailsRef.current?.querySelector("summary")?.focus();
      }
    };
    const closeOutside = (event: PointerEvent) => {
      if (detailsRef.current && !detailsRef.current.contains(event.target as Node)) {
        detailsRef.current.removeAttribute("open");
      }
    };
    document.addEventListener("keydown", closeOnEscape);
    document.addEventListener("pointerdown", closeOutside);
    return () => {
      document.removeEventListener("keydown", closeOnEscape);
      document.removeEventListener("pointerdown", closeOutside);
    };
  }, []);

  return (
    <details
      ref={detailsRef}
      className="market-user-menu"
      data-compact={compact ? "true" : "false"}
    >
      <summary aria-label={`Open account menu for ${displayName}`}>
        <span className="market-user-avatar" aria-hidden="true">{getInitials(displayName)}</span>
        <span className="market-user-summary-copy">
          <strong>{displayName}</strong>
          <small>{classLevel || "Student account"}</small>
        </span>
        <AppIcon name="arrowRight" className="market-user-chevron" />
      </summary>

      <div className="market-user-popover">
        <div className="market-user-profile">
          <span className="market-user-avatar" aria-hidden="true">{getInitials(displayName)}</span>
          <span>
            <strong>{displayName}</strong>
            <small>{classLevel || "AgentifyAI learner"}</small>
          </span>
        </div>

        <div className="market-user-service-row">
          <span>Learning services</span>
          <BackendStatus />
        </div>

        {canOpenAdminConsole ? (
          <Link
            href="/dashboard/internal/admin"
            className="market-user-action"
            onClick={() => detailsRef.current?.removeAttribute("open")}
          >
            <AppIcon name="dashboard" />
            <span>Admin console</span>
          </Link>
        ) : null}

        <button
          type="button"
          className="market-user-action market-user-logout"
          onClick={() => void onLogout()}
        >
          <AppIcon name="arrowRight" />
          <span>Log out</span>
        </button>
      </div>
    </details>
  );
}
