import { test, expect } from '@playwright/test';
import { startServer, type ServerHandle } from './helpers.js';

test.describe('new UI features', () => {
  let server: ServerHandle;

  test.beforeAll(async () => {
    server = await startServer();
  });
  test.afterAll(() => server?.cleanup());

  test('panel has Runs and Help tabs; clicking Help renders help content', async ({ page }) => {
    await page.goto(server.baseURL);

    const panel = page.locator('.panel');
    const runsTab = panel.locator('.panel-tab', { hasText: 'History' });
    const helpTab = panel.locator('.panel-tab', { hasText: 'Glossary' });

    await expect(runsTab).toBeVisible();
    await expect(helpTab).toBeVisible();
    await expect(runsTab).toHaveClass(/\bactive\b/);

    await helpTab.click();
    await expect(helpTab).toHaveClass(/\bactive\b/);
    await expect(runsTab).not.toHaveClass(/\bactive\b/);

    await expect(panel.locator('.help-section').first()).toBeVisible();
    await expect(panel.locator('.help-section')).toHaveCount(4);
    await expect(panel.locator('.help-section').nth(0)).toContainText('Terms');
    await expect(panel.locator('.help-section').nth(1)).toContainText('Policy predicates');
    await expect(panel.locator('.help-section').nth(2)).toContainText('Risk classes');
    await expect(panel.locator('.help-section').nth(3)).toContainText('Run statuses');
    await expect(panel.locator('.help-grid').first().locator('.help-term').first()).toBeVisible();
    await expect(panel.locator('.help-grid').first().locator('.help-def').first()).toBeVisible();

    await runsTab.click();
    await expect(runsTab).toHaveClass(/\bactive\b/);
    await expect(panel.locator('.runs-panel-header')).toBeVisible();
  });

  test('queue status renders in sidebar with running or paused class', async ({ page }) => {
    await page.goto(server.baseURL);

    const dot = page.locator('.sidebar .daemon-dot');
    await expect(dot).toBeVisible();
    await expect(dot).toHaveClass(/\bdaemon-dot\b/);
    await expect(dot).toHaveClass(/\b(running|paused)\b/);

    const pill = page.locator('.sidebar .daemon-pill');
    await expect(pill).toBeVisible();
    await expect(pill).toHaveClass(/\b(running|paused)\b/);
    await expect(pill).toContainText(/running|paused/);
  });

  test('settings cog toggles popover with layout and panes sections', async ({ page }) => {
    await page.goto(server.baseURL);

    const cog = page.locator('.titlebar .settings-cog');
    await expect(cog).toBeVisible();
    await expect(page.locator('.settings-popover')).toHaveCount(0);

    await cog.click();
    const popover = page.locator('.settings-popover');
    await expect(popover).toBeVisible();
    await expect(cog).toHaveClass(/\bactive\b/);

    const sectionLabels = popover.locator('.settings-section-label');
    await expect(sectionLabels).toHaveCount(2);
    await expect(sectionLabels.nth(0)).toContainText('Layout');
    await expect(sectionLabels.nth(1)).toContainText('Panes');
    await expect(popover.locator('.settings-options').first().locator('.settings-option')).not.toHaveCount(0);

    await cog.click();
    await expect(page.locator('.settings-popover')).toHaveCount(0);
    await expect(cog).not.toHaveClass(/\bactive\b/);
  });

  test('pane cycle and reset buttons change layout', async ({ page }) => {
    await page.goto(server.baseURL);

    const cycleBtn = page.locator('.titlebar .pane-cycle-btn');
    const resetBtn = page.locator('.titlebar .pane-reset-btn');

    await expect(cycleBtn).toBeVisible();
    await expect(resetBtn).toBeVisible();
    await expect(resetBtn).toBeDisabled();

    const firstUnit = page.locator('.sidebar .unit').first();
    if (await firstUnit.isVisible()) {
      await firstUnit.click();

      // Cycle enters fullscreen — reset becomes enabled
      await cycleBtn.click();
      await expect(resetBtn).toBeEnabled();

      // Cycle again — still fullscreen (different pane), still enabled
      await cycleBtn.click();
      await expect(resetBtn).toBeEnabled();

      // Reset returns to equal — reset becomes disabled
      await resetBtn.click();
      await expect(resetBtn).toBeDisabled();
    }
  });
});
