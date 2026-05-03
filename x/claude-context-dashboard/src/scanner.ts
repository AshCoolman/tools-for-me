import fs from "node:fs";
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import fg from "fast-glob";
import type {
  DashboardData,
  SessionSummary,
  TokenUsage,
  UsagePoint,
} from "./types.js";

type UnknownRecord = Record<string, unknown>;

type SessionAccumulator = {
  sessionId: string;
  project: string;
  projectPath: string | null;
  path: string;
  firstSeen: string | null;
  lastSeen: string | null;
  messageCount: number;
  usage: TokenUsage;
  latestUsageTime: string | null;
  latestContextSize: number;
  latestTextTime: string | null;
  latestText: string | null;
  latestPromptTime: string | null;
  latestPrompt: string | null;
  compactedAt: string | null;
};

const tildify = (p: string | null, homedir: string): string | null => {
  if (!p) return null;
  if (p === homedir) return "~";
  if (p.startsWith(homedir + path.sep)) {
    return "~" + p.slice(homedir.length);
  }
  return p;
};

// Claude Code names per-project session dirs by replacing `/` and `_` with `-`,
// e.g. `/Users/x/_y/and-z` → `-Users-x--y-and-z``.
// Decoding is ambiguous, so we walk the real filesystem to disambiguate.
const decodeCache = new Map<string, string | null>();
const decodeProjectDir = (dirName: string): string | null => {
  if (decodeCache.has(dirName)) return decodeCache.get(dirName) ?? null;
  const resolved = (() => {
    if (!dirName.startsWith("-")) return null;
    const segments = dirName.slice(1).split("-");
    let current = "/";
    let i = 0;
    while (i < segments.length) {
      let entries: fs.Dirent[];
      try {
        entries = fs.readdirSync(current, { withFileTypes: true });
      } catch {
        return null;
      }
      let matched = false;
      for (let j = segments.length; j > i; j--) {
        const target = segments.slice(i, j).join("-");
        const hit = entries.find(
          (e) => e.isDirectory() && e.name.replace(/_/g, "-") === target,
        );
        if (hit) {
          current = path.join(current, hit.name);
          i = j;
          matched = true;
          break;
        }
      }
      if (!matched) return null;
    }
    return current;
  })();
  decodeCache.set(dirName, resolved);
  return resolved;
};

const TAIL_MAX_CHARS = 280;

const extractText = (record: UnknownRecord): string | null => {
  if (record.type !== "user" && record.type !== "assistant") return null;
  const message = objectValue(record.message);
  const content = message.content;

  if (typeof content === "string") {
    const trimmed = content.trim();
    return trimmed.length > 0 ? trimmed : null;
  }

  if (!Array.isArray(content)) return null;

  const parts: string[] = [];
  for (const item of content) {
    const itemObj = objectValue(item);
    if (itemObj.type !== "text") continue;
    const text = stringValue(itemObj.text);
    if (text) parts.push(text);
  }

  if (parts.length === 0) return null;
  const joined = parts.join(" ").replace(/\s+/g, " ").trim();
  return joined.length > 0 ? joined : null;
};

const truncate = (s: string, max: number): string =>
  s.length <= max ? s : s.slice(0, max);

const DEFAULT_CONTEXT_LIMIT = Number(
  process.env.CLAUDE_CONTEXT_LIMIT ?? 1_000_000,
);

const numberValue = (value: unknown): number => {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
};

const stringValue = (value: unknown): string | null => {
  return typeof value === "string" && value.length > 0 ? value : null;
};

const objectValue = (value: unknown): UnknownRecord => {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as UnknownRecord)
    : {};
};

const addUsage = (a: TokenUsage, b: TokenUsage): TokenUsage => ({
  input: a.input + b.input,
  output: a.output + b.output,
  cacheRead: a.cacheRead + b.cacheRead,
  cacheCreation: a.cacheCreation + b.cacheCreation,
  total: a.total + b.total,
});

const getTimestamp = (record: UnknownRecord): string | null => {
  return (
    stringValue(record.timestamp) ??
    stringValue(record.created_at) ??
    stringValue(record.createdAt) ??
    stringValue(record.time)
  );
};

