"use client";

import { useEffect, useSyncExternalStore } from "react";

type ThemeMode = "dark" | "light";
const THEME_CHANGE_EVENT = "agentify-theme-change";

function getStoredTheme(): ThemeMode {
  if (typeof window === "undefined") return "light";
  return localStorage.getItem("agentify-theme") === "dark" ? "dark" : "light";
}

function applyTheme(theme: ThemeMode) {
  document.documentElement.setAttribute("data-theme", theme);
  localStorage.setItem("agentify-theme", theme);
}

function subscribeToTheme(onStoreChange: () => void) {
  window.addEventListener("storage", onStoreChange);
  window.addEventListener(THEME_CHANGE_EVENT, onStoreChange);
  return () => {
    window.removeEventListener("storage", onStoreChange);
    window.removeEventListener(THEME_CHANGE_EVENT, onStoreChange);
  };
}

export default function ThemeToggle({ compact = false }: { compact?: boolean }) {
  const theme = useSyncExternalStore(subscribeToTheme, getStoredTheme, () => "light");
  const nextTheme = theme === "dark" ? "light" : "dark";

  useEffect(() => {
    // Reconcile after a mount/recovery and changes from another tab. Read the
    // live store so the initial server snapshot cannot overwrite a saved theme.
    document.documentElement.setAttribute("data-theme", getStoredTheme());
  }, [theme]);

  const toggleTheme = () => {
    applyTheme(nextTheme);
    window.dispatchEvent(new Event(THEME_CHANGE_EVENT));
  };

  return (
    <button
      type="button"
      onClick={toggleTheme}
      data-theme-toggle
      aria-label="Dark theme"
      aria-pressed={theme === "dark"}
      title={`Switch to ${nextTheme} theme`}
      className="agentify-action ds-icon-button theme-toggle-button px-3"
    >
      {theme === "dark" ? (
        <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4 fill-none stroke-current" strokeWidth="1.8">
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M18.7 5.3l-1.4 1.4M6.7 17.3l-1.4 1.4" />
        </svg>
      ) : (
        <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4 fill-none stroke-current" strokeWidth="1.8">
          <path d="M20.2 15.1A8.2 8.2 0 0 1 8.9 3.8 8.3 8.3 0 1 0 20.2 15Z" />
        </svg>
      )}
      <span className={compact ? "sr-only" : "theme-toggle-label"}>
        {theme === "dark" ? "Light theme" : "Dark theme"}
      </span>
    </button>
  );
}
