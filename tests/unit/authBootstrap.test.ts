import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  AUTH_BOOTSTRAP_TIMEOUT_MESSAGE,
  AUTH_BOOTSTRAP_TIMEOUT_MS,
} from "@/lib/authBootstrap";

const context = readFileSync(resolve(process.cwd(), "context/AuthContext.tsx"), "utf8");

describe("authentication bootstrap recovery", () => {
  it("releases a stalled Firebase startup without blocking sign-in", () => {
    expect(AUTH_BOOTSTRAP_TIMEOUT_MS).toBeGreaterThanOrEqual(8_000);
    expect(AUTH_BOOTSTRAP_TIMEOUT_MS).toBeLessThanOrEqual(15_000);
    expect(AUTH_BOOTSTRAP_TIMEOUT_MESSAGE).toContain("sign in below");
    expect(context).toContain("authStateTimeout = setTimeout");
    expect(context).toContain("setAuthLoading(false)");
    expect(context).toContain("setAuthStartupMessage(AUTH_BOOTSTRAP_TIMEOUT_MESSAGE)");
    expect(context).toContain("clearTimeout(authStateTimeout)");
  });

  it("lets a late Firebase callback recover the existing session", () => {
    const callback = context.slice(
      context.indexOf("const unsubscribe = onAuthStateChanged"),
      context.indexOf("return () =>", context.indexOf("const unsubscribe = onAuthStateChanged")),
    );
    expect(callback).toContain("authStateResolvedRef.current = true");
    expect(callback).toContain("setAuthStartupMessage(\"\")");
    expect(callback).toContain("setUser(currentUser)");
  });
});
