import type { Page, Route } from "@playwright/test";
import type { BackendUserProfile } from "../../../lib/profile";
import type { SessionRecord } from "../../../features/learning-workspace/types";
import type { StudyConversation } from "../../../features/study/types";

/** Synthetic credentials: only usable against the intercepted test endpoints. */
export const WORKSPACE_TEST_USER_ID = "workspace-visual-test-user";
export const WORKSPACE_TEST_BACKEND = "http://127.0.0.1:65535";
const FIREBASE_TEST_API_KEY = "test-api-key";
const BOOTSTRAP_PATH = "/__workspace-fixture-bootstrap__";
const FIXTURE_DATE = "2026-09-08T09:00:00.000Z";

const profile: BackendUserProfile = {
  user_id: WORKSPACE_TEST_USER_ID,
  email: "learner@example.test",
  display_name: "Aarav Sharma",
  class_level: "Class 11",
  onboarding_completed: true,
  created_at: FIXTURE_DATE,
  updated_at: FIXTURE_DATE,
};

export const WORKSPACE_TEST_CATALOG = {
  source: "published",
  subjects: [{
    subject: "Chemistry",
    class_level: "Class 11",
    chapters: [
      {
        slug: "some_basic_concepts_of_chemistry",
        name: "Some Basic Concepts of Chemistry",
        aliases: ["matter", "Basic Concepts of Chemistry"],
        topics: [
          { id: "chemistry-foundations", label: "Chemistry foundations", concept_ids: ["chemistry_definition"] },
          { id: "properties-of-matter", label: "Properties of matter", concept_ids: ["properties_of_matter"] },
          { id: "mole-concept", label: "The mole concept", concept_ids: ["mole_concept"] },
        ],
      },
      {
        slug: "hydrocarbon",
        name: "Hydrocarbons",
        topics: [
          { id: "alkanes", label: "Alkanes" },
          { id: "alkenes", label: "Alkenes" },
          { id: "alkynes", label: "Alkynes" },
        ],
      },
    ],
  }],
};

const recentSession: SessionRecord = {
  id: "visual-study-session",
  subject: "Chemistry",
  class_level: "Class 11",
  topic: "Chemistry foundations",
  total_questions: 5,
  score: 4,
  xp_earned: 40,
  time_spent_seconds: 600,
  session_type: "study",
  completed_at: FIXTURE_DATE,
};

const conversation: StudyConversation = {
  id: "visual-study-conversation",
  sessionId: "visual-study-conversation",
  title: "Understanding the mole concept",
  updatedAt: FIXTURE_DATE,
  chapter: "Some Basic Concepts of Chemistry",
  topic: "The mole concept",
  messages: [
    { role: "user", content: "How does the mole connect particles and mass?", timestamp: FIXTURE_DATE },
    { role: "coach", content: "A mole counts particles. Molar mass connects that particle count to a mass in grams.", timestamp: FIXTURE_DATE },
  ],
  pinned: false,
  archived: false,
  titleLocked: false,
  scope: {
    source: "syllabus",
    catalogSource: "published",
    classLevel: "Class 11",
    subject: "Chemistry",
    chapterId: "some_basic_concepts_of_chemistry",
    chapterLabel: "Some Basic Concepts of Chemistry",
    topicId: "mole-concept",
    topicLabel: "The mole concept",
  },
};

export type WorkspaceMockOptions = {
  /** Both states have a published catalog; empty means no previous learner work. */
  state?: "ready" | "empty";
};

/**
 * Installs a local-only authenticated workspace fixture without production code
 * changes. Call before page.goto("/dashboard") in a fresh Playwright context.
 * The app must use playwright.config.ts's test Firebase and backend env values.
 * A script-free same-origin document lets IndexedDB writes finish before any
 * Firebase initialization; an async addInitScript alone would race bootstrap.
 * Unspecified backend endpoints return an explicit 404 and are collected so a
 * screenshot test cannot silently mistake invented data for a supported fixture.
 */
