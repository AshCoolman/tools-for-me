import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 30_000,
  retries: 0,
  workers: 1,
  outputDir: 'test-results',
  reporter: [
    ['list'],
    ['html', { outputFolder: 'playwright-report', open: 'never' }],
  ],
  use: {
    headless: true,
    viewport: { width: 1280, height: 720 },
    screenshot: 'on',
    video: { mode: 'on', size: { width: 1280, height: 720 } },
    launchOptions: { args: ['--force-device-scale-factor=2'] },
  },
  projects: [
    { name: 'chromium', use: { browserName: 'chromium' } },
  ],
});