const getUsage = (record: UnknownRecord): TokenUsage => {
  const message = objectValue(record.message);
  const usage = objectValue(record.usage ?? message.usage);

  const input = numberValue(usage.input_tokens);
  const output = numberValue(usage.output_tokens);
  const cacheRead = numberValue(usage.cache_read_input_tokens);
  const cacheCreation = numberValue(usage.cache_creation_input_tokens);

  return {
    input,
    output,
    cacheRead,
    cacheCreation,
    total: input + output + cacheRead + cacheCreation,
  };
};

const getSessionId = (record: UnknownRecord, filePath: string): string => {
  return (
    stringValue(record.sessionId) ??
    stringValue(record.session_id) ??
    stringValue(record.conversation_id) ??
    path.basename(filePath, ".jsonl")
  );
};

const getProject = (record: UnknownRecord, filePath: string): string => {
  const cwd = stringValue(record.cwd);
  if (cwd) return path.basename(cwd);

  const parent = path.basename(path.dirname(filePath));
  return parent || "unknown";
};

const parseJsonl = (raw: string): UnknownRecord[] => {
  return raw
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .flatMap((line) => {
      try {
        const parsed = JSON.parse(line);
        return parsed && typeof parsed === "object" && !Array.isArray(parsed)
          ? [parsed as UnknownRecord]
          : [];
      } catch {
        return [];
      }
    });
};

// Claude Code writes each assistant response 2–3× during streaming with the
// same message.id and a growing usage block. Keep only the final snapshot so
// totals match what the API actually billed.
const dedupStreamingSnapshots = (records: UnknownRecord[]): UnknownRecord[] => {
  const lastIndexByMessageId = new Map<string, number>();
  records.forEach((rec, i) => {
    const id = stringValue(objectValue(rec.message).id);
    if (id) lastIndexByMessageId.set(id, i);
  });
  return records.filter((rec, i) => {
    const id = stringValue(objectValue(rec.message).id);
    if (!id) return true;
    return lastIndexByMessageId.get(id) === i;
  });
};

const eventContextSize = (usage: TokenUsage): number => {
  return usage.input + usage.cacheRead + usage.cacheCreation + usage.output;
};

const SECOND_MS = 1000;

// Collapse usage events that fall in the same wall-clock second for the same
// session into a single point. Streaming snapshots and tightly-spaced turns
// are otherwise indistinguishable on the chart but multiply the payload.
const bucketUsageBySecond = (points: UsagePoint[]): UsagePoint[] => {
  const buckets = new Map<string, UsagePoint>();
  for (const p of points) {
    const t = new Date(p.time).getTime();
    if (!Number.isFinite(t)) continue;
    const second = Math.floor(t / SECOND_MS);
    const key = `${p.sessionId}|${second}`;
    const existing = buckets.get(key);
    if (!existing) {
      buckets.set(key, { ...p });
      continue;
    }
    existing.input += p.input;
    existing.output += p.output;
    existing.cacheRead += p.cacheRead;
    existing.cacheCreation += p.cacheCreation;
    existing.total += p.total;
    if (p.time > existing.time) {
      existing.time = p.time;
      existing.contextSize = p.contextSize;
    }
  }
  return [...buckets.values()];
};

type FileScan = {
  mtimeMs: number;
  sessionFragments: Map<string, SessionAccumulator>;
  usage: UsagePoint[];
};

const fileCache = new Map<string, FileScan>();

