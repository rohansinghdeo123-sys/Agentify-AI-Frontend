"use client";

import { useAuth } from "@/context/AuthContext";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Fraunces } from "next/font/google";
import { useEffect, useMemo, useRef, useState } from "react";
import ThemeToggle from "@/components/ThemeToggle";
import ChatThinkingLogo from "@/components/brand/ChatThinkingLogo";
import { AlertState, AppIcon, LoadingState } from "@/components/ui/Polished";
import { primeBackend } from "@/lib/apiClient";

const displayFont = Fraunces({
  subsets: ["latin"],
  display: "swap",
  style: ["normal", "italic"],
  weight: ["400", "500", "600"],
});

// ─── Utility functions ─────────────────────────────────────────────────────
function cn(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(" ");
}

function normalizePhoneNumber(value: string) {
  const trimmed = value.trim();
  if (trimmed.startsWith("+")) return trimmed.replace(/\s+/g, "");
  const digits = trimmed.replace(/\D/g, "");
  if (digits.length === 10) return `+91${digits}`;
  if (digits.startsWith("91") && digits.length === 12) return `+${digits}`;
  return trimmed;
}

function getErrorSignature(error: unknown) {
  if (typeof error === "object" && error !== null && "code" in error) {
    const code = (error as { code?: unknown }).code;
    if (typeof code === "string") return code;
  }

  return error instanceof Error ? error.message : String(error);
}

function getErrorMessage(error: unknown) {
  const signature = getErrorSignature(error);
  if (signature.includes("auth/unauthorized-domain")) {
    return "This website isn't authorized for sign-in yet. Please contact support.";
  }
  if (signature.includes("auth/popup-blocked")) {
    return "Your browser blocked the Google sign-in window. Allow popups for this site and try again.";
  }
  if (signature.includes("auth/popup-closed-by-user")) {
    return "The Google sign-in window was closed before finishing. Try again whenever you're ready.";
  }
  if (signature.includes("auth/cancelled-popup-request")) {
    return "Another sign-in window is already open. Close it and try once more.";
  }
  if (signature.includes("auth/operation-not-supported-in-this-environment")) {
    return "Google sign-in needs a regular browser window. Open this page in Chrome or Safari and try again.";
  }
  if (signature.includes("auth/network-request-failed")) {
    return "We couldn't reach the sign-in service. Check your internet connection and try again.";
  }
  if (signature.includes("auth/configuration-not-found")) {
    return "Sign-in isn't fully set up yet. Please try again in a little while.";
  }
  if (
    signature.includes("Firebase auth configuration is incomplete") ||
    signature.includes("Sign-in is not ready")
  ) {
    return signature;
  }
  if (signature.includes("auth/invalid-phone-number")) {
    return "That phone number doesn't look right. Use the full format, like +91 98765 43210.";
  }
  if (signature.includes("auth/too-many-requests")) {
    return "Too many attempts for now. Wait a few minutes, then try again.";
  }
  if (signature.includes("auth/invalid-verification-code")) {
    return "That code didn't match. Check the SMS and try again.";
  }
  if (signature.includes("auth/code-expired")) {
    return "That code has expired. Send a new one and try again.";
  }
  return "Sign-in didn't go through. Please try again.";
}

const RESEND_COOLDOWN_SECONDS = 30;

