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
});