const scanFile = async (file: string, mtimeMs: number): Promise<FileScan> => {
  const raw = await fsp.readFile(file, "utf8");
  const records = dedupStreamingSnapshots(parseJsonl(raw));

  const sessionFragments = new Map<string, SessionAccumulator>();
  const usage: UsagePoint[] = [];

  for (const record of records) {
    const sessionId = getSessionId(record, file);
    const project = getProject(record, file);
    const timestamp = getTimestamp(record);
    const eventUsage = getUsage(record);
    const cwd = stringValue(record.cwd);

    const existing = sessionFragments.get(sessionId) ?? {
      sessionId,
      project,
      projectPath: null,
      path: file,
      firstSeen: timestamp,
      lastSeen: timestamp,
      messageCount: 0,
      usage: {
        input: 0,
        output: 0,
        cacheRead: 0,
        cacheCreation: 0,
        total: 0,
      },
      latestUsageTime: null,
      latestContextSize: 0,
      latestTextTime: null,
      latestText: null,
      latestPromptTime: null,
      latestPrompt: null,
      compactedAt: null,
    };

    if (cwd && !existing.projectPath) {
      existing.projectPath = cwd;
      existing.project = path.basename(cwd);
    }

    existing.messageCount += 1;
    existing.usage = addUsage(existing.usage, eventUsage);

    if (timestamp && (!existing.firstSeen || timestamp < existing.firstSeen)) {
      existing.firstSeen = timestamp;
    }

    if (timestamp && (!existing.lastSeen || timestamp > existing.lastSeen)) {
      existing.lastSeen = timestamp;
    }

    const ctxSize = eventContextSize(eventUsage);
    if (
      timestamp &&
      ctxSize > 0 &&
      (!existing.latestUsageTime || timestamp > existing.latestUsageTime)
    ) {
      existing.latestUsageTime = timestamp;
      existing.latestContextSize = ctxSize;
    }

    const text = extractText(record);
    if (
      text &&
      timestamp &&
      record.type === "assistant" &&
      (!existing.latestTextTime || timestamp > existing.latestTextTime)
    ) {
      existing.latestTextTime = timestamp;
      existing.latestText = truncate(text, TAIL_MAX_CHARS);
    }
    if (
      text &&
      timestamp &&
      record.type === "user" &&
      (!existing.latestPromptTime || timestamp > existing.latestPromptTime)
    ) {
      existing.latestPromptTime = timestamp;
      existing.latestPrompt = truncate(text, TAIL_MAX_CHARS);
    }

    if (
      record.type === "system" &&
      record.subtype === "compact_boundary" &&
      timestamp
    ) {
      if (!existing.compactedAt || timestamp > existing.compactedAt) {
        existing.compactedAt = timestamp;
      }
      const meta = objectValue(record.compactMetadata);
      const postTokens = numberValue(meta.postTokens);
      if (postTokens > 0) {
        if (!existing.latestUsageTime || timestamp > existing.latestUsageTime) {
          existing.latestUsageTime = timestamp;
          existing.latestContextSize = postTokens;
        }
        usage.push({
          time: timestamp,
          sessionId,
          project,
          input: 0,
          output: 0,
          cacheRead: 0,
          cacheCreation: 0,
          total: 0,
          contextSize: postTokens,
        });
      }
    }

    sessionFragments.set(sessionId, existing);

    if (timestamp && eventUsage.total > 0) {
      usage.push({
        time: timestamp,
        sessionId,
        project,
        ...eventUsage,
        contextSize: ctxSize,
      });
    }
  }

  return { mtimeMs, sessionFragments, usage };
};

const cloneAcc = (a: SessionAccumulator): SessionAccumulator => ({
  ...a,
  usage: { ...a.usage },
});

const mergeAcc = (
  a: SessionAccumulator,
  b: SessionAccumulator,
): SessionAccumulator => {
  const out = cloneAcc(a);
  out.messageCount += b.messageCount;
  out.usage = addUsage(out.usage, b.usage);
  if (b.firstSeen && (!out.firstSeen || b.firstSeen < out.firstSeen)) {
    out.firstSeen = b.firstSeen;
  }
  if (b.lastSeen && (!out.lastSeen || b.lastSeen > out.lastSeen)) {
    out.lastSeen = b.lastSeen;
  }
  if (
    b.latestUsageTime &&
    (!out.latestUsageTime || b.latestUsageTime > out.latestUsageTime)
  ) {
    out.latestUsageTime = b.latestUsageTime;
    out.latestContextSize = b.latestContextSize;
  }
  if (
    b.latestTextTime &&
    (!out.latestTextTime || b.latestTextTime > out.latestTextTime)
  ) {
    out.latestTextTime = b.latestTextTime;
    out.latestText = b.latestText;
  }
  if (
    b.latestPromptTime &&
    (!out.latestPromptTime || b.latestPromptTime > out.latestPromptTime)
  ) {
    out.latestPromptTime = b.latestPromptTime;
    out.latestPrompt = b.latestPrompt;
  }
  if (b.compactedAt && (!out.compactedAt || b.compactedAt > out.compactedAt)) {
    out.compactedAt = b.compactedAt;
  }
  if (!out.projectPath && b.projectPath) {
    out.projectPath = b.projectPath;
    out.project = b.project;
  }
  return out;
};

