import { defineConfig, devices } from "@playwright/test";

const port = Number(process.env.PLAYWRIGHT_PORT || 3100);
const baseURL = `http://127.0.0.1:${port}`;
const production = process.env.PLAYWRIGHT_PRODUCTION === "1";

const testPublicEnv = {
  NEXT_TELEMETRY_DISABLED: "1",
  NEXT_PUBLIC_FIREBASE_API_KEY: "test-api-key",
  NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: "agentifyai.test.firebaseapp.com",
  NEXT_PUBLIC_FIREBASE_PROJECT_ID: "agentifyai-test",
  NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET: "agentifyai-test.appspot.com",
  NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID: "123456789",
  NEXT_PUBLIC_FIREBASE_APP_ID: "1:123456789:web:test",
  NEXT_PUBLIC_BACKEND_URL: "http://127.0.0.1:65535",
};

for (const [key, value] of Object.entries(testPublicEnv)) {
  process.env[key] ||= value;
}

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 60_000,
  expect: {
    timeout: 15_000,
  },
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: 2,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  webServer: {
    command: production
      ? `npm run build && npm run start -- --port ${port}`
      : `npm run dev -- --port ${port}`,
    url: baseURL,
    reuseExistingServer: !process.env.CI && !production,
    timeout: production ? 300_000 : 120_000,
    env: testPublicEnv,
  },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        channel: process.env.CI ? undefined : "chrome",
      },
    },
    {
      name: "mobile-chrome",
      use: {
        ...devices["Pixel 5"],
        channel: process.env.CI ? undefined : "chrome",
      },
    },
  ],
});
