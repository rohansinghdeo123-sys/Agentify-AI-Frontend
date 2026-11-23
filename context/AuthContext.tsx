"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  type Auth,
  type ConfirmationResult,
  type User,
  GoogleAuthProvider,
  RecaptchaVerifier,
  getRedirectResult,
  onAuthStateChanged,
  signInWithPhoneNumber,
  signInWithPopup,
  signInWithRedirect,
  signOut,
} from "firebase/auth";
import {
  FirebaseConfigError,
  getFirebaseAuth,
  getFirebaseAuthSetupMessage,
} from "@/lib/firebase";
import { getPublicBackendUrl } from "@/lib/env";
import {
  ApiRequestError,
  apiJson,
  ensureBackendReady,
  primeBackend,
} from "@/lib/apiClient";
import {
  AUTH_BOOTSTRAP_TIMEOUT_MESSAGE,
  AUTH_BOOTSTRAP_TIMEOUT_MS,
} from "@/lib/authBootstrap";
import {
  type BackendUserProfile,
  type ProfileUpdate,
  resolveDisplayName,
} from "@/lib/profile";
import { isProfileFor, readProfileSnapshot, writeProfileSnapshot } from "@/lib/profileSnapshot";

type AuthRole = "admin" | "user";

type BackendAdminAccess = {
  role: "admin";
  founder: boolean;
  verified: boolean;
};

// Client-side discovery only. Protected admin APIs still require the backend's
// verified Firebase allow-list; these identities keep the Admin entry visible
// while a cold backend is waking or deployment environment variables lag.
const PRODUCT_OWNER_EMAILS = [
  "amit.kumarmunda4@gmail.com",
  "rohan.singhdeo123@gmail.com",
] as const;

type AuthProfile = {
  uid: string;
  role: AuthRole;
  name: string;
  email: string;
  phone: string;
  photoURL: string;
  provider: string;
  classLevel: string;
  onboardingCompleted: boolean;
};

interface AuthContextType {
  user: User | null;
  profile: AuthProfile | null;
  accountProfile: BackendUserProfile | null;
  userId: string;
  role: AuthRole;
  isAdmin: boolean;
  isFounderAdmin: boolean;
  authError: string;
  authStartupMessage: string;
  authLoading: boolean;
  loading: boolean;
  sessionExpired: boolean;
  claimsLoading: boolean;
  claims: Record<string, unknown>;
  profileError: string;
  loginWithGoogle: () => Promise<void>;
  sendPhoneOtp: (phoneNumber: string) => Promise<void>;
  verifyPhoneOtp: (otp: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshClaims: (forceRefresh?: boolean) => Promise<void>;
  refreshProfile: () => Promise<BackendUserProfile | null>;
  saveProfile: (updates: ProfileUpdate) => Promise<BackendUserProfile>;
  getIdToken: (forceRefresh?: boolean) => Promise<string | null>;
  getAuthHeaders: () => Promise<HeadersInit>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  profile: null,
  accountProfile: null,
  userId: "",
  role: "user",
  isAdmin: false,
  isFounderAdmin: false,
  authError: "",
  authStartupMessage: "",
  authLoading: true,
  loading: true,
  sessionExpired: false,
  claimsLoading: true,
  claims: {},
  profileError: "",
  loginWithGoogle: async () => {},
  sendPhoneOtp: async () => {},
  verifyPhoneOtp: async () => {},
  logout: async () => {},
  refreshClaims: async () => {},
  refreshProfile: async () => null,
  saveProfile: async () => {
    throw new Error("No authenticated user.");
  },
  getIdToken: async () => null,
  getAuthHeaders: async () => ({ "Content-Type": "application/json" }),
});

function parseEnvList(value?: string) {
  return (value ?? "")
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
}

function getRecaptchaContainer() {
  const container = document.getElementById("recaptcha-container");

  if (!container) {
    throw new Error(
      'Missing recaptcha container. Add <div id="recaptcha-container" /> to the login page.',
    );
  }

  return container;
}

