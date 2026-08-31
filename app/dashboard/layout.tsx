"use client";

import { AppShell } from "@/components/app-shell";
import { useAuth } from "@/context/AuthContext";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";

const ADMIN_ROUTE = "/dashboard/internal/admin";

export default function DashboardLayout({ children }: { children: ReactNode }) {
  const {
    user,
    profile,
    accountProfile,
    authError,
    profileError,
    refreshProfile,
    loading,
    sessionExpired,
    isFounderAdmin,
    logout,
  } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const authReady = !loading;
  const isAdminRoute = pathname === "/dashboard/admin" || pathname?.startsWith("/dashboard/internal");
  const displayName = profile?.name || user?.displayName || user?.email?.split("@")[0] || "Student";
  const classLevel = profile?.classLevel || accountProfile?.class_level || "";

  useEffect(() => {
    if (!authReady) return;
    if (authError || sessionExpired) return;
    if (!user) {
      router.replace("/login");
      return;
    }
    // Internal pages own their backend-verified role checks. A founder must be
    // able to inspect operations even when the student profile is incomplete
    // or its onboarding record is temporarily unavailable.
    if (isAdminRoute) return;
    if (!profileError && accountProfile && !accountProfile.onboarding_completed) {
      router.replace("/onboarding");
    }
  }, [accountProfile, authError, authReady, isAdminRoute, profileError, router, sessionExpired, user]);

  useEffect(() => {
    if (!authReady || !user || !isFounderAdmin) return;

    const handler = (event: KeyboardEvent) => {
      if (event.ctrlKey && event.shiftKey && event.key.toLowerCase() === "a") {
        event.preventDefault();
        router.push(ADMIN_ROUTE);
      }
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [authReady, isFounderAdmin, router, user]);

  if (!authReady) {
    return (
      <main
        id="main-content"
        className="flex min-h-[100dvh] items-center justify-center bg-[var(--ds-bg-app)] px-5 text-sm text-[var(--ds-accent-teal)]"
      >
        <div className="ds-card-elevated rounded-3xl px-5 py-4 backdrop-blur-2xl">
          Preparing AgentifyAI...
        </div>
      </main>
    );
  }

  if (authError) {
    return (
      <main
        id="main-content"
        className="flex min-h-[100dvh] items-center justify-center bg-[var(--agentify-page-bg)] px-5 text-center"
      >
        <div className="agentify-card max-w-lg rounded-[2rem] p-7">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-[var(--ds-accent-teal)]">Sign-in setup</p>
          <h1 className="mt-3 text-2xl font-semibold text-[var(--agentify-primary-text)]">
            AgentifyAI sign-in needs configuration.
          </h1>
          <p className="mt-3 text-sm leading-6 text-[var(--agentify-muted-text)]">{authError}</p>
          <Link
            href="/login"
            className="agentify-action agentify-action-primary mt-6 inline-flex rounded-2xl px-5 py-3 text-sm font-semibold"
          >
            Return to sign in
          </Link>
        </div>
      </main>
    );
  }

  if (sessionExpired) {
    return (
      <main
        id="main-content"
        className="flex min-h-[100dvh] items-center justify-center bg-[var(--agentify-page-bg)] px-5 text-center"
      >
        <div className="agentify-card max-w-md rounded-[2rem] p-7">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-[var(--ds-accent-teal)]">Session ended</p>
          <h1 className="mt-3 text-2xl font-semibold text-[var(--agentify-primary-text)]">
            Please sign in again.
          </h1>
          <p className="mt-3 text-sm leading-6 text-[var(--agentify-muted-text)]">
            Your previous session expired, so private study content stays hidden until you reconnect.
          </p>
          <Link
            href="/login"
            className="agentify-action agentify-action-primary mt-6 inline-flex rounded-2xl px-5 py-3 text-sm font-semibold"
          >
            Open sign in
          </Link>
        </div>
      </main>
    );
  }

  if (!user) return null;

  if (isAdminRoute) {
    return (
      <div className="min-h-[100dvh] bg-[var(--agentify-page-bg)] text-[var(--agentify-primary-text)]">
        {children}
      </div>
    );
  }

  if (profileError || !accountProfile) {
    return (
      <main
        id="main-content"
        className="flex min-h-[100dvh] items-center justify-center bg-[var(--agentify-page-bg)] px-5 text-center"
      >
        <div className="agentify-card max-w-md rounded-[2rem] p-7">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-[var(--ds-accent-teal)]">Profile connection</p>
          <h1 className="mt-3 text-2xl font-semibold text-[var(--agentify-primary-text)]">
            We could not prepare your account.
          </h1>
          <p className="mt-3 text-sm leading-6 text-[var(--agentify-muted-text)]">
            Your login is safe. Retry the profile connection to continue.
          </p>
          <button
            type="button"
            onClick={() => void refreshProfile()}
            className="agentify-action agentify-action-primary mt-6 rounded-2xl px-5 py-3 text-sm font-semibold"
          >
            Retry connection
          </button>
        </div>
      </main>
    );
  }

  if (!accountProfile.onboarding_completed) return null;

  return (
    <AppShell
      displayName={displayName}
      classLevel={classLevel}
      canOpenAdminConsole={isFounderAdmin}
      onLogout={logout}
    >
      {children}
    </AppShell>
  );
}