// ─── Segmented one-time-code input ──────────────────────────────────────────
function OtpBoxes({
  value,
  disabled,
  invalid,
  onChange,
  onComplete,
  firstInputRef,
}: {
  value: string;
  disabled?: boolean;
  invalid?: boolean;
  onChange: (next: string) => void;
  onComplete: (code: string) => void;
  firstInputRef?: React.MutableRefObject<HTMLInputElement | null>;
}) {
  const LENGTH = 6;
  const refs = useRef<Array<HTMLInputElement | null>>([]);
  const chars = Array.from({ length: LENGTH }, (_, index) => value[index]?.trim() ?? "");

  const emit = (nextChars: string[]) => {
    // Keep an edited slot in place so later digits do not shift and submit a different code.
    const joined = nextChars.map((digit) => digit || " ").join("").slice(0, LENGTH).trimEnd();
    onChange(joined);
    if (/^\d{6}$/.test(joined)) onComplete(joined);
    return joined;
  };

  const handleChange = (index: number, raw: string) => {
    const digits = raw.replace(/\D/g, "");
    const next = chars.slice();
    if (!digits) {
      next[index] = "";
      emit(next);
      return;
    }
    let cursor = index;
    for (const digit of digits.split("")) {
      if (cursor >= LENGTH) break;
      next[cursor] = digit;
      cursor += 1;
    }
    emit(next);
    refs.current[Math.min(cursor, LENGTH - 1)]?.focus();
  };

  const handleKeyDown = (index: number, event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Backspace" && !chars[index] && index > 0) {
      event.preventDefault();
      const next = chars.slice();
      next[index - 1] = "";
      emit(next);
      refs.current[index - 1]?.focus();
    } else if (event.key === "ArrowLeft" && index > 0) {
      refs.current[index - 1]?.focus();
    } else if (event.key === "ArrowRight" && index < LENGTH - 1) {
      refs.current[index + 1]?.focus();
    }
  };

  const handlePaste = (event: React.ClipboardEvent<HTMLInputElement>) => {
    const pasted = event.clipboardData.getData("text").replace(/\D/g, "").slice(0, LENGTH);
    if (!pasted) return;
    event.preventDefault();
    const joined = emit(Array.from({ length: LENGTH }, (_, index) => pasted[index] ?? ""));
    refs.current[Math.min(joined.length, LENGTH - 1)]?.focus();
  };

  return (
    <div className="auth-otp-group" role="group" aria-label="6-digit verification code">
      {chars.map((char, index) => (
        <input
          key={index}
          ref={(element) => {
            refs.current[index] = element;
            if (index === 0 && firstInputRef) firstInputRef.current = element;
          }}
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          maxLength={index === 0 ? LENGTH : 1}
          autoComplete={index === 0 ? "one-time-code" : "off"}
          disabled={disabled}
          value={char}
          aria-label={`Digit ${index + 1}`}
          aria-invalid={invalid || undefined}
          aria-describedby={invalid ? "login-auth-error" : undefined}
          onChange={(event) => handleChange(index, event.target.value)}
          onKeyDown={(event) => handleKeyDown(index, event)}
          onPaste={handlePaste}
          className="auth-otp-box"
        />
      ))}
    </div>
  );
}

