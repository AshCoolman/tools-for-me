import { test, expect } from '@playwright/test';
import { startServer, type ServerHandle } from './helpers';

let server: ServerHandle;

test.beforeAll(async () => {
  server = await startServer();
});

test.afterAll(() => {
  server?.cleanup();
});

test('app loads with titlebar', async ({ page }) => {
  await page.goto(server.baseURL);
  await expect(page.locator('.titlebar')).toContainText('token-smoulder');
});

test('sidebar renders work items', async ({ page }) => {
  await page.goto(server.baseURL);
  const sidebar = page.locator('.sidebar');
  await expect(sidebar.locator('.unit')).not.toHaveCount(0);
  await expect(sidebar.locator('.unit .name')).toContainText(['valid-readonly']);
});

test('statusbar is visible', async ({ page }) => {
  await page.goto(server.baseURL);
  await expect(page.locator('.statusbar')).toBeVisible();
});