const TTL_MS = 1500;
type CacheEntry = { result: DashboardData; at: number };
const resultCache = new Map<string, CacheEntry>();
const inflightByKey = new Map<string, Promise<DashboardData>>();

const doScan = async (
  claudeProjectsDir: string,
  contextLimit: number,
): Promise<DashboardData> => {
  const pattern = path.join(claudeProjectsDir, "**/*.jsonl");
  const files = await fg(pattern, { absolute: true, onlyFiles: true });
  const homedir = os.homedir();
  const present = new Set(files);

  for (const cachedPath of fileCache.keys()) {
    if (!present.has(cachedPath)) fileCache.delete(cachedPath);
  }

  const stats = await Promise.all(
    files.map((f) => fsp.stat(f).catch(() => null)),
  );

  const toScan: { file: string; mtimeMs: number }[] = [];
  for (let i = 0; i < files.length; i++) {
    const stat = stats[i];
    if (!stat) continue;
    const mtimeMs = stat.mtimeMs;
    const cached = fileCache.get(files[i]);
    if (!cached || cached.mtimeMs !== mtimeMs) {
      toScan.push({ file: files[i], mtimeMs });
    }
  }

  if (toScan.length > 0) {
    const scanned = await Promise.all(
      toScan.map(({ file, mtimeMs }) => scanFile(file, mtimeMs)),
    );
    for (let i = 0; i < toScan.length; i++) {
      fileCache.set(toScan[i].file, scanned[i]);
    }
  }

  const sessions = new Map<string, SessionAccumulator>();
  const usage: UsagePoint[] = [];
  for (const fileScan of fileCache.values()) {
    for (const [sid, frag] of fileScan.sessionFragments) {
      const existing = sessions.get(sid);
      sessions.set(sid, existing ? mergeAcc(existing, frag) : cloneAcc(frag));
    }
    for (const u of fileScan.usage) usage.push(u);
  }

  const sessionSummaries: SessionSummary[] = [...sessions.values()]
    .map((session) => {
      const used = session.latestContextSize;

      let projectPath = session.projectPath;
      let project = session.project;
      if (!projectPath) {
        const dirName = path.basename(path.dirname(session.path));
        const resolved = decodeProjectDir(dirName);
        if (resolved) {
          projectPath = resolved;
          project = path.basename(resolved);
        }
      }

      return {
        sessionId: session.sessionId,
        project,
        projectPath: tildify(projectPath, homedir),
        path: session.path,
        firstSeen: session.firstSeen,
        lastSeen: session.lastSeen,
        messageCount: session.messageCount,
        usage: session.usage,
        contextTokens: used,
        contextLimit,
        contextPercent: Math.min(
          100,
          Math.round((used / contextLimit) * 1000) / 10,
        ),
        tail: session.latestText,
        lastPrompt: session.latestPrompt,
        lastPromptAt: session.latestPromptTime,
        lastReplyAt: session.latestTextTime,
        compactedAt: session.compactedAt,
      };
    })
    .sort((a, b) => (b.lastSeen ?? "").localeCompare(a.lastSeen ?? ""));

  return {
    generatedAt: new Date().toISOString(),
    sessions: sessionSummaries,
    usage: bucketUsageBySecond(usage).sort((a, b) =>
      a.time.localeCompare(b.time),
    ),
  };
};

export const scanClaudeSessions = async (
  claudeProjectsDir = path.join(os.homedir(), ".claude", "projects"),
  contextLimit = DEFAULT_CONTEXT_LIMIT,
): Promise<DashboardData> => {
  const key = `${claudeProjectsDir}|${contextLimit}`;
  const now = Date.now();
  const cached = resultCache.get(key);
  if (cached && now - cached.at < TTL_MS) return cached.result;

  const existing = inflightByKey.get(key);
  if (existing) return existing;

  const promise = doScan(claudeProjectsDir, contextLimit)
    .then((result) => {
      resultCache.set(key, { result, at: Date.now() });
      return result;
    })
    .finally(() => {
      inflightByKey.delete(key);
    });
  inflightByKey.set(key, promise);
  return promise;
};
