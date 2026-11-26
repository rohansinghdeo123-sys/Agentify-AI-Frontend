"use client";

import OnboardingShell from "@/components/onboarding/OnboardingShell";
import { AppIcon } from "@/components/ui/Polished";
import { useAuth } from "@/context/AuthContext";
import {
  CLASS_LEVELS,
  type ClassLevel,
  isValidDisplayName,
} from "@/lib/profile";
import { LEGAL_CONSENT_STORAGE_KEY, LEGAL_VERSION } from "@/lib/legal";
import { appFont } from "@/app/fonts";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, type ReactNode } from "react";

type OnboardingStep = 0 | 1 | 2;

function checkedRow(
  checked: boolean,
  onChange: (checked: boolean) => void,
  content: ReactNode,
) {
  return (
    <label className="onboarding-review-row">
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
      />
      <span className="onboarding-checkbox" aria-hidden="true">
        {checked ? <AppIcon name="check" /> : null}
      </span>
      <span>{content}</span>
    </label>
  );
}

export default function OnboardingPage() {
  const {
    user,
    accountProfile,
    profileError,
    loading,
    logout,
    refreshProfile,
    saveProfile,
  } = useAuth();
  const router = useRouter();
  const [step, setStep] = useState<OnboardingStep>(0);
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [privacyAccepted, setPrivacyAccepted] = useState(false);
  const [tipsAccepted, setTipsAccepted] = useState(false);
  const [displayName, setDisplayName] = useState("");
  const [classLevel, setClassLevel] = useState<ClassLevel>("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (loading) return;
    if (!user) {
      router.replace("/login");
      return;
    }
    if (accountProfile?.onboarding_completed) {
      router.replace("/dashboard");
    }
  }, [accountProfile, loading, router, user]);

  useEffect(() => {
    if (!accountProfile) return;
    setDisplayName(accountProfile.display_name || user?.displayName || "");
    setClassLevel(accountProfile.class_level || "");
  }, [accountProfile, user?.displayName]);

  const validName = useMemo(
    () => isValidDisplayName(displayName),
    [displayName],
  );
  const verifiedIdentity =
    user?.email || user?.phoneNumber || "your verified account";

  async function saveName() {
    if (!validName || saving) return;
    setSaving(true);
    setError("");
    try {
      await saveProfile({
        display_name: displayName.trim().replace(/\s+/g, " "),
        onboarding_completed: false,
      });
      setStep(2);
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "Your name could not be saved. Please try again.",
      );
    } finally {
      setSaving(false);
    }
  }

  async function finishOnboarding(nextClassLevel: ClassLevel) {
    if (saving) return;
    setSaving(true);
    setError("");
    try {
      await saveProfile({
        class_level: nextClassLevel,
        onboarding_completed: true,
      });
      router.replace("/dashboard");
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "Your class could not be saved. Please try again.",
      );
    } finally {
      setSaving(false);
    }
  }

  async function handleUseDifferentEmail() {
    await logout();
    router.replace("/login");
  }

  function recordLegalConsent() {
    try {
      localStorage.setItem(
        LEGAL_CONSENT_STORAGE_KEY,
        JSON.stringify({
          version: LEGAL_VERSION,
          termsAccepted,
          privacyAccepted,
          optionalProductTipsAccepted: tipsAccepted,
          recordedAt: new Date().toISOString(),
          scope: "device",
        }),
      );
    } catch {
      // Local consent storage is a UX aid. Backend consent auditing needs a separate API contract.
    }
  }

  if (loading) {
    return (
      <OnboardingShell
        step={0}
        title="Preparing your account"
        subtitle="Connecting your verified login to AgentifyAI."
        fontClassName={appFont.className}
      >
        <div className="onboarding-loading-card" role="status">
          <span />
          <p>Loading your profile...</p>
        </div>
      </OnboardingShell>
    );
  }

  if (profileError || !accountProfile) {
    return (
      <OnboardingShell
        step={0}
        title="Let's reconnect your profile"
        subtitle="Your login is verified. We just need the profile service to respond."
        fontClassName={appFont.className}
      >
        <div className="onboarding-form-card onboarding-error-card">
          <AppIcon name="history" />
          <p>{profileError || "Your profile is not available yet."}</p>
          <button
            type="button"
            className="onboarding-primary"
            onClick={() => void refreshProfile()}
          >
            Retry connection
          </button>
        </div>
      </OnboardingShell>
    );
  }

  if (step === 0) {
    const canCreate = termsAccepted && privacyAccepted;
    return (
      <OnboardingShell
        step={step}
        title="Let's create your AgentifyAI account"
        subtitle="A few things for you to review"
        fontClassName={appFont.className}
        footer={
          <>
            <p>Email verified as <strong>{verifiedIdentity}</strong></p>
            <button type="button" onClick={() => void handleUseDifferentEmail()}>
              Use a different email
            </button>
          </>
        }
      >
        <div className="onboarding-review-card">
          <div className="onboarding-review-list">
            {checkedRow(
              termsAccepted,
              (checked) => {
                setTermsAccepted(checked);
                setError("");
              },
              <>
                <span className="mr-2 rounded-full bg-[#0E7490]/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.12em] text-[#0E7490]">
                  Required
                </span>
                I agree to AgentifyAI{" "}
                <Link href="/terms" target="_blank">Terms</Link> and{" "}
                <Link href="/terms#acceptable-use" target="_blank">
                  Acceptable Use Policy
                </Link>.
              </>,
            )}
            {checkedRow(
              privacyAccepted,
              (checked) => {
                setPrivacyAccepted(checked);
                setError("");
              },
              <>
                <span className="mr-2 rounded-full bg-[#0E7490]/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.12em] text-[#0E7490]">
                  Required
                </span>
                I consent to collection and use of my personal information in
                accordance with the{" "}
                <Link href="/privacy" target="_blank">Privacy Policy</Link>.
              </>,
            )}
            {checkedRow(
              tipsAccepted,
              (checked) => {
                setTipsAccepted(checked);
                setError("");
              },
              <>
                <span className="mr-2 rounded-full bg-slate-500/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--agentify-muted-text)]">
                  Optional
                </span>
                Send me occasional learning tips and product updates. This is
                optional and does not affect my account.
              </>,
            )}
          </div>
          {error ? (
            <p className="onboarding-inline-error" role="alert">
              {error}
            </p>
          ) : null}
          <button
            type="button"
            className="onboarding-primary"
            aria-disabled={!canCreate}
            onClick={() => {
              if (!canCreate) {
                setError("Accept the required Terms and Privacy Policy to create your account.");
                return;
              }
              recordLegalConsent();
              setError("");
              setStep(1);
            }}
          >
            Create account
          </button>
        </div>
      </OnboardingShell>
    );
  }

  if (step === 1) {
    return (
      <OnboardingShell
        step={step}
        title="What's your name?"
        subtitle="So AgentifyAI knows what to call you."
        fontClassName={appFont.className}
      >
        <form
          className="onboarding-form"
          onSubmit={(event) => {
            event.preventDefault();
            void saveName();
          }}
        >
          <label className="sr-only" htmlFor="onboarding-name">
            Your name
          </label>
          <input
            id="onboarding-name"
            type="text"
            autoComplete="name"
            autoFocus
            maxLength={80}
            value={displayName}
            onChange={(event) => {
              setDisplayName(event.target.value);
              setError("");
            }}
            placeholder="Enter your name"
            className={error ? "has-error" : ""}
          />
          {error ? <p className="onboarding-inline-error">{error}</p> : null}
          <button
            type="submit"
            className="onboarding-primary"
            disabled={!validName || saving}
          >
            {saving ? "Saving..." : "Continue"}
          </button>
        </form>
      </OnboardingShell>
    );
  }

  return (
    <OnboardingShell
      step={step}
      title="Which class are you currently studying in?"
      subtitle="This helps AgentifyAI personalize your notes, revision, exams, analytics, and study path."
      fontClassName={appFont.className}
    >
      <div className="onboarding-form">
        <label className="sr-only" htmlFor="onboarding-class">
          Select your class
        </label>
        <div className="onboarding-select-wrap">
          <select
            id="onboarding-class"
            value={classLevel}
            onChange={(event) => {
              setClassLevel(event.target.value as ClassLevel);
              setError("");
            }}
          >
            <option value="">Select your class</option>
            {CLASS_LEVELS.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
          <span className="onboarding-select-chevron" aria-hidden="true" />
        </div>
        {error ? <p className="onboarding-inline-error">{error}</p> : null}
        <button
          type="button"
          className="onboarding-primary"
          disabled={!classLevel || saving}
          onClick={() => void finishOnboarding(classLevel)}
        >
          {saving ? "Saving..." : "Continue"}
        </button>
        <button
          type="button"
          className="onboarding-later"
          disabled={saving}
          onClick={() => void finishOnboarding("")}
        >
          Set up later
        </button>
      </div>
    </OnboardingShell>
  );
}