function getProvider(user: User | null) {
  return user?.providerData?.[0]?.providerId ?? "unknown";
}

function hasAdminClaim(claims: Record<string, unknown>) {
  if (claims.admin === true) return true;
  if (claims.role === "admin") return true;

  const roles = claims.roles;
  return Array.isArray(roles) && roles.includes("admin");
}

function hasFounderClaim(claims: Record<string, unknown>) {
  if (claims.founder === true || claims.founderAdmin === true) return true;
  const roles = claims.roles;
  return Array.isArray(roles) && roles.includes("founder");
}

export function isAdminUser(user: User | null, claims: Record<string, unknown>) {
  if (!user) return false;
  if (hasAdminClaim(claims)) return true;

  // Founder accounts are admins by definition. Keep the general and founder
  // allow-lists additive so deployments that follow the documented
  // NEXT_PUBLIC_FOUNDER_ADMIN_EMAILS-only setup can still reveal and open the
  // founder console.
  const adminEmails = [
    ...PRODUCT_OWNER_EMAILS,
    ...parseEnvList(process.env.NEXT_PUBLIC_ADMIN_EMAILS),
    ...parseEnvList(process.env.NEXT_PUBLIC_FOUNDER_ADMIN_EMAILS),
  ];
  const adminUids = parseEnvList(process.env.NEXT_PUBLIC_ADMIN_UIDS);
  const adminPhones = parseEnvList(process.env.NEXT_PUBLIC_ADMIN_PHONES);

  const email = user.email?.toLowerCase() ?? "";
  const uid = user.uid.toLowerCase();
  const phone = user.phoneNumber?.toLowerCase() ?? "";

  return (
    adminEmails.includes(email) ||
    adminUids.includes(uid) ||
    adminPhones.includes(phone)
  );
}

export function isFounderUser(user: User | null, claims: Record<string, unknown>) {
  if (!user) return false;
  if (hasFounderClaim(claims)) return true;

  const founderEmails = [
    ...PRODUCT_OWNER_EMAILS,
    ...parseEnvList(process.env.NEXT_PUBLIC_FOUNDER_ADMIN_EMAILS),
  ];
  return founderEmails.includes(user.email?.trim().toLowerCase() ?? "");
}

export function resolveAdminAuthorization(
  user: User | null,
  claims: Record<string, unknown>,
  backendAccess: BackendAdminAccess | null,
) {
  const backendVerified = backendAccess?.verified === true;
  const isFounderAdmin =
    (backendVerified && backendAccess?.founder === true) || isFounderUser(user, claims);
  const isAdmin =
    (backendVerified && backendAccess?.role === "admin") ||
    isFounderAdmin ||
    isAdminUser(user, claims);
  return { isAdmin, isFounderAdmin };
}

function createGoogleProvider() {
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: "select_account" });
  return provider;
}

function getFirebaseErrorCode(error: unknown) {
  if (typeof error === "object" && error !== null && "code" in error) {
    const code = (error as { code?: unknown }).code;
    if (typeof code === "string") return code;
  }

  return error instanceof Error ? error.message : String(error);
}

function shouldUseRedirectFallback(error: unknown) {
  const code = getFirebaseErrorCode(error);

  return [
    "auth/popup-blocked",
    "auth/cancelled-popup-request",
    "auth/operation-not-supported-in-this-environment",
  ].some((fallbackCode) => code.includes(fallbackCode));
}

function isTemporaryBackendError(error: unknown) {
  if (error instanceof ApiRequestError) {
    return (
      error.status === 0 ||
      error.status === 408 ||
      error.status === 425 ||
      error.status === 429 ||
      error.status >= 500
    );
  }

  if (error instanceof Error) {
    const message = error.message.toLowerCase();
    return (
      error.name === "AbortError" ||
      message.includes("failed to fetch") ||
      message.includes("networkerror") ||
      message.includes("network request failed") ||
      message.includes("load failed")
    );
  }

  return false;
}

