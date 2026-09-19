/**
 * Firebase normally delivers the initial auth state immediately. A browser can
 * occasionally leave that callback pending (for example after corrupted
 * persisted auth storage). Never let that keep the whole product on a loader.
 */
export const AUTH_BOOTSTRAP_TIMEOUT_MS = 12_000;

export const AUTH_BOOTSTRAP_TIMEOUT_MESSAGE =
  "We couldn't restore your sign-in automatically. You can still sign in below.";
