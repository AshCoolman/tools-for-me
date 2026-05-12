import { test, expect } from '@playwright/test';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { startServer, seedSuppression, type ServerHandle } from './helpers.js';

const FAKE_CLAUDE_FAIL = join(process.cwd(), 'tests', 'e2e', 'fake-claude-fail.sh');

test.describe('failed run with active suppression', () => {
  let server: ServerHandle;
  let stateDir: string;

  test.beforeAll(async () => {
    stateDir = await mkdtemp(join(tmpdir(), 'e2e-fail-'));
    await seedSuppression(stateDir, 'e2e-runnable');
    server = await startServer({
      TOKEN_SMOULDER_AGENT_BIN: FAKE_CLAUDE_FAIL,
      TOKEN_SMOULDER_STATE_DIR: stateDir,
      TOKEN_SMOULDER_CONTENTION: 'fake-quiet',
      TOKEN_SMOULDER_SSE_POLL_MS: '300',
    });
  });
  test.afterAll(() => server?.cleanup());

  test('manual Run that gate-fails shows failed row in RUNS panel', async ({ page }) => {
    await page.goto(server.baseURL);

    await page.locator('.unit .name', { hasText: 'e2e-runnable' }).click();

    const runBtn = page.locator('.titlebar .btn.primary');
    await expect(runBtn).toBeEnabled();
    await runBtn.click();

    // Button should show Failed (gate-failed counts as failure)
    await expect(runBtn).toContainText('Failed', { timeout: 10_000 });

    // RUNS panel must show a failed row with the gate failure reason
    const panel = page.locator('.panel');
    const failedRow = panel.locator('.run-row.is-failed', { hasText: 'e2e-runnable' });
    await expect(failedRow).toBeVisible({ timeout: 5_000 });

    // The error text should show the gate failure reason
    await expect(panel.locator('.run-error')).toBeVisible();
  });
});
