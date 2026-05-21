import { expect, test } from "@playwright/test";
import { mockApi } from "./fixtures.js";

test.beforeEach(async ({ page }) => {
  await mockApi(page);
  await page.goto("/");
  await page.waitForSelector("[role='listitem']");
});

// Journey 1: "Is my session healthy?" — glance at severity bands and status
test.describe("Journey 1: Session health at a glance", () => {
  test("page loads with semantic landmarks", async ({ page }) => {
    await expect(page.locator("main#main-content")).toBeVisible();
    await expect(page.locator("header")).toBeVisible();
    await expect(page.locator("h1")).toHaveText("Claude Context Dashboard");
  });

  test("sessions render with severity bands and status glyphs", async ({ page }) => {
    const rows = page.locator("[role='listitem']");
    await expect(rows).toHaveCount(3);

    const glyphs = page.locator("[role='img']");
    const sessionGlyphs = glyphs.filter({ hasText: /[▶⏸▌]/ });
    await expect(sessionGlyphs.first()).toBeVisible();
  });

  test("token badge shows context size with accessible label", async ({ page }) => {
    const badge = page.locator(".session-pct").first();
    await expect(badge).toBeVisible();
    await expect(badge).toHaveAttribute("title", "Estimated context window tokens");
  });

  test("status chip shows Claude status", async ({ page }) => {
    const chip = page.locator("[role='status']");
    await expect(chip).toBeVisible();
    await expect(chip).toHaveAttribute("aria-live", "polite");
    await expect(chip.locator(".status-chip__label")).toHaveText("All Systems Operational");
  });

  test("blurb shows session count summary", async ({ page }) => {
    const blurb = page.locator(".card-blurb").first();
    await expect(blurb).toContainText("Showing 3 of 3 sessions");
  });
});

// Journey 2: "Which session is eating tokens?" — sorted rows diagnosis
test.describe("Journey 2: Token-heavy session diagnosis", () => {
  test("sessions sorted by context tokens descending", async ({ page }) => {
    const badges = page.locator(".session-pct");
    const texts = await badges.allTextContents();
    const values = texts.map((t) => parseInt(t.replace("k", "")) * 1000);
    for (let i = 1; i < values.length; i++) {
      expect(values[i]).toBeLessThanOrEqual(values[i - 1]);
    }
  });

  test("critical session appears first with crit severity", async ({ page }) => {
    const firstRow = page.locator("[role='listitem']").first();
    await expect(firstRow).toHaveClass(/crit/);
    await expect(firstRow.locator(".session-pct")).toContainText("320k");
  });

  test("band dividers label severity zones", async ({ page }) => {
    const dividers = page.locator(".band-divider");
    const count = await dividers.count();
    expect(count).toBeGreaterThanOrEqual(1);
    await expect(dividers.first()).toContainText(/Critical|Large|Medium|Fast/);
  });

  test("project name is clickable to filter", async ({ page }) => {
    const projectLink = page.locator(".session-name__project").first();
    await projectLink.click();
    const searchInput = page.locator("input[type='search']");
    await expect(searchInput).not.toHaveValue("");
  });
});

// Journey 3: "What happened while I was away?" — time window change
test.describe("Journey 3: Time window navigation", () => {
  test("time range selector has group role and label", async ({ page }) => {
    const group = page.locator("[role='group'][aria-label='Time range']");
    await expect(group).toBeVisible();
  });

  test("preset buttons change the active window", async ({ page }) => {
    const rangeGroup = page.locator("[role='group'][aria-label='Time range']");
    const btn1h = rangeGroup.locator("button", { hasText: "1h" });
    await btn1h.click();
    await expect(btn1h).toHaveClass(/active/);

    const heading = page.locator("h2");
    await expect(heading.first()).toContainText("1 hour");
  });

  test("custom days input works", async ({ page }) => {
    const daysInput = page.locator("input.window-days");
    await daysInput.fill("3");
    await daysInput.blur();
    const heading = page.locator("h2").first();
    await expect(heading).toContainText("3 days");
  });

  test("Y-axis range selector exists", async ({ page }) => {
    const yGroup = page.locator("[role='group'][aria-label='Y-axis time range']");
    await expect(yGroup).toBeVisible();
  });

  test("chart has accessible SVG role", async ({ page }) => {
    const chart = page.locator("svg[role='img']").first();
    await expect(chart).toBeVisible();
    await expect(chart).toHaveAttribute("aria-label", /chart/i);
  });
});

