/**
 * Firebase normally delivers the initial auth state immediately. A browser can
 * occasionally leave that callback pending (for example after corrupted
 * persisted auth storage). Never let that keep the whole product on a loader.
 */
export const AUTH_BOOTSTRAP_TIMEOUT_MS = 5_000;
export const PROFILE_FOREGROUND_WAIT_MS = 6_500;
export const PROFILE_RECOVERY_MESSAGE =
  "You’re signed in. Your study profile is taking longer to connect. We’ll keep trying.";

export const AUTH_BOOTSTRAP_TIMEOUT_MESSAGE =
  "We couldn't restore your sign-in automatically. You can still sign in below.";
