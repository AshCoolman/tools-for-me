import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import Fastify from "fastify";
import { scanClaudeSessions } from "./scanner.js";

const PORT = Number(process.env.PORT ?? 8787);
const HOST = "127.0.0.1";
const isProd = process.env.NODE_ENV === "production";
const SCAN_INTERVAL_MS = 10 * 60 * 1000;
const NOTIFY_THRESHOLD = 300_000;
const STATUS_URL = "https://status.claude.com/api/v2/status.json";
const STATUS_POLL_MS = 5 * 60 * 1000;
const USAGE_FILE = path.join(
  os.homedir(),
  ".claude-context-dashboard",
  "usage.json",
);

type StatusIndicator =
  | "none"
  | "minor"
  | "major"
  | "critical"
  | "maintenance"
  | "unknown";

type StatusSnapshot = {
  indicator: StatusIndicator;
  description: string;
  fetchedAt: string;
};

let latestStatus: StatusSnapshot = {
  indicator: "unknown",
  description: "Checking…",
  fetchedAt: new Date(0).toISOString(),
};

type UsageRecord = {
  receivedAt: string;
  payload: unknown;
};

let usageRecord: UsageRecord | null = null;

const loadUsage = async (): Promise<void> => {
  try {
    const buf = await fs.readFile(USAGE_FILE, "utf8");
    usageRecord = JSON.parse(buf) as UsageRecord;
  } catch {
    usageRecord = null;
  }
};

const saveUsage = async (record: UsageRecord): Promise<void> => {
  await fs.mkdir(path.dirname(USAGE_FILE), { recursive: true });
  await fs.writeFile(USAGE_FILE, JSON.stringify(record, null, 2), "utf8");
};

const HOME_ENCODED = `-${os.homedir().slice(1).replace(/[/_]/g, "-")}-`;

const cleanProject = (raw: string): string => {
  const stripped = raw.startsWith(HOME_ENCODED)
    ? raw.slice(HOME_ENCODED.length)
    : raw;
  return stripped.replace(/-/g, " ").trim() || raw;
};

const escapeAppleScript = (s: string): string => s.replace(/[\\"]/g, "\\$&");

const notify = (title: string, body: string): void => {
  if (process.platform !== "darwin") return;
  execFile(
    "osascript",
    [
      "-e",
      `display notification "${escapeAppleScript(body)}" with title "${escapeAppleScript(title)}"`,
    ],
    (err) => {
      if (err) app.log.warn({ err: err.message }, "osascript notify failed");
    },
  );
};

const app = Fastify({ logger: true });

const notifiedOver = new Set<string>();

const checkBreaches = async (): Promise<void> => {
  try {
    const data = await scanClaudeSessions();
    const over = data.sessions.filter(
      (s) => s.contextTokens >= NOTIFY_THRESHOLD,
    );
    const overIds = new Set(over.map((s) => s.sessionId));
    for (const id of [...notifiedOver]) {
      if (!overIds.has(id)) notifiedOver.delete(id);
    }
    for (const s of over) {
      if (notifiedOver.has(s.sessionId)) continue;
      const tokens = s.contextTokens.toLocaleString();
      notify(
        "Claude context > 300k",
        `${cleanProject(s.project)}: ${tokens} tokens`,
      );
      notifiedOver.add(s.sessionId);
      app.log.info(
        { sessionId: s.sessionId, project: s.project, tokens: s.contextTokens },
        "notified context breach",
      );
    }
  } catch (err) {
    app.log.error({ err }, "scheduled scan failed");
  }
};

const KNOWN_INDICATORS: ReadonlySet<StatusIndicator> = new Set([
  "none",
  "minor",
  "major",
  "critical",
  "maintenance",
]);

const fetchClaudeStatus = async (): Promise<void> => {
  try {
    const res = await fetch(STATUS_URL, {
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = (await res.json()) as {
      status?: { indicator?: string; description?: string };
    };
    const raw = json.status?.indicator ?? "unknown";
    const indicator: StatusIndicator = KNOWN_INDICATORS.has(
      raw as StatusIndicator,
    )
      ? (raw as StatusIndicator)
      : "unknown";
    latestStatus = {
      indicator,
      description: json.status?.description ?? "",
      fetchedAt: new Date().toISOString(),
    };
  } catch (err) {
    app.log.warn(
      { err: err instanceof Error ? err.message : String(err) },
      "claude status fetch failed",
    );
    latestStatus = {
      indicator: "unknown",
      description: "Status unavailable",
      fetchedAt: new Date().toISOString(),
    };
  }
};

app.get("/api/status", async () => latestStatus);

app.get(
  "/api/usage",
  async () => usageRecord ?? { receivedAt: null, payload: null },
);

app.post("/api/usage", async (request, reply) => {
  const record: UsageRecord = {
    receivedAt: new Date().toISOString(),
    payload: (request.body as unknown) ?? null,
  };
  usageRecord = record;
  await saveUsage(record);
  reply.code(204).send();
});

app.get<{ Querystring: { since?: string } }>(
  "/api/data",
  async (request) => {
    const data = await scanClaudeSessions();
    const since = request.query.since;
    if (!since) return data;
    return {
      generatedAt: data.generatedAt,
      sessions: data.sessions.filter(
        (s) => s.lastSeen != null && s.lastSeen > since,
      ),
      usage: data.usage.filter((u) => u.time > since),
    };
  },
);

if (isProd) {
  const fastifyStatic = (await import("@fastify/static")).default;
  const root = path.resolve(process.cwd(), "dist/client");

  await app.register(fastifyStatic, {
    root,
    prefix: "/",
    index: ["index.html"],
  });

  app.setNotFoundHandler((_request, reply) => {
    reply.sendFile("index.html");
  });
} else {
  const { createServer: createViteServer } = await import("vite");
  const vite = await createViteServer({
    root: path.resolve(process.cwd(), "src/client"),
    server: { middlewareMode: true },
    appType: "spa",
  });

  app.setNotFoundHandler((request, reply) => {
    vite.middlewares(request.raw, reply.raw, (err?: unknown) => {
      if (err) {
        reply.code(500).send(err);
        return;
      }
      if (!reply.raw.headersSent) {
        reply.callNotFound();
      }
    });
  });
}

await loadUsage();
await app.listen({ port: PORT, host: HOST });

void checkBreaches();
setInterval(() => {
  void checkBreaches();
}, SCAN_INTERVAL_MS);

void fetchClaudeStatus();
setInterval(() => {
  void fetchClaudeStatus();
}, STATUS_POLL_MS);
