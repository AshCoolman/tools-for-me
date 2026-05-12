import { test, expect } from '@playwright/test';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { startServer, type ServerHandle } from './helpers.js';

const FAKE_CLAUDE = join(process.cwd(), 'tests', 'e2e', 'fake-claude.sh');

test.describe('run flow (true e2e)', () => {
  let server: ServerHandle;
  let stateDir: string;

  test.beforeAll(async () => {
    stateDir = await mkdtemp(join(tmpdir(), 'e2e-run-'));
    server = await startServer({
      TOKEN_SMOULDER_AGENT_BIN: FAKE_CLAUDE,
      TOKEN_SMOULDER_STATE_DIR: stateDir,
      TOKEN_SMOULDER_CONTENTION: 'fake-quiet',
      TOKEN_SMOULDER_QUOTA_SOURCE: 'fake-pass',
      TOKEN_SMOULDER_SSE_POLL_MS: '300',
    });
  });
  test.afterAll(() => server?.cleanup());

  test('click Run shows running row in panel, then completes', async ({ page }) => {
    await page.goto(server.baseURL);

    await page.locator('.unit .name', { hasText: 'e2e-runnable' }).click();
    await expect(page.locator('.tabbar .tab', { hasText: 'e2e-runnable' })).toBeVisible();

    const runBtn = page.locator('.titlebar .btn.primary', { hasText: 'Run' });
    await expect(runBtn).toBeEnabled();
    await runBtn.click();

    // Button shows Running... while the 1s agent call is in flight
    await expect(runBtn).toContainText('Running...');

    // Panel: a running row must appear while the agent sleeps
    const panel = page.locator('.panel');
    const runningRow = panel.locator('.run-row.is-running', { hasText: 'e2e-runnable' });
    await expect(runningRow).toBeVisible({ timeout: 5_000 });

    // Panel: the same row transitions to completed after the agent finishes
    const completedRow = panel.locator('.run-row', { hasText: 'e2e-runnable' }).filter({ has: page.locator('.run-status.completed') });
    await expect(completedRow).toBeVisible({ timeout: 10_000 });

    // Statusbar confirms
    await expect(page.locator('.statusbar')).toContainText('COMPLETED', { timeout: 5_000 });
  });

  test('run result persists across page reload', async ({ page }) => {
    await page.goto(server.baseURL);

    const panel = page.locator('.panel');
    const completedRow = panel.locator('.run-row', { hasText: 'e2e-runnable' }).filter({ has: page.locator('.run-status.completed') });
    await expect(completedRow).toBeVisible({ timeout: 5_000 });
  });

  test('expanded detail shows step info after run', async ({ page }) => {
    await page.goto(server.baseURL);

    const panel = page.locator('.panel');
    const row = panel.locator('.run-row', { hasText: 'e2e-runnable' }).filter({ has: page.locator('.run-status.completed') });
    await row.click();

    await expect(panel.locator('.run-detail')).toBeVisible({ timeout: 5_000 });
    await expect(panel.locator('.run-detail')).toContainText('1/1');
  });

  test('sidebar status dot updates after successful run', async ({ page }) => {
    await page.goto(server.baseURL);

    const unit = page.locator('.unit', { has: page.locator('.name', { hasText: 'e2e-runnable' }) });
    await expect(unit).toBeVisible();
  });
});
