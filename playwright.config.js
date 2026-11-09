import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/browser',
  workers: 1,
  use: {
    baseURL: 'http://127.0.0.1:8788',
    headless: true,
    channel: process.env.PLAYWRIGHT_CHANNEL || undefined,
  },
  webServer: [
    {
      command: 'npm run dev:test',
      url: 'http://127.0.0.1:8788',
      reuseExistingServer: false,
      timeout: 60000,
    },
    {
      command: 'npm run dev:test -- --passkeys',
      url: 'http://localhost:8789/login',
      reuseExistingServer: false,
      timeout: 60000,
    },
  ],
});
