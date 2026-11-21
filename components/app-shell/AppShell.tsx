"use client";

import UserMenu from "@/components/app-shell/UserMenu";
import ThemeToggle from "@/components/ThemeToggle";
import ChatThinkingLogo from "@/components/brand/ChatThinkingLogo";
import { AppIcon } from "@/components/ui/Polished";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

export default function AppShell({
  children,
  displayName,
  classLevel,
  canOpenAdminConsole,
  onLogout,
}: {
  children: ReactNode;
  displayName: string;
  classLevel: string;
  canOpenAdminConsole: boolean;
  onLogout: () => Promise<void>;
}) {
  const pathname = usePathname();
  const isNotes = pathname.startsWith("/dashboard/study/notes/");
  const isLanding = pathname === "/dashboard" || pathname === "/dashboard/";
  const isAnalytics = pathname.startsWith("/dashboard/analytics");
  const isRankings = pathname.startsWith("/dashboard/rankings");
  const workspaceBar = isLanding || isAnalytics || isRankings;
  const immersive = pathname.startsWith("/dashboard/study")
    || pathname.startsWith("/dashboard/revision")
    || pathname.startsWith("/dashboard/exam")
    || pathname.startsWith("/dashboard/planning");

  return (
    <div className="dashboard-shell market-ready-shell" data-workspace-bar={workspaceBar || undefined} data-journey-map={isLanding || undefined}>
      {workspaceBar ? (
        <header className="market-landing-utilities">
          <Link
            href="/dashboard"
            className="market-floating-brand"
            aria-label={isLanding ? "AgentifyAI workspace home" : "Return to Workspace"}
          >
            <ChatThinkingLogo
              state="idle"
              size={36}
              className="market-floating-brand-logo"
              label=""
            />
            {!isLanding && (
              <span className="market-floating-brand-copy">
                <strong>Agentify<span>AI</span></strong>
              </span>
            )}
          </Link>

          <nav className="market-utility-navigation" aria-label="Learning insights">
            <Link href="/dashboard/analytics" className="market-utility-link" aria-label="Analytics" title={isLanding ? "Analytics" : undefined} aria-current={isAnalytics ? "page" : undefined}>
              <AppIcon name="analytics" />
              {!isLanding && <span>Analytics</span>}
            </Link>
            <Link href="/dashboard/rankings" className="market-utility-link" aria-label="Global Rankings" title={isLanding ? "Global Rankings" : undefined} aria-current={isRankings ? "page" : undefined}>
              <AppIcon name="trophy" />
              {!isLanding && <span className="market-rankings-label">Rankings</span>}
            </Link>
          </nav>

          <div className="market-landing-actions">
            <ThemeToggle compact />
            <UserMenu
              compact={isLanding}
              displayName={displayName}
              classLevel={classLevel}
              canOpenAdminConsole={canOpenAdminConsole}
              onLogout={onLogout}
            />
          </div>
        </header>
      ) : (
        <div className="market-floating-controls">
          <Link
            href="/dashboard"
            className="market-floating-home"
            aria-label="Return to Workspace"
            title="Workspace"
          >
            <ChatThinkingLogo state="idle" size={27} label="" />
            <span className="sr-only">Workspace</span>
          </Link>
          <div className="market-floating-actions">
            <ThemeToggle compact />
            <UserMenu
              compact
              displayName={displayName}
              classLevel={classLevel}
              canOpenAdminConsole={canOpenAdminConsole}
              onLogout={onLogout}
            />
          </div>
        </div>
      )}

      <main
        id="main-content"
        aria-label={isNotes ? "Study notes" : undefined}
        tabIndex={isNotes ? 0 : undefined}
        className={[
          "market-shell-main",
          isLanding ? "is-landing" : "is-route",
          immersive ? "is-immersive" : "",
          isNotes ? "is-notes" : "",
        ].filter(Boolean).join(" ")}
      >
        {children}
      </main>
    </div>
  );
}
