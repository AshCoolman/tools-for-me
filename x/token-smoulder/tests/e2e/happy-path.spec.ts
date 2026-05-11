import { test, expect } from '@playwright/test';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { startServer, seedRunState, type ServerHandle } from './helpers';

test.describe('sidebar and tabs', () => {
  let server: ServerHandle;

  test.beforeAll(async () => {
    server = await startServer();
  });
  test.afterAll(() => server?.cleanup());

  test('click sidebar item opens tab with 3-pane editor', async ({ page }) => {
    await page.goto(server.baseURL);
    await page.locator('.unit .name', { hasText: 'valid-readonly' }).click();

    const tabbar = page.locator('.tabbar');
    await expect(tabbar.locator('.tab', { hasText: 'valid-readonly' })).toBeVisible();

    const editor = page.locator('.editor');
    await expect(editor.locator('.pane-header .filename', { hasText: 'work.md' })).toBeVisible();
    await expect(editor.locator('.pane-header .filename', { hasText: 'policy.ts' })).toBeVisible();
    await expect(editor.locator('.pane-header .filename', { hasText: 'executor.ts' })).toBeVisible();
  });

  test('close tab removes it from tabbar', async ({ page }) => {
    await page.goto(server.baseURL);
    await page.locator('.unit .name', { hasText: 'valid-readonly' }).click();
    await expect(page.locator('.tabbar .tab', { hasText: 'valid-readonly' })).toBeVisible();

    await page.locator('.tabbar .tab', { hasText: 'valid-readonly' }).locator('.close').click();
    await expect(page.locator('.tabbar .tab', { hasText: 'valid-readonly' })).not.toBeVisible();
  });

  test('opening multiple tabs keeps both in tabbar', async ({ page }) => {
    await page.goto(server.baseURL);

    const units = page.locator('.sidebar .unit .name');
    const count = await units.count();
    if (count < 2) {
      test.skip();
      return;
    }

    const firstName = await units.nth(0).textContent();
    const secondName = await units.nth(1).textContent();
    await units.nth(0).click();
    await units.nth(1).click();

    await expect(page.locator('.tabbar .tab', { hasText: firstName! })).toBeVisible();
    await expect(page.locator('.tabbar .tab', { hasText: secondName! })).toBeVisible();
  });
});

test.describe('bottom panel', () => {
  let server: ServerHandle;
  let stateDir: string;

  test.beforeAll(async () => {
    stateDir = await mkdtemp(join(tmpdir(), 'e2e-panel-'));
    await seedRunState(stateDir, 'valid-readonly');
    server = await startServer({ TOKEN_SMOULDER_STATE_DIR: stateDir });
  });
  test.afterAll(() => server?.cleanup());

  test('RUN tab shows seeded run status', async ({ page }) => {
    await page.goto(server.baseURL);
    await page.locator('.unit .name', { hasText: 'valid-readonly' }).click();

    const panel = page.locator('.panel');
    await panel.locator('.panel-tab', { hasText: 'RUN' }).click();
    await expect(panel.locator('.panel-body')).toContainText('simulated agent failure');
  });

  test('switching panel tabs changes content', async ({ page }) => {
    await page.goto(server.baseURL);
    await page.locator('.unit .name', { hasText: 'valid-readonly' }).click();

    const panel = page.locator('.panel');

    await panel.locator('.panel-tab', { hasText: 'EVENTS' }).click();
    await expect(panel.locator('.panel-tab.active')).toContainText('EVENTS');

    await panel.locator('.panel-tab', { hasText: 'GATES' }).click();
    await expect(panel.locator('.panel-tab.active')).toContainText('GATES');

    await panel.locator('.panel-tab', { hasText: 'RUN' }).click();
    await expect(panel.locator('.panel-tab.active')).toContainText('RUN');
  });
});

test.describe('resize persistence', () => {
  let server: ServerHandle;

  test.beforeAll(async () => {
    server = await startServer();
  });
  test.afterAll(() => server?.cleanup());

  test('sidebar resize persists across reload', async ({ page }) => {
    await page.goto(server.baseURL);

    const handle = page.locator('.resize-h');
    const box = await handle.boundingBox();
    if (!box) throw new Error('resize handle not found');

    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + 80, box.y + box.height / 2, { steps: 5 });
    await page.mouse.up();

    const widthAfterDrag = await page.locator('.sidebar').evaluate(el => el.getBoundingClientRect().width);
    expect(widthAfterDrag).toBeGreaterThan(220);

    await page.reload();
    const widthAfterReload = await page.locator('.sidebar').evaluate(el => el.getBoundingClientRect().width);
    expect(Math.abs(widthAfterReload - widthAfterDrag)).toBeLessThan(5);
  });

  test('bottom panel resize persists across reload', async ({ page }) => {
    await page.goto(server.baseURL);

    const handle = page.locator('.resize-v');
    const box = await handle.boundingBox();
    if (!box) throw new Error('resize handle not found');

    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2, box.y - 60, { steps: 5 });
    await page.mouse.up();

    const heightAfterDrag = await page.locator('.panel').evaluate(el => el.getBoundingClientRect().height);
    expect(heightAfterDrag).toBeGreaterThan(220);

    await page.reload();
    const heightAfterReload = await page.locator('.panel').evaluate(el => el.getBoundingClientRect().height);
    expect(Math.abs(heightAfterReload - heightAfterDrag)).toBeLessThan(5);
  });
});

test.describe('add work tab', () => {
  let server: ServerHandle;

  test.beforeAll(async () => {
    server = await startServer();
  });
  test.afterAll(() => server?.cleanup());

  test('clicking + opens add tab with input and drop zone', async ({ page }) => {
    await page.goto(server.baseURL);
    await page.locator('.tab-add').click();

    await expect(page.locator('.tabbar .tab', { hasText: 'Add new work' })).toBeVisible();
    await expect(page.locator('.add-content h3')).toContainText('Add new work');
    await expect(page.locator('.add-input-lg')).toBeVisible();
    await expect(page.locator('.add-drop')).toBeVisible();
  });

  test('sidebar Add button also opens add tab', async ({ page }) => {
    await page.goto(server.baseURL);
    await page.locator('.add-btn').click();

    await expect(page.locator('.tabbar .tab', { hasText: 'Add new work' })).toBeVisible();
    await expect(page.locator('.add-content')).toBeVisible();
  });
});