// Journey 4: "Customize what I see" — visibility sidebar
test.describe("Journey 4: Visibility customization", () => {
  test("visibility toggle opens sidebar", async ({ page }) => {
    const visBtn = page.locator("button").filter({ hasText: /👁|visibility/i }).first();
    if (await visBtn.isVisible()) {
      await visBtn.click();
      const sidebar = page.locator("aside[aria-label='Visibility controls']");
      await expect(sidebar).toBeVisible();
    }
  });

  test("sidebar buttons have aria-pressed state", async ({ page }) => {
    const visBtn = page.locator("button").filter({ hasText: /👁|visibility/i }).first();
    if (await visBtn.isVisible()) {
      await visBtn.click();
      const sidebarBtns = page.locator("aside button[aria-pressed]");
      const count = await sidebarBtns.count();
      expect(count).toBeGreaterThan(0);
      const firstState = await sidebarBtns.first().getAttribute("aria-pressed");
      expect(["true", "false"]).toContain(firstState);
    }
  });
});

// Journey 5: "Status check" — header status chip
test.describe("Journey 5: Claude status monitoring", () => {
  test("status chip links to status.claude.com", async ({ page }) => {
    const chip = page.locator("[role='status']");
    await expect(chip).toHaveAttribute("href", "https://status.claude.com/");
    await expect(chip).toHaveAttribute("target", "_blank");
  });

  test("status chip has descriptive title", async ({ page }) => {
    const chip = page.locator("[role='status']");
    const title = await chip.getAttribute("title");
    expect(title).toContain("status.claude.com");
  });
});

// Semantic structure verification
test.describe("Semantic HTML structure", () => {
  test("skip-to-content link exists and targets main", async ({ page }) => {
    const skip = page.locator("a.skip-link");
    await expect(skip).toHaveAttribute("href", "#main-content");
  });

  test("search input has aria-label", async ({ page }) => {
    const search = page.locator("input[type='search']");
    await expect(search).toHaveAttribute("aria-label", "Filter sessions");
  });

  test("/ keyboard shortcut focuses search", async ({ page }) => {
    await page.keyboard.press("/");
    const search = page.locator("input[type='search']");
    await expect(search).toBeFocused();
  });

  test("Escape blurs search", async ({ page }) => {
    await page.keyboard.press("/");
    await expect(page.locator("input[type='search']")).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(page.locator("input[type='search']")).not.toBeFocused();
  });

  test("session list has role=list, rows have role=listitem", async ({ page }) => {
    await expect(page.locator("[role='list']")).toBeVisible();
    const items = page.locator("[role='listitem']");
    await expect(items).toHaveCount(3);
  });

  test("chart legend uses semantic list", async ({ page }) => {
    const legend = page.locator("ul.chart-legend");
    if (await legend.isVisible()) {
      const items = legend.locator("li");
      const count = await items.count();
      expect(count).toBeGreaterThan(0);
    }
  });

  test("timestamps use <time> element", async ({ page }) => {
    const times = page.locator("time.session-time");
    const count = await times.count();
    expect(count).toBeGreaterThan(0);
    await expect(times.first()).toHaveAttribute("dateTime", /.+/);
  });

  test("session row dismiss button works", async ({ page }) => {
    const rowsBefore = await page.locator("[role='listitem']").count();
    const dismissBtn = page.locator(".session-row__dismiss").first();
    await dismissBtn.click();
    const rowsAfter = await page.locator("[role='listitem']").count();
    expect(rowsAfter).toBe(rowsBefore - 1);
  });

  test("copyable elements respond to keyboard", async ({ page }) => {
    const copyable = page.locator(".copyable").first();
    await expect(copyable).toHaveAttribute("role", "button");
    await expect(copyable).toHaveAttribute("tabindex", "0");
  });
});
