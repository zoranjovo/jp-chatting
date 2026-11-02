import { defineConfig, devices } from '@playwright/test';
import path from 'node:path';

// The UI tests run the built app on their own ports with their own data dir
// and a scripted model (test/ui/mock-llm.ts), so they never touch data/ or a
// running `pnpm dev`.
export const APP_PORT = 5198;
export const MOCK_PORT = 5199;
export const DATA_DIR = path.join(import.meta.dirname, '.cache', 'ui-test-data');

export default defineConfig({
  testDir: 'test/ui',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: `http://127.0.0.1:${APP_PORT}`,
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: [
    {
      command: 'tsx test/ui/mock-llm.ts',
      url: `http://127.0.0.1:${MOCK_PORT}/v1/models`,
      env: { MOCK_LLM_PORT: String(MOCK_PORT) },
      reuseExistingServer: false,
    },
    {
      command: 'vite build && tsx server/index.ts',
      url: `http://127.0.0.1:${APP_PORT}/api/settings`,
      env: { JP_CHATTING_PORT: String(APP_PORT), JP_CHATTING_DATA: DATA_DIR },
      reuseExistingServer: false,
      timeout: 120_000,
    },
  ],
});