export async function installWorkspaceMocks(
  page: Page,
  theme: "light" | "dark" = "light",
  options: WorkspaceMockOptions = {},
) {
  const state = options.state ?? "empty";
  const unhandledRequests: string[] = [];
  const issuedAt = Math.floor(Date.now() / 1000);
  const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64url");
  const idToken = `${encode({ alg: "RS256", typ: "JWT" })}.${encode({
    iss: "https://securetoken.google.com/agentifyai-test",
    aud: "agentifyai-test",
    auth_time: issuedAt,
    user_id: WORKSPACE_TEST_USER_ID,
    sub: WORKSPACE_TEST_USER_ID,
    iat: issuedAt,
    exp: issuedAt + 3600,
    email: profile.email,
    email_verified: true,
    firebase: { identities: { email: [profile.email] }, sign_in_provider: "google.com" },
  })}.synthetic-test-signature`;

  const json = (route: Route, body: unknown, status = 200) => route.fulfill({
    status,
    contentType: "application/json",
    headers: {
      "access-control-allow-origin": "*",
      "access-control-allow-headers": "Authorization, Content-Type",
      "access-control-allow-methods": "GET, POST, PATCH, DELETE, OPTIONS",
    },
    body: JSON.stringify(body),
  });

  await page.route("https://identitytoolkit.googleapis.com/**", async (route) => {
    const request = route.request();
    if (request.method() === "OPTIONS") return json(route, {});
    const url = new URL(request.url());
    if (url.searchParams.get("key") !== FIREBASE_TEST_API_KEY) {
      throw new Error("Workspace mocks require the synthetic test-api-key configuration.");
    }
    if (url.pathname.endsWith("/accounts:lookup")) {
      return json(route, { users: [{
        localId: WORKSPACE_TEST_USER_ID,
        email: profile.email,
        emailVerified: true,
        displayName: profile.display_name,
        createdAt: String(Date.parse(FIXTURE_DATE)),
        lastLoginAt: String(Date.now()),
        providerUserInfo: [{ providerId: "google.com", rawId: WORKSPACE_TEST_USER_ID, email: profile.email, displayName: profile.display_name }],
      }] });
    }
    unhandledRequests.push(`${request.method()} ${url.pathname}`);
    return json(route, { error: { code: 400, message: "UNSUPPORTED_TEST_AUTH_REQUEST" } }, 400);
  });

  await page.route("https://securetoken.googleapis.com/**", async (route) => {
    if (route.request().method() === "OPTIONS") return json(route, {});
    if (new URL(route.request().url()).searchParams.get("key") !== FIREBASE_TEST_API_KEY) {
      throw new Error("Workspace mocks refuse refresh requests for real Firebase configurations.");
    }
    return json(route, {
      expires_in: "3600",
      token_type: "Bearer",
      refresh_token: "synthetic-refresh-token",
      id_token: idToken,
      user_id: WORKSPACE_TEST_USER_ID,
      project_id: "agentifyai-test",
    });
  });

  await page.route(`${WORKSPACE_TEST_BACKEND}/**`, async (route) => {
    const request = route.request();
    const { pathname } = new URL(request.url());
    if (request.method() === "OPTIONS") return json(route, {});
    if (request.method() === "GET") {
      if (pathname === "/health" || pathname === "/health/live") return json(route, { status: "ok", service: "agentifyai-test", artifacts_ready: true });
      if (pathname === "/profile/me") return json(route, profile);
      if (pathname === "/admin/me") return json(route, { detail: "Learner account has no admin access." }, 404);
      if (pathname === "/catalog") return json(route, WORKSPACE_TEST_CATALOG);
      if (pathname === `/sessions/${WORKSPACE_TEST_USER_ID}`) return json(route, { sessions: state === "ready" ? [recentSession] : [] });
      if (pathname === `/coach/conversations/${WORKSPACE_TEST_USER_ID}`) return json(route, { conversations: state === "ready" ? [conversation] : [] });
      if (pathname === `/coach/conversations/${WORKSPACE_TEST_USER_ID}/${conversation.id}`) return json(route, { conversation: state === "ready" ? conversation : null });
      if (pathname === `/coach/${WORKSPACE_TEST_USER_ID}`) return json(route, { profile: { coach_name: "Aria" } });
    }
    unhandledRequests.push(`${request.method()} ${pathname}`);
    return json(route, { detail: `No workspace test fixture for ${request.method()} ${pathname}` }, 404);
  });

  const bootstrapMatcher = (url: URL) => url.pathname === BOOTSTRAP_PATH
    && (url.hostname === "127.0.0.1" || url.hostname === "localhost");
  await page.route(bootstrapMatcher, (route) => route.fulfill({
    contentType: "text/html",
    body: "<!doctype html><html lang=\"en\"><title>Workspace test bootstrap</title><body>Preparing synthetic local test session.</body></html>",
  }));
  await page.goto(BOOTSTRAP_PATH, { waitUntil: "domcontentloaded" });
  if (!bootstrapMatcher(new URL(page.url()))) throw new Error("Workspace mock seeding is restricted to localhost.");

  await page.evaluate(async ({ theme, profile, idToken, issuedAt, apiKey }) => {
    localStorage.setItem("agentify-theme", theme);
    const persistedUser = {
      uid: profile.user_id,
      email: profile.email,
      emailVerified: true,
      displayName: profile.display_name,
      isAnonymous: false,
      providerData: [{ providerId: "google.com", uid: profile.user_id, displayName: profile.display_name, email: profile.email, phoneNumber: null, photoURL: null }],
      stsTokenManager: { refreshToken: "synthetic-refresh-token", accessToken: idToken, expirationTime: (issuedAt + 3600) * 1000 },
      createdAt: String(Date.parse(profile.created_at)),
      lastLoginAt: String(Date.now()),
      apiKey,
      appName: "[DEFAULT]",
    };
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.open("firebaseLocalStorageDb", 1);
      request.onupgradeneeded = () => {
        request.result.createObjectStore("firebaseLocalStorage", { keyPath: "fbase_key" });
      };
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const database = request.result;
        const transaction = database.transaction("firebaseLocalStorage", "readwrite");
        transaction.objectStore("firebaseLocalStorage").put({
          fbase_key: `firebase:authUser:${apiKey}:[DEFAULT]`,
          value: persistedUser,
        });
        transaction.oncomplete = () => { database.close(); resolve(); };
        transaction.onerror = () => { database.close(); reject(transaction.error); };
        transaction.onabort = () => { database.close(); reject(transaction.error ?? new Error("Test auth persistence aborted.")); };
      };
    });
  }, { theme, profile, idToken, issuedAt, apiKey: FIREBASE_TEST_API_KEY });
  await page.unroute(bootstrapMatcher);

  return { userId: WORKSPACE_TEST_USER_ID, unhandledRequests };
}