// ─── Main Login Page Component ──────────────────────────────────────────────
export default function LoginPage() {
  const {
    user,
    accountProfile,
    authError: authSetupError,
    profileError,
    loginWithGoogle,
    sendPhoneOtp,
    verifyPhoneOtp,
    loading,
    sessionExpired,
  } = useAuth();
  const router = useRouter();
  const backendURL = process.env.NEXT_PUBLIC_BACKEND_URL || "http://127.0.0.1:8000";

  const [phoneNumber, setPhoneNumber] = useState("");
  const [otp, setOtp] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [usePhone, setUsePhone] = useState(false);
  const [authError, setAuthError] = useState("");
  const [sendingOtp, setSendingOtp] = useState(false);
  const [verifyingOtp, setVerifyingOtp] = useState(false);
  const [resendIn, setResendIn] = useState(0);
  const [shake, setShake] = useState(false);
  const [granted, setGranted] = useState(false);
  const [googleBusy, setGoogleBusy] = useState(false);
  const otpInputRef = useRef<HTMLInputElement>(null);
  const phoneInputRef = useRef<HTMLInputElement>(null);

  const formattedPhone = useMemo(() => normalizePhoneNumber(phoneNumber), [phoneNumber]);
  const signInBlocked = Boolean(authSetupError);
  const visibleAuthError =
    authSetupError ||
    authError ||
    (sessionExpired ? "Your session expired. Sign in again to continue studying." : "");

  useEffect(() => {
    router.prefetch("/dashboard");
    router.prefetch("/onboarding");
    primeBackend(backendURL);
  }, [backendURL, router]);

  useEffect(() => {
    if (!loading && user && accountProfile && !profileError) {
      setGranted(true);
      primeBackend(backendURL);
      router.replace(accountProfile.onboarding_completed ? "/dashboard" : "/onboarding");
    }
  }, [accountProfile, backendURL, user, loading, profileError, router]);

  useEffect(() => {
    if (!loading && user && profileError) {
      setAuthError("We could not load your AgentifyAI profile. Please try signing in again.");
    }
  }, [loading, profileError, user]);

  useEffect(() => {
    if (authError) {
      setShake(true);
      const timer = setTimeout(() => setShake(false), 500);
      return () => clearTimeout(timer);
    }
  }, [authError]);

  useEffect(() => {
    if (!otpSent || resendIn <= 0) return;
    const timer = setTimeout(() => setResendIn((value) => Math.max(0, value - 1)), 1000);
    return () => clearTimeout(timer);
  }, [otpSent, resendIn]);

  useEffect(() => {
    if (otpSent) otpInputRef.current?.focus();
    else if (usePhone) phoneInputRef.current?.focus();
  }, [otpSent, usePhone]);

  const handleGoogleLogin = async () => {
    setAuthError("");
    if (authSetupError) {
      setAuthError(authSetupError);
      return;
    }
    setGoogleBusy(true);
    try {
      primeBackend(backendURL);
      await loginWithGoogle();
    } catch (error) {
      setAuthError(getErrorMessage(error));
    } finally {
      setGoogleBusy(false);
    }
  };

  const handleSendOtp = async () => {
    setAuthError("");
    if (authSetupError) {
      setAuthError(authSetupError);
      return;
    }
    if (!formattedPhone.startsWith("+") || formattedPhone.length < 10) {
      setAuthError("Enter your mobile number with the country code, like +91 98765 43210.");
      return;
    }
    try {
      primeBackend(backendURL);
      setSendingOtp(true);
      await sendPhoneOtp(formattedPhone);
      setOtpSent(true);
      setOtp("");
      setResendIn(RESEND_COOLDOWN_SECONDS);
    } catch (error) {
      setAuthError(getErrorMessage(error));
    } finally {
      setSendingOtp(false);
    }
  };

  const handleVerifyOtp = async (codeOverride?: string) => {
    setAuthError("");
    const code = (codeOverride ?? otp).trim();
    if (!/^\d{6}$/.test(code)) {
      setAuthError("Enter the 6-digit code from the SMS.");
      return;
    }
    try {
      primeBackend(backendURL);
      setVerifyingOtp(true);
      await verifyPhoneOtp(code);
    } catch (error) {
      setAuthError(getErrorMessage(error));
    } finally {
      setVerifyingOtp(false);
    }
  };

  const handlePhoneSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (otpSent) {
      void handleVerifyOtp();
    } else {
      void handleSendOtp();
    }
  };

  const handleBack = () => {
    setOtpSent(false);
    setOtp("");
    setResendIn(0);
    setAuthError("");
    if (!otpSent) setUsePhone(false);
  };

  if (loading) {
    return (
      <main id="main-content">
        <LoadingState title="Preparing secure sign in..." detail="Opening your private AgentifyAI study workspace." />
      </main>
    );
  }

  return (
    <div className="auth-scene auth-scene-final flex min-h-[100dvh] flex-col antialiased">
      <div className="auth-final-backdrop" aria-hidden="true" />

      <header className="auth-header-final flex items-center justify-between px-5 py-5 sm:px-8 sm:py-6 lg:px-12">
        <Link href="/" aria-label="AgentifyAI home" className="auth-brand-lockup group inline-flex items-center gap-3.5">
          <ChatThinkingLogo
            state="thinking"
            size={46}
            className="auth-brand-logo"
            label="AgentifyAI"
          />
          <span className="leading-none">
            <span className="auth-brand-name block text-xl font-extrabold tracking-normal">
              Agentify<span>AI</span>
            </span>
            <span className="auth-brand-tagline mt-1.5 block text-[11px] font-semibold tracking-[0.02em]">
              Your personal study agent
            </span>
          </span>
        </Link>
        <ThemeToggle compact />
      </header>

      <main id="main-content" className="auth-center relative mx-auto flex w-full max-w-[48rem] flex-1 items-center justify-center px-5 py-7 sm:px-8 sm:py-10">
        <section aria-label="Sign in to AgentifyAI" className="auth-hero flex w-full flex-col items-center text-center">
          {!granted ? (
            <>
              <p className="auth-kicker inline-flex items-center gap-2 rounded-full px-3.5 py-1.5 text-[11px] font-bold uppercase tracking-[0.16em]">
                <span aria-hidden="true" />
                Built for focused students
              </p>
              <h1 className={cn("auth-title mt-5 max-w-[13ch] text-[2.7rem] font-medium leading-[1.02] sm:text-[3.65rem]", displayFont.className)}>
                Your personal AI agent <em>for school.</em>
              </h1>
              <p className="auth-lede mt-5 max-w-[38rem] text-[15px] leading-7 sm:text-[17px]">
                Ask doubts, launch Autonomous Missions, and continue every study session with an agent
                that remembers what you need next.
              </p>

              <ul className="auth-proof-row mt-6 grid w-full max-w-[41rem] grid-cols-1 gap-2.5 sm:grid-cols-3">
                {[
                  {
                    icon: "spark" as const,
                    title: "Personal agent",
                    detail: "Adapts to your pace",
                  },
                  {
                    icon: "mission" as const,
                    title: "Autonomous Mission",
                    detail: "Plans your next step",
                  },
                  {
                    icon: "book" as const,
                    title: "Course-grounded",
                    detail: "Explains what you study",
                  },
                ].map((item) => (
                  <li key={item.title} className="auth-proof-item flex items-center gap-3 rounded-2xl px-3.5 py-3 text-left">
                    <span className="auth-proof-icon flex h-9 w-9 shrink-0 items-center justify-center rounded-xl">
                      <AppIcon name={item.icon} className="h-[1.05rem] w-[1.05rem]" />
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-[12px] font-bold">{item.title}</span>
                      <span className="mt-0.5 block truncate text-[10.5px] font-medium">{item.detail}</span>
                    </span>
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <>
              <p className="auth-kicker inline-flex items-center gap-2 rounded-full px-3.5 py-1.5 text-[11px] font-bold uppercase tracking-[0.16em]">
                <span aria-hidden="true" />
                Secure access confirmed
              </p>
              <h1 className={cn("auth-title mt-5 text-[2.7rem] font-medium leading-[1.02] sm:text-[3.65rem]", displayFont.className)}>
                Welcome <em>back.</em>
              </h1>
              <p className="auth-lede mt-4 text-[15px] leading-7 sm:text-[17px]">
                Opening your private study workspace.
              </p>
            </>
          )}

          <div
            className={cn(
              "auth-login-panel mt-7 w-full max-w-[25rem] rounded-[1.65rem] p-5 text-left sm:p-6",
              shake && "animate-shake",
            )}
          >
            {granted ? (
              <div className="flex flex-col items-center py-5 text-center" role="status" aria-live="polite">
                <span className="auth-success-badge flex h-14 w-14 items-center justify-center rounded-full">
                  <AppIcon name="check" className="h-6 w-6" />
                </span>
                <p className="mt-4 text-sm font-bold text-[var(--agentify-primary-text)]">You&apos;re in.</p>
                <p className="mt-1 text-xs leading-5 text-[var(--agentify-muted-text)]">
                  Restoring your sessions and progress.
                </p>
                <div className="mx-auto mt-5 w-full max-w-[13rem] space-y-2">
                  <span className="polished-skeleton block h-2.5 w-full rounded-full" />
                  <span className="polished-skeleton mx-auto block h-2.5 w-3/4 rounded-full" />
                </div>
              </div>
            ) : (
              <>
                <div className="mb-5 text-center">
                  <h2 className="auth-panel-heading text-lg font-extrabold tracking-normal">
                    {usePhone ? (otpSent ? "Enter your verification code" : "Continue with your phone") : "Continue your learning"}
                  </h2>
                  <p className="auth-panel-subtitle mt-1.5 text-xs leading-5">
                    {usePhone
                      ? otpSent
                        ? `We sent a 6-digit code to ${formattedPhone}.`
                        : "We will text you a secure one-time code."
                      : "Sign in with Google or a one-time phone code."}
                  </p>
                </div>

                {!usePhone ? (
                  <div className="space-y-3.5">
                    <button
                      type="button"
                      onClick={handleGoogleLogin}
                      disabled={googleBusy || signInBlocked}
                      aria-busy={googleBusy}
                      className="auth-google flex min-h-[3.35rem] w-full items-center justify-center gap-3 rounded-2xl px-5 text-[0.95rem] font-semibold"
                    >
                      {googleBusy ? (
                        <span className="auth-spinner" aria-hidden="true" />
                      ) : (
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" className="h-5 w-5" aria-hidden="true">
                          <path fill="#FFC107" d="M43.611 20.083h-1.611V20H24v8h11.303C33.646 32.657 29.202 36 24 36c-6.627 0-12-5.373-12-12s5.373-12 12-12c3.061 0 5.856 1.153 7.982 3.045l5.657-5.657C34.133 6.053 29.32 4 24 4 12.955 4 4 12.955 4 24s8.955 20 20 20 20-8.955 20-20c0-1.341-.138-2.651-.389-3.917z" />
                          <path fill="#FF3D00" d="M6.306 14.691l6.571 4.817C14.548 16.108 18.961 13 24 13c3.061 0 5.856 1.153 7.982 3.045l5.657-5.657C34.133 6.053 29.32 4 24 4 16.318 4 9.656 8.337 6.306 14.691z" />
                          <path fill="#4CAF50" d="M24 44c5.153 0 9.86-1.977 13.411-5.197l-6.19-5.238C29.219 35.091 26.715 36 24 36c-5.18 0-9.614-3.317-11.231-7.946l-6.527 5.033C9.555 39.556 16.271 44 24 44z" />
                          <path fill="#1976D2" d="M43.611 20.083h-1.611V20H24v8h11.303c-1.15 3.388-4.292 6-8.303 6-5.18 0-9.614-3.317-11.231-7.946l-6.527 5.033C9.555 39.556 16.271 44 24 44c11.045 0 20-8.955 20-20 0-1.341-.138-2.651-.389-3.917z" />
                        </svg>
                      )}
                      {googleBusy ? "Opening Google sign-in..." : "Continue with Google"}
                    </button>

                    <div className="auth-divider" aria-hidden="true">or</div>

                    <button
                      type="button"
                      onClick={() => setUsePhone(true)}
                      disabled={googleBusy || signInBlocked}
                      className="auth-secondary flex min-h-[3.15rem] w-full items-center justify-center gap-2 rounded-2xl text-sm font-semibold"
                    >
                      <AppIcon name="send" className="h-4 w-4" />
                      Continue with phone
                    </button>
                  </div>
                ) : (
                  <form className="space-y-3" onSubmit={handlePhoneSubmit} noValidate>
                    {!otpSent ? (
                      <label className="block" htmlFor="login-phone-number">
                        <span className="mb-1.5 block text-xs font-semibold text-[var(--agentify-muted-text)]">
                          Mobile number
                        </span>
                        <input
                          ref={phoneInputRef}
                          id="login-phone-number"
                          name="phone"
                          type="tel"
                          inputMode="tel"
                          autoComplete="tel"
                          disabled={sendingOtp || signInBlocked}
                          value={phoneNumber}
                          onChange={(event) => setPhoneNumber(event.target.value)}
                          placeholder="+91 98765 43210"
                          aria-label="Mobile number"
                          aria-invalid={Boolean(visibleAuthError) || undefined}
                          aria-describedby={visibleAuthError ? "login-auth-error" : undefined}
                          className="auth-field w-full rounded-2xl px-4 py-3.5 text-base font-medium outline-none transition"
                        />
                      </label>
                    ) : (
                      <OtpBoxes
                        value={otp}
                        disabled={verifyingOtp || signInBlocked}
                        invalid={Boolean(visibleAuthError)}
                        onChange={(next) => setOtp(next)}
                        onComplete={(code) => void handleVerifyOtp(code)}
                        firstInputRef={otpInputRef}
                      />
                    )}

                    <button
                      type="submit"
                      disabled={sendingOtp || verifyingOtp || signInBlocked}
                      aria-busy={sendingOtp || verifyingOtp}
                      className="auth-primary flex min-h-[3.35rem] w-full items-center justify-center gap-2 rounded-2xl px-5 text-[0.95rem] font-semibold"
                    >
                      {otpSent
                        ? verifyingOtp
                          ? "Verifying..."
                          : "Verify and continue"
                        : sendingOtp
                          ? "Sending code..."
                          : "Send code"}
                      {!sendingOtp && !verifyingOtp ? <AppIcon name="arrowRight" className="h-4 w-4" /> : null}
                    </button>

                    <div className="flex items-center justify-between">
                      <button type="button" onClick={handleBack} disabled={sendingOtp || verifyingOtp} className="auth-ghost px-3 py-2 text-sm font-semibold">
                        {otpSent ? "Change number" : "Back"}
                      </button>
                      {otpSent ? (
                        <button
                          type="button"
                          onClick={handleSendOtp}
                          disabled={resendIn > 0 || sendingOtp || verifyingOtp || signInBlocked}
                          className="auth-ghost px-3 py-2 text-sm font-semibold"
                        >
                          {resendIn > 0 ? `Resend in ${resendIn}s` : sendingOtp ? "Sending..." : "Resend code"}
                        </button>
                      ) : null}
                    </div>
                  </form>
                )}

                {visibleAuthError ? (
                  <div id="login-auth-error" className="mt-4">
                    <AlertState message={visibleAuthError} />
                  </div>
                ) : null}

                <div id="recaptcha-container" />

                <div className="auth-panel-trust mt-5 flex items-center justify-center gap-4 border-t pt-4 text-[10.5px] font-semibold">
                  <span className="inline-flex items-center gap-1.5">
                    <AppIcon name="check" className="h-3.5 w-3.5" />
                    Private progress
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <AppIcon name="check" className="h-3.5 w-3.5" />
                    Secure sign-in
                  </span>
                </div>
              </>
            )}
          </div>

          {!granted ? (
            <p className="auth-legal mt-5 text-[11px] leading-5">
              By continuing, you agree to AgentifyAI&apos;s{" "}
              <Link href="/terms" className="font-bold underline-offset-2 hover:underline">Terms</Link>
              {" "}and{" "}
              <Link href="/privacy" className="font-bold underline-offset-2 hover:underline">Privacy Policy</Link>.
            </p>
          ) : null}
        </section>
      </main>

      <footer className="auth-footer-final px-5 pb-5 text-center text-[10.5px] font-semibold tracking-[0.02em] sm:pb-6">
        Personal Agent <span aria-hidden="true">-</span> Autonomous Missions <span aria-hidden="true">-</span> Study Lab
      </footer>

      <style jsx global>{`
        @keyframes shake {
          0%, 100% { transform: translateX(0); }
          10%, 30%, 50%, 70%, 90% { transform: translateX(-4px); }
          20%, 40%, 60%, 80% { transform: translateX(4px); }
        }
        .animate-shake {
          animation: shake 0.5s ease-in-out;
        }
        @media (prefers-reduced-motion: reduce) {
          .animate-shake {
            animation: none;
          }
        }
      `}</style>
    </div>
  );
}
