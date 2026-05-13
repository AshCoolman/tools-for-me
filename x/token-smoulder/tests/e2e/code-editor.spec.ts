import { test, expect } from '@playwright/test';
import { startServer, type ServerHandle } from './helpers.js';

test.describe('code editor (CodeMirror)', () => {
  let server: ServerHandle;

  test.beforeAll(async () => {
    server = await startServer();
  });
  test.afterAll(() => server?.cleanup());

  test('work.md pane renders CodeMirror with line numbers', async ({ page }) => {
    await page.goto(server.baseURL);
    await page.locator('.unit .name', { hasText: 'valid-readonly' }).click();

    const workPane = page.locator('.pane').filter({ has: page.locator('.filename', { hasText: 'work.md' }) });
    await expect(workPane.locator('.cm-editor')).toBeVisible({ timeout: 5_000 });
    await expect(workPane.locator('.cm-gutters')).toBeVisible();
    await expect(workPane.locator('.cm-lineNumbers')).toBeVisible();
  });

  test('executor.ts pane renders CodeMirror with line numbers', async ({ page }) => {
    await page.goto(server.baseURL);
    await page.locator('.unit .name', { hasText: 'valid-readonly' }).click();

    const execPane = page.locator('.pane').filter({ has: page.locator('.filename', { hasText: 'executor.ts' }) });
    await expect(execPane.locator('.cm-editor')).toBeVisible({ timeout: 5_000 });
    await expect(execPane.locator('.cm-lineNumbers')).toBeVisible();
  });

  test('markdown headings are syntax-highlighted', async ({ page }) => {
    await page.goto(server.baseURL);
    await page.locator('.unit .name', { hasText: 'valid-readonly' }).click();

    const workPane = page.locator('.pane').filter({ has: page.locator('.filename', { hasText: 'work.md' }) });
    await expect(workPane.locator('.cm-editor')).toBeVisible({ timeout: 5_000 });

    const headingSpan = workPane.locator('.cm-line').filter({ hasText: '# Objective' });
    await expect(headingSpan).toBeVisible();
  });

  test('editor is read-only in view mode', async ({ page }) => {
    await page.goto(server.baseURL);
    await page.locator('.unit .name', { hasText: 'valid-readonly' }).click();

    const workPane = page.locator('.pane').filter({ has: page.locator('.filename', { hasText: 'work.md' }) });
    const cmContent = workPane.locator('.cm-content');
    await expect(cmContent).toBeVisible({ timeout: 5_000 });

    await expect(cmContent).toHaveAttribute('contenteditable', 'false');
    await expect(cmContent).toHaveAttribute('aria-readonly', 'true');
  });

  test('clicking edit enables typing, clicking view returns to read-only', async ({ page }) => {
    await page.goto(server.baseURL);
    await page.locator('.unit .name', { hasText: 'valid-readonly' }).click();

    const workPane = page.locator('.pane').filter({ has: page.locator('.filename', { hasText: 'work.md' }) });
    const cmContent = workPane.locator('.cm-content');
    await expect(cmContent).toBeVisible({ timeout: 5_000 });
    await expect(cmContent).toHaveAttribute('contenteditable', 'false');

    const editBtn = workPane.locator('.edit-btn');
    await editBtn.click();
    expect(await editBtn.textContent()).toBe('view');

    await expect(cmContent).toHaveAttribute('contenteditable', 'true', { timeout: 2_000 });
    await cmContent.click();
    await page.keyboard.press('End');
    await page.keyboard.type(' test-edit');
    await expect(cmContent).toContainText('test-edit');

    await editBtn.click();
    expect(await editBtn.textContent()).toBe('edit');
    await expect(cmContent).toHaveAttribute('contenteditable', 'false', { timeout: 2_000 });
  });

  test('all three panes have CodeMirror editors simultaneously', async ({ page }) => {
    await page.goto(server.baseURL);
    await page.locator('.unit .name', { hasText: 'valid-readonly' }).click();

    const panes = page.locator('.pane');
    const editors = panes.locator('.cm-editor');
    await expect(editors).toHaveCount(3, { timeout: 5_000 });
  });
});
