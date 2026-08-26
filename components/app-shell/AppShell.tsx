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
  const isLanding = pathname === "/dashboard" || pathname === "/dashboard/";
  const immersive = pathname.startsWith("/dashboard/study")
    || pathname.startsWith("/dashboard/revision")
    || pathname.startsWith("/dashboard/exam")
    || pathname.startsWith("/dashboard/planning");

  return (
    <div className="dashboard-shell market-ready-shell">
      {isLanding ? (
        <div className="market-landing-utilities" aria-label="Workspace utilities">
          <Link
            href="/dashboard"
            className="market-floating-brand"
            aria-label="AgentifyAI workspace home"
          >
            <ChatThinkingLogo
              state="idle"
              size={36}
              className="market-floating-brand-logo"
              label=""
            />
            <span className="market-floating-brand-copy">
              <strong>Agentify<span>AI</span></strong>
              <small>Learning workspace</small>
            </span>
          </Link>

          <nav className="market-utility-navigation" aria-label="Learning insights">
            <Link href="/dashboard/analytics" className="market-utility-link">
              <AppIcon name="analytics" />
              <span>Analytics</span>
            </Link>
            <Link href="/dashboard/rankings" className="market-utility-link">
              <AppIcon name="spark" />
              <span>Rankings</span>
            </Link>
          </nav>

          <div className="market-landing-actions">
            <ThemeToggle compact />
            <UserMenu
              displayName={displayName}
              classLevel={classLevel}
              canOpenAdminConsole={canOpenAdminConsole}
              onLogout={onLogout}
            />
          </div>
        </div>
      ) : (
        <div className="market-floating-controls">
          <Link
            href="/dashboard"
            className="market-floating-home"
            aria-label="Return to Workspace"
            title="Workspace"
          >
            <AppIcon name="home" />
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
        className={[
          "market-shell-main",
          isLanding ? "is-landing" : "is-route",
          immersive ? "is-immersive" : "",
        ].filter(Boolean).join(" ")}
      >
        {children}
      </main>
    </div>
  );
}
