import type { Page } from "@playwright/test";

const NOW = new Date("2026-05-20T10:00:00Z");
const MS = {
  min: 60_000,
  hour: 3_600_000,
};

const ts = (offsetMs: number) => new Date(NOW.getTime() + offsetMs).toISOString();

export const MOCK_DATA = {
  generatedAt: NOW.toISOString(),
  sessions: [
    {
      sessionId: "aaaa1111-0000-0000-0000-000000000001",
      project: "dashboard",
      projectPath: "/Users/dev/projects/dashboard",
      path: "/Users/dev/.claude/projects/dashboard/session1.jsonl",
      firstSeen: ts(-2 * MS.hour),
      lastSeen: ts(-1 * MS.min),
      messageCount: 42,
      contextTokens: 320_000,
      contextLimit: 200_000,
      contextPercent: 160,
      usage: { input: 80_000, output: 40_000, cacheRead: 200_000, cacheCreation: 10_000, total: 330_000 },
      tail: "Implemented the auth middleware refactor",
      lastPrompt: "Can you refactor the auth middleware?",
      lastPromptAt: ts(-3 * MS.min),
      lastReplyAt: ts(-1 * MS.min),
      compactedAt: null,
    },
    {
      sessionId: "bbbb2222-0000-0000-0000-000000000002",
      project: "api-server",
      projectPath: "/Users/dev/projects/api-server",
      path: "/Users/dev/.claude/projects/api-server/session2.jsonl",
      firstSeen: ts(-4 * MS.hour),
      lastSeen: ts(-10 * MS.min),
      messageCount: 18,
      contextTokens: 85_000,
      contextLimit: 200_000,
      contextPercent: 42.5,
      usage: { input: 30_000, output: 15_000, cacheRead: 40_000, cacheCreation: 5_000, total: 90_000 },
      tail: "Fixed the pagination cursor bug",
      lastPrompt: "The pagination is broken on page 3",
      lastPromptAt: ts(-12 * MS.min),
      lastReplyAt: ts(-10 * MS.min),
      compactedAt: ts(-30 * MS.min),
    },
    {
      sessionId: "cccc3333-0000-0000-0000-000000000003",
      project: "docs-site",
      projectPath: "/Users/dev/projects/docs-site",
      path: "/Users/dev/.claude/projects/docs-site/session3.jsonl",
      firstSeen: ts(-1 * MS.hour),
      lastSeen: ts(-2 * MS.min),
      messageCount: 7,
      contextTokens: 25_000,
      contextLimit: 200_000,
      contextPercent: 12.5,
      usage: { input: 10_000, output: 5_000, cacheRead: 10_000, cacheCreation: 2_000, total: 27_000 },
      tail: "Updated the getting started guide",
      lastPrompt: "Update the getting started page",
      lastPromptAt: ts(-4 * MS.min),
      lastReplyAt: ts(-2 * MS.min),
      compactedAt: null,
    },
  ],
  usage: [
    { time: ts(-3 * MS.hour), sessionId: "aaaa1111-0000-0000-0000-000000000001", project: "dashboard", input: 20_000, output: 10_000, cacheRead: 50_000, cacheCreation: 5_000, total: 85_000, contextSize: 100_000 },
    { time: ts(-2 * MS.hour), sessionId: "aaaa1111-0000-0000-0000-000000000001", project: "dashboard", input: 30_000, output: 15_000, cacheRead: 80_000, cacheCreation: 3_000, total: 128_000, contextSize: 200_000 },
    { time: ts(-1 * MS.hour), sessionId: "aaaa1111-0000-0000-0000-000000000001", project: "dashboard", input: 30_000, output: 15_000, cacheRead: 70_000, cacheCreation: 2_000, total: 117_000, contextSize: 320_000 },
    { time: ts(-4 * MS.hour), sessionId: "bbbb2222-0000-0000-0000-000000000002", project: "api-server", input: 15_000, output: 8_000, cacheRead: 20_000, cacheCreation: 3_000, total: 46_000, contextSize: 50_000 },
    { time: ts(-2 * MS.hour), sessionId: "bbbb2222-0000-0000-0000-000000000002", project: "api-server", input: 15_000, output: 7_000, cacheRead: 20_000, cacheCreation: 2_000, total: 44_000, contextSize: 85_000 },
    { time: ts(-1 * MS.hour), sessionId: "cccc3333-0000-0000-0000-000000000003", project: "docs-site", input: 10_000, output: 5_000, cacheRead: 10_000, cacheCreation: 2_000, total: 27_000, contextSize: 25_000 },
  ],
};

export const MOCK_STATUS = {
  indicator: "none" as const,
  description: "All Systems Operational",
  fetchedAt: NOW.toISOString(),
};

export async function mockApi(page: Page) {
  await page.route("**/api/data**", (route) =>
    route.fulfill({ json: MOCK_DATA }),
  );
  await page.route("**/api/status", (route) =>
    route.fulfill({ json: MOCK_STATUS }),
  );
  await page.route("**/api/usage", (route) =>
    route.fulfill({ json: null }),
  );
}