function profileErrorMessage(error: unknown) {
  if (isTemporaryBackendError(error)) {
    return "You’re signed in, but the study server is unavailable. Retry to reconnect your profile.";
  }

  return error instanceof Error ? error.message : "We could not load your AgentifyAI profile.";
}

function withIdentityDeadline<T>(request: Promise<T>) {
  return new Promise<T>((resolve, reject) => {
    const deadline = setTimeout(() => reject(new ApiRequestError("Identity verification timed out.", 408)), 10_000);
    void request.then(resolve, reject).finally(() => clearTimeout(deadline));
  });
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [authError, setAuthError] = useState("");
  const [authStartupMessage, setAuthStartupMessage] = useState("");
  const [sessionExpired, setSessionExpired] = useState(false);
  const [profileLoading, setProfileLoading] = useState(false);
  const [accountProfile, setAccountProfile] = useState<BackendUserProfile | null>(null);
  const [profileError, setProfileError] = useState("");
  const [claimsLoading, setClaimsLoading] = useState(true);
  const [claims, setClaims] = useState<Record<string, unknown>>({});
  const [adminAccessLoading, setAdminAccessLoading] = useState(true);
  const [backendAdminAccess, setBackendAdminAccess] = useState<BackendAdminAccess | null>(null);

  const authRef = useRef<Auth | null>(null);
  const recaptchaVerifierRef = useRef<RecaptchaVerifier | null>(null);
  const confirmationResultRef = useRef<ConfirmationResult | null>(null);
  const hasAuthenticatedRef = useRef(false);
  const manualSignOutRef = useRef(false);
  const authStateResolvedRef = useRef(false);
  const profileRequest = useRef<{ uid: string; controller: AbortController; pending: Promise<BackendUserProfile | null> } | null>(null);
  const previousUser = useRef<User | null>(null);
  const backendURL = getPublicBackendUrl();

  const requireAuthClient = useCallback(() => {
    if (authRef.current) return authRef.current;

    const message =
      authError ||
      getFirebaseAuthSetupMessage() ||
      "Sign-in is not ready. Please refresh and try again.";

    throw new FirebaseConfigError(message);
  }, [authError]);

  const loadProfile = useCallback(
    (currentUser: User, forceFresh = false): Promise<BackendUserProfile | null> => {
      if (profileRequest.current?.uid === currentUser.uid) return profileRequest.current.pending;
      profileRequest.current?.controller.abort();
      const controller = new AbortController();
      const project = authRef.current?.app.options.projectId || "";
      const { uid } = currentUser;
      const isCurrent = () => !controller.signal.aborted && authRef.current?.currentUser?.uid === uid;
      const cached = forceFresh ? null : readProfileSnapshot(backendURL, project, uid);
      setProfileLoading(true);
      setProfileError("");
      let resumed = false;
      const pending = (async () => {
        try {
          let token = await withIdentityDeadline(currentUser.getIdToken());
          if (!isCurrent()) return null;
          if (cached) {
            // Only a current Firebase identity may use its own verified profile.
            resumed = true;
            setAccountProfile(cached);
            setProfileLoading(false);
            setProfileError("");
          }
          const deadline = Date.now() + 90_000;
          const attemptTimeouts = [15_000, 25_000, 45_000];
          let refreshedToken = false;
          for (const [attempt, timeoutMs] of attemptTimeouts.entries()) {
            const canRetry = attempt < attemptTimeouts.length - 1;
            try {
              const remaining = deadline - Date.now();
              if (remaining <= 0) throw new ApiRequestError("The study server took too long to respond.", 408);
              const loadedProfile = await apiJson<unknown>(`${backendURL}/profile/me`, {
                headers: { Authorization: `Bearer ${token}` },
                signal: controller.signal,
                timeoutMs: Math.min(timeoutMs, remaining),
              });
              if (!isProfileFor(loadedProfile, uid)) throw new ApiRequestError("The study server did not return a valid profile.", 503);
              if (!isCurrent()) return null;
              writeProfileSnapshot(backendURL, project, uid, loadedProfile);
              setAccountProfile(loadedProfile);
              setProfileError("");
              return loadedProfile;
            } catch (error) {
              if (!isCurrent()) return null;
              if (error instanceof ApiRequestError && error.status === 401 && !refreshedToken && canRetry) {
                refreshedToken = true;
                resumed = false;
                writeProfileSnapshot(backendURL, project, uid, null);
                setAccountProfile(null);
                setProfileLoading(true);
                token = await withIdentityDeadline(currentUser.getIdToken(true));
                continue;
              }
              if (!isTemporaryBackendError(error) || !canRetry || Date.now() >= deadline) throw error;
              // When the host wakes up, share the health probe already started from login.
              if (!(error instanceof ApiRequestError) || error.status === 503) {
                await ensureBackendReady(backendURL, { timeoutMs: Math.min(45_000, deadline - Date.now()) });
              }
              await new Promise((resolve) => setTimeout(resolve, 350 * (attempt + 1)));
              if (!isCurrent()) return null;
            }
          }
        } catch (error) {
          if (isCurrent() && !(resumed && isTemporaryBackendError(error))) {
            if (!isTemporaryBackendError(error)) writeProfileSnapshot(backendURL, project, uid, null);
            setAccountProfile(null);
            setProfileError(profileErrorMessage(error));
          }
        } finally {
          if (profileRequest.current?.controller === controller) profileRequest.current = null;
          if (isCurrent()) setProfileLoading(false);
        }
        return null;
      })();
      profileRequest.current = { uid, controller, pending };
      return pending;
    },
    [backendURL],
  );

  const refreshClaims = useCallback(async (forceRefresh = false) => {
    const authClient = authRef.current;

    if (!authClient?.currentUser) {
      setClaims({});
      setClaimsLoading(false);
      return;
    }

    setClaimsLoading(true);
    const uid = authClient.currentUser.uid;

    try {
      const tokenResult = await withIdentityDeadline(authClient.currentUser.getIdTokenResult(forceRefresh));
      if (authClient.currentUser?.uid === uid) setClaims(tokenResult.claims as Record<string, unknown>);
    } finally {
      if (authClient.currentUser?.uid === uid) setClaimsLoading(false);
    }
  }, []);

  const loadAdminAccess = useCallback(
    async (currentUser: User) => {
      setAdminAccessLoading(true);
      setBackendAdminAccess(null);
      try {
        const token = await withIdentityDeadline(currentUser.getIdToken());
        const requestAccess = (timeoutMs: number) => apiJson<BackendAdminAccess>(
          `${backendURL}/admin/me`,
          {
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${token}`,
            },
            forceFresh: true,
            retries: 0,
            timeoutMs,
          },
        );
        const access = await requestAccess(8000);

        if (authRef.current?.currentUser?.uid === currentUser.uid) {
          setBackendAdminAccess(access);
        }
      } catch {
        // A 404 means a normal learner; a temporary backend failure falls back
        // to verified Firebase claims and the public emergency allow-list.
        if (authRef.current?.currentUser?.uid === currentUser.uid) {
          setBackendAdminAccess(null);
        }
      } finally {
        if (authRef.current?.currentUser?.uid === currentUser.uid) {
          setAdminAccessLoading(false);
        }
      }
    },
    [backendURL],
  );

  const loginWithGoogle = useCallback(async () => {
    const authClient = requireAuthClient();
    try {
      await signInWithPopup(authClient, createGoogleProvider());
    } catch (error) {
      if (shouldUseRedirectFallback(error)) {
        await signInWithRedirect(authClient, createGoogleProvider());
        return;
      }

      throw error;
    }
  }, [requireAuthClient]);

  const getRecaptchaVerifier = useCallback(async () => {
    const authClient = requireAuthClient();
    if (!recaptchaVerifierRef.current) {
      recaptchaVerifierRef.current = new RecaptchaVerifier(
        authClient,
        getRecaptchaContainer(),
        { size: "invisible" },
      );

      await recaptchaVerifierRef.current.render();
    }

    return recaptchaVerifierRef.current;
  }, [requireAuthClient]);

  const resetRecaptcha = useCallback(() => {
    recaptchaVerifierRef.current?.clear();
    recaptchaVerifierRef.current = null;
  }, []);

  const sendPhoneOtp = useCallback(
    async (phoneNumber: string) => {
      try {
        const normalizedPhone = phoneNumber.trim();
        const appVerifier = await getRecaptchaVerifier();

        confirmationResultRef.current = await signInWithPhoneNumber(
          requireAuthClient(),
          normalizedPhone,
          appVerifier,
        );
      } catch (error) {
        resetRecaptcha();
        throw error;
      }
    },
    [getRecaptchaVerifier, requireAuthClient, resetRecaptcha],
  );

  const verifyPhoneOtp = useCallback(async (otp: string) => {
    if (!confirmationResultRef.current) {
      throw new Error("OTP was not requested. Please send OTP again.");
    }

    await confirmationResultRef.current.confirm(otp.trim());
    confirmationResultRef.current = null;
  }, []);

  const logout = useCallback(async () => {
    const authClient = requireAuthClient();
    if (authClient.currentUser) {
      writeProfileSnapshot(backendURL, authClient.app.options.projectId || "", authClient.currentUser.uid, null);
    }
    profileRequest.current?.controller.abort();
    profileRequest.current = null;
    confirmationResultRef.current = null;
    manualSignOutRef.current = true;
    resetRecaptcha();
    setAccountProfile(null);
    setBackendAdminAccess(null);
    setAdminAccessLoading(false);
    setProfileError("");
    setSessionExpired(false);
    await signOut(authClient);
  }, [backendURL, requireAuthClient, resetRecaptcha]);

  const getIdToken = useCallback(async (forceRefresh = false) => {
    const authClient = authRef.current;
    if (!authClient?.currentUser) return null;
    return authClient.currentUser.getIdToken(forceRefresh);
  }, []);

  const getAuthHeaders = useCallback(async () => {
    const token = await getIdToken();

    return {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    };
  }, [getIdToken]);

  const refreshProfile = useCallback(async () => {
    const authClient = authRef.current;
    if (!authClient?.currentUser) {
      setAccountProfile(null);
      return null;
    }
    return loadProfile(authClient.currentUser, true);
  }, [loadProfile]);

  const saveProfile = useCallback(
    async (updates: ProfileUpdate) => {
      const currentUser = authRef.current?.currentUser;
      if (!currentUser) throw new Error("Your session has expired. Please sign in again.");

      setProfileError("");
      const token = await currentUser.getIdToken();
      const updatedProfile = await apiJson<BackendUserProfile>(
        `${backendURL}/profile/me`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify(updates),
          forceFresh: true,
          retries: 2,
          timeoutMs: 12000,
        },
      );
      if (authRef.current?.currentUser?.uid === currentUser.uid) {
        profileRequest.current?.controller.abort();
        profileRequest.current = null;
        writeProfileSnapshot(backendURL, authRef.current.app.options.projectId || "", currentUser.uid, updatedProfile);
        setAccountProfile(updatedProfile);
        setProfileLoading(false);
      }
      return updatedProfile;
    },
    [backendURL],
  );

  useEffect(() => {
    let authClient: Auth;
    authStateResolvedRef.current = false;

    try {
      authClient = getFirebaseAuth();
      authRef.current = authClient;
      setAuthError("");
      setAuthStartupMessage("");
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Sign-in is not configured. Please contact support.";

      authRef.current = null;
      setAuthError(message);
      setAuthLoading(false);
      setProfileLoading(false);
      setClaimsLoading(false);
      setAdminAccessLoading(false);
      return;
    }

    getRedirectResult(authClient).catch(() => undefined);

    const authStateTimeout = setTimeout(() => {
      if (authStateResolvedRef.current) return;
      // Keep the observer active: a late callback can still restore an
      // existing session. This only releases the UI from an endless loader.
      setAuthLoading(false);
      setProfileLoading(false);
      setAuthStartupMessage(AUTH_BOOTSTRAP_TIMEOUT_MESSAGE);
    }, AUTH_BOOTSTRAP_TIMEOUT_MS);

    const unsubscribe = onAuthStateChanged(authClient, async (currentUser) => {
      authStateResolvedRef.current = true;
      clearTimeout(authStateTimeout);
      setAuthStartupMessage("");
      setUser(currentUser);
      setAuthLoading(false);
      if (previousUser.current?.uid !== currentUser?.uid) {
        profileRequest.current?.controller.abort();
        profileRequest.current = null;
        setAccountProfile(null);
        if (previousUser.current && !currentUser) {
          writeProfileSnapshot(backendURL, authClient.app.options.projectId || "", previousUser.current.uid, null);
        }
      }
      previousUser.current = currentUser;

      if (!currentUser) {
        setSessionExpired(hasAuthenticatedRef.current && !manualSignOutRef.current);
        manualSignOutRef.current = false;
        setAccountProfile(null);
        setProfileError("");
        setProfileLoading(false);
        setClaims({});
        setClaimsLoading(false);
        setBackendAdminAccess(null);
        setAdminAccessLoading(false);
        return;
      }

      hasAuthenticatedRef.current = true;
      manualSignOutRef.current = false;
      setSessionExpired(false);
      setClaims({});
      setBackendAdminAccess(null);
      setClaimsLoading(true);
      setAdminAccessLoading(true);
      primeBackend(backendURL);
      await Promise.allSettled([refreshClaims(), loadProfile(currentUser), loadAdminAccess(currentUser)]);
    });

    return () => {
      clearTimeout(authStateTimeout);
      unsubscribe();
      profileRequest.current?.controller.abort();
      profileRequest.current = null;
    };
  }, [backendURL, loadAdminAccess, loadProfile, refreshClaims]);

  const { isAdmin, isFounderAdmin } = useMemo(
    () => resolveAdminAuthorization(user, claims, backendAdminAccess),
    [backendAdminAccess, claims, user],
  );
  const role: AuthRole = isAdmin ? "admin" : "user";
  const loading = !authError && (authLoading || profileLoading);
  const authorizationLoading = claimsLoading || adminAccessLoading;

  const profile = useMemo<AuthProfile | null>(() => {
    if (!user) return null;

    return {
      uid: user.uid,
      role,
      name: resolveDisplayName(accountProfile, user),
      email: user.email ?? "",
      phone: user.phoneNumber ?? "",
      photoURL: user.photoURL ?? "",
      provider: getProvider(user),
      classLevel: accountProfile?.class_level || "",
      onboardingCompleted: Boolean(accountProfile?.onboarding_completed),
    };
  }, [accountProfile, role, user]);

  const value = useMemo<AuthContextType>(
    () => ({
      user,
      profile,
      accountProfile,
      userId: user?.uid ?? "",
      role,
      isAdmin,
      isFounderAdmin,
      authError,
      authStartupMessage,
      authLoading,
      loading,
      sessionExpired,
      claimsLoading: authorizationLoading,
      claims,
      profileError,
      loginWithGoogle,
      sendPhoneOtp,
      verifyPhoneOtp,
      logout,
      refreshClaims,
      refreshProfile,
      saveProfile,
      getIdToken,
      getAuthHeaders,
    }),
    [
      user,
      profile,
      accountProfile,
      role,
      isAdmin,
      isFounderAdmin,
      authError,
      authStartupMessage,
      authLoading,
      loading,
      sessionExpired,
      authorizationLoading,
      claims,
      profileError,
      loginWithGoogle,
      sendPhoneOtp,
      verifyPhoneOtp,
      logout,
      refreshClaims,
      refreshProfile,
      saveProfile,
      getIdToken,
      getAuthHeaders,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);
