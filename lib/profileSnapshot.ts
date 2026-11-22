import type { BackendUserProfile } from "./profile";

const PROFILE_TTL_MS = 24 * 60 * 60 * 1000;

export function isProfileFor(value: unknown, uid: string): value is BackendUserProfile {
  if (!value || typeof value !== "object") return false;
  const profile = value as Partial<BackendUserProfile>;
  return profile.user_id === uid &&
    typeof profile.display_name === "string" &&
    typeof profile.email === "string" &&
    typeof profile.class_level === "string" &&
    typeof profile.onboarding_completed === "boolean" &&
    typeof profile.created_at === "string" &&
    typeof profile.updated_at === "string";
}

function snapshotKey(backend: string, project: string, uid: string) {
  return JSON.stringify(["agentify-profile-v1", backend, project, uid]);
}

export function readProfileSnapshot(backend: string, project: string, uid: string) {
  try {
    const key = snapshotKey(backend, project, uid);
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const { savedAt, profile } = JSON.parse(raw);
    const age = Date.now() - savedAt;
    if (typeof savedAt === "number" && age >= 0 && age < PROFILE_TTL_MS &&
      isProfileFor(profile, uid) && profile.onboarding_completed) return profile;
    localStorage.removeItem(key);
  } catch {
    // Auth remains network-based when storage is blocked or damaged.
  }
  return null;
}

export function writeProfileSnapshot(backend: string, project: string, uid: string, profile: BackendUserProfile | null) {
  try {
    const key = snapshotKey(backend, project, uid);
    if (profile?.onboarding_completed && isProfileFor(profile, uid)) {
      localStorage.setItem(key, JSON.stringify({ savedAt: Date.now(), profile }));
    } else {
      localStorage.removeItem(key);
    }
  } catch {
    // Treat browser storage as optional.
  }
}
