import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function source(path: string) {
  return readFileSync(join(process.cwd(), path), "utf8");
}

describe("founder admin console", () => {
  it("uses backend-verified founder authorization instead of a client-only email gate", () => {
    const page = source("app/dashboard/internal/admin/page.tsx");
    const auth = source("context/AuthContext.tsx");

    expect(page).toContain("isFounderAdmin");
    expect(page).not.toContain("allowedEmails.includes");
    expect(auth).toContain('`${backendURL}/admin/me`');
    expect(auth).toContain("backendAccess?.verified === true");
    expect(auth).toContain("backendAccess?.founder === true");
  });

  it("respects the selected theme and keeps operational text readable", () => {
    const files = [
      source("app/dashboard/internal/admin/page.tsx"),
      source("components/admin/HealthBadge.tsx"),
      source("components/admin/DataIngestionReport.tsx"),
    ];
    const combined = files.join("\n");

    expect(files[0]).toContain("<ThemeToggle compact />");
    expect(files[0]).not.toContain('data-theme="dark"');
    expect(combined).not.toMatch(/text-\[(?:9|10)px\]/);
    expect(files[0]).toContain("min-h-11");
    expect(files[1]).toContain("min-h-8");
  });

  it("keeps the console focused on agent operations and curriculum evidence", () => {
    const page = source("app/dashboard/internal/admin/page.tsx");
    const report = source("components/admin/DataIngestionReport.tsx");

    expect(page).toContain('id="agent-operations"');
    expect(page).toContain('id="curriculum-evidence"');
    expect(page).toContain("Agent health and activity");
    expect(page).toContain("Ingested curriculum evidence");
    expect(page).not.toContain('label="Students"');
    expect(page).not.toContain("Model traces");
    expect(page).not.toContain("Audit log");
    expect(page).not.toContain("estimated_cost_usd");
    expect(page).toContain('"/admin/evidence/overview?hours=24"');
    expect(page).toContain('"/admin/evidence/content?limit=100"');
    expect(page).toContain('"/admin/evidence/activity?hours=24&limit=50"');
    expect(page).toContain("`/admin/evidence/content/${chapterId}?limit=100`");
    expect(page).not.toContain('"/admin/console"');
    expect(page).not.toContain('"/admin/content/ingestion-report"');
    expect(page).toContain('href="/dashboard"');
    expect(page).toContain("flex flex-wrap gap-2 pb-1");
    expect(page).toContain("Activity evidence is unavailable");
    expect(page).toContain("Showing the last verified snapshot");
    expect(report).toContain("Verified source pages");
    expect(report).toContain("Curriculum release");
    expect(report).toContain("Retrieval contract");
    expect(report).toContain("Learning units and source references");
    expect(report).not.toContain("<table");
  });

  it("lets signed-in internal routes render before student profile and onboarding gates", () => {
    const layout = source("app/dashboard/layout.tsx");
    const internalGate = layout.indexOf("if (isAdminRoute) {");
    const profileGate = layout.indexOf("if (profileError || !accountProfile)");
    const onboardingGate = layout.indexOf("if (!accountProfile.onboarding_completed) return null;");

    expect(internalGate).toBeGreaterThan(-1);
    expect(internalGate).toBeLessThan(profileGate);
    expect(internalGate).toBeLessThan(onboardingGate);
    expect(layout).toContain("Internal pages own their backend-verified role checks");
  });
});
