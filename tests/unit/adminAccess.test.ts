import type { User } from "firebase/auth";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  isAdminUser,
  isFounderUser,
  resolveAdminAuthorization,
} from "@/context/AuthContext";

function firebaseUser(fields: Partial<User>): User {
  return fields as User;
}

const AMIT_EMAIL = "amit.kumarmunda4@gmail.com";
const ROHAN_EMAIL = "rohan.singhdeo123@gmail.com";

describe("admin access", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("treats a founder-only allow-listed email as an admin", () => {
    vi.stubEnv("NEXT_PUBLIC_ADMIN_EMAILS", "");
    vi.stubEnv("NEXT_PUBLIC_FOUNDER_ADMIN_EMAILS", `founder@example.com, ${AMIT_EMAIL.toUpperCase()} `);

    expect(
      isAdminUser(firebaseUser({ uid: "amit-uid", email: AMIT_EMAIL }), {}),
    ).toBe(true);
    expect(
      isFounderUser(firebaseUser({ uid: "amit-uid", email: AMIT_EMAIL }), {}),
    ).toBe(true);
  });

  it("uses verified backend authorization when the compiled client allow-list is absent", () => {
    vi.stubEnv("NEXT_PUBLIC_ADMIN_EMAILS", "");
    vi.stubEnv("NEXT_PUBLIC_FOUNDER_ADMIN_EMAILS", "");

    expect(resolveAdminAuthorization(
      firebaseUser({ uid: "amit-uid", email: AMIT_EMAIL }),
      {},
      { role: "admin", founder: true, verified: true },
    )).toEqual({ isAdmin: true, isFounderAdmin: true });
  });

  it("keeps both product-owner entries discoverable while the backend wakes", () => {
    vi.stubEnv("NEXT_PUBLIC_ADMIN_EMAILS", "");
    vi.stubEnv("NEXT_PUBLIC_FOUNDER_ADMIN_EMAILS", "");

    for (const email of [AMIT_EMAIL, ROHAN_EMAIL]) {
      const user = firebaseUser({ uid: `${email}-uid`, email });
      expect(isAdminUser(user, {})).toBe(true);
      expect(isFounderUser(user, {})).toBe(true);
    }
  });

  it("does not trust an unverified admin response", () => {
    vi.stubEnv("NEXT_PUBLIC_ADMIN_EMAILS", "");
    vi.stubEnv("NEXT_PUBLIC_FOUNDER_ADMIN_EMAILS", "");

    expect(resolveAdminAuthorization(
      firebaseUser({ uid: "unknown-uid", email: "unknown@example.com" }),
      {},
      { role: "admin", founder: true, verified: false },
    )).toEqual({ isAdmin: false, isFounderAdmin: false });
  });

  it("preserves general email, uid, phone, and custom-claim access", () => {
    vi.stubEnv("NEXT_PUBLIC_ADMIN_EMAILS", "admin@example.com");
    vi.stubEnv("NEXT_PUBLIC_ADMIN_UIDS", "uid-admin");
    vi.stubEnv("NEXT_PUBLIC_ADMIN_PHONES", "+919999999999");
    vi.stubEnv("NEXT_PUBLIC_FOUNDER_ADMIN_EMAILS", "founder@example.com");

    expect(isAdminUser(firebaseUser({ uid: "user-1", email: "admin@example.com" }), {})).toBe(true);
    expect(isAdminUser(firebaseUser({ uid: "uid-admin", email: "user@example.com" }), {})).toBe(true);
    expect(isAdminUser(firebaseUser({ uid: "user-2", phoneNumber: "+919999999999" }), {})).toBe(true);
    expect(isAdminUser(firebaseUser({ uid: "user-3" }), { role: "admin" })).toBe(true);
  });

  it("does not grant access to an unlisted identity", () => {
    vi.stubEnv("NEXT_PUBLIC_ADMIN_EMAILS", "admin@example.com");
    vi.stubEnv("NEXT_PUBLIC_FOUNDER_ADMIN_EMAILS", "founder@example.com");

    expect(
      isAdminUser(firebaseUser({ uid: "student-1", email: "student@example.com" }), {}),
    ).toBe(false);
  });
});
