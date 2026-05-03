import { useCallback, useEffect, useState } from "react";
import type { UsagePointEx } from "./App.js";

type UsageRecord = {
  receivedAt: string | null;
  payload: unknown;
};

const STALE_MS = 24 * 60 * 60 * 1000;
const POLL_MS = 60_000;
const LIMITS_KEY = "claude-context-dashboard:usage-limits";
const PARSED_KEY = "claude-context-dashboard:parsed-usage";
const SESSION_LEN_MS = 5 * 60 * 60 * 1000;

const parseDurationMs = (s: string): number | null => {
  const text = s.toLowerCase();
  let ms = 0;
  let matched = false;
  const hr = text.match(/(\d+)\s*(?:hr?|hour)s?/);
  if (hr) {
    ms += Number(hr[1]) * 3_600_000;
    matched = true;
  }
  const min = text.match(/(\d+)\s*(?:min|minute)s?/);
  if (min) {
    ms += Number(min[1]) * 60_000;
    matched = true;
  }
  return matched ? ms : null;
};

const sumSince = (usage: UsagePointEx[], sinceMs: number): number => {
  let total = 0;
  for (const u of usage) {
    if (u.tMs >= sinceMs) total += u.total;
  }
  return total;
};

type ParsedUsage = {
  plan: string | null;
  sessionPctUsed: number | null;
  weeklyPctUsed: number | null;
  sessionReset: string | null;
  weeklyReset: string | null;
  calibratedAt: string;
};

export type UsageLimits = { sessionLimit: number; weeklyLimit: number };

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const DAY_TO_NUM: Record<string, number> = {
  sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6,
};

export const weekWindow = (
  anchor: string | null | undefined,
  nowMs: number = Date.now(),
): { start: number; end: number } => {
  if (anchor) {
    const m = anchor.match(/^(Sun|Mon|Tue|Wed|Thu|Fri|Sat)\w*\s+(\d{1,2}):(\d{2})\s*([AP]M)$/i);
    if (m) {
      const day = DAY_TO_NUM[m[1].slice(0, 3).toLowerCase()];
      let hour = Number(m[2]);
      const min = Number(m[3]);
      const ampm = m[4].toUpperCase();
      if (ampm === "PM" && hour < 12) hour += 12;
      if (ampm === "AM" && hour === 12) hour = 0;
      const reset = new Date(nowMs);
      reset.setHours(hour, min, 0, 0);
      const dowDiff = (day - reset.getDay() + 7) % 7;
      reset.setDate(reset.getDate() + dowDiff);
      if (reset.getTime() <= nowMs) reset.setDate(reset.getDate() + 7);
      const end = reset.getTime();
      return { start: end - WEEK_MS, end };
    }
  }
  const d = new Date(nowMs);
  d.setHours(0, 0, 0, 0);
  const dow = d.getDay();
  d.setDate(d.getDate() - (dow === 0 ? 6 : dow - 1));
  return { start: d.getTime(), end: d.getTime() + WEEK_MS };
};

const parseUsageBlob = (raw: string): ParsedUsage | null => {
  const text = raw.replace(/\s+/g, " ").trim();
  if (!text) return null;

  const planMatch = text.match(/(Max\s*\([^)]+\)|Pro|Team|Enterprise)/i);
  const sessionPctMatch = text.match(/Current\s+session[\s\S]*?(\d+)\s*%\s*used/i);
  const weeklyPctMatch = text.match(/Weekly\s+limits?[\s\S]*?(\d+)\s*%\s*used/i);
  const sessionResetMatch = text.match(
    /Current\s+session[\s\S]*?Resets?\s+in\s+(\d+\s*(?:hr?|min|hour|minute)s?(?:\s+\d+\s*(?:hr?|min|hour|minute)s?)?)/i,
  );
  const weeklyResetMatch = text.match(
    /Weekly\s+limits?[\s\S]*?Resets?\s+(Mon|Tue|Wed|Thu|Fri|Sat|Sun)\w*\s+(\d+:\d+\s*[AP]M)/i,
  );

  if (sessionPctMatch == null && weeklyPctMatch == null) return null;

  return {
    plan: planMatch?.[0] ?? null,
    sessionPctUsed: sessionPctMatch ? Number(sessionPctMatch[1]) : null,
    weeklyPctUsed: weeklyPctMatch ? Number(weeklyPctMatch[1]) : null,
    sessionReset: sessionResetMatch?.[1] ?? null,
    weeklyReset: weeklyResetMatch ? `${weeklyResetMatch[1]} ${weeklyResetMatch[2]}` : null,
    calibratedAt: new Date().toISOString(),
  };
};

const formatAge = (iso: string): string => {
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 60_000) return "just now";
  const mins = Math.floor(ms / 60_000);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
};

const formatK = (n: number): string => {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${Math.round(n / 1_000)}k`;
  return String(Math.round(n));
};

export const useUsageLimits = (): {
  limits: UsageLimits;
  setLimits: (next: UsageLimits) => void;
  parsed: ParsedUsage | null;
  setParsed: (next: ParsedUsage | null) => void;
} => {
  const [limits, setLimitsState] = useState<UsageLimits>(() => {
    try {
      const raw = localStorage.getItem(LIMITS_KEY);
      if (raw) {
        const obj = JSON.parse(raw) as Partial<UsageLimits>;
        const s = Number(obj?.sessionLimit);
        const w = Number(obj?.weeklyLimit);
        return {
          sessionLimit: Number.isFinite(s) && s > 0 ? s : 0,
          weeklyLimit: Number.isFinite(w) && w > 0 ? w : 0,
        };
      }
    } catch {
      /* ignore */
    }
    return { sessionLimit: 0, weeklyLimit: 0 };
  });

  const [parsed, setParsedState] = useState<ParsedUsage | null>(() => {
    try {
      const raw = localStorage.getItem(PARSED_KEY);
      return raw ? (JSON.parse(raw) as ParsedUsage) : null;
    } catch {
      return null;
    }
  });

  const setLimits = useCallback((next: UsageLimits) => {
    setLimitsState(next);
    try {
      localStorage.setItem(LIMITS_KEY, JSON.stringify(next));
    } catch {
      /* ignore */
    }
  }, []);

  const setParsed = useCallback((next: ParsedUsage | null) => {
    setParsedState(next);
    try {
      if (next == null) localStorage.removeItem(PARSED_KEY);
      else localStorage.setItem(PARSED_KEY, JSON.stringify(next));
    } catch {
      /* ignore */
    }
  }, []);

  return { limits, setLimits, parsed, setParsed };
};

export const TokenUsageSettings = ({
  limits,
  setLimits,
  parsed,
  setParsed,
  usage,
}: {
  limits: UsageLimits;
  setLimits: (next: UsageLimits) => void;
  parsed: ParsedUsage | null;
  setParsed: (next: ParsedUsage | null) => void;
  usage: UsagePointEx[];
}) => {
  const [record, setRecord] = useState<UsageRecord | null>(null);
  const [pasteInput, setPasteInput] = useState("");

  useEffect(() => {
    let cancelled = false;
    const tick = async () => {
      try {
        const res = await fetch("/api/usage");
        if (!res.ok) return;
        const r = (await res.json()) as UsageRecord;
        if (!cancelled) setRecord(r);
      } catch {
        /* transient */
      }
    };
    void tick();
    const id = setInterval(tick, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  const fresh =
    record?.receivedAt != null &&
    Date.now() - new Date(record.receivedAt).getTime() < STALE_MS;

  const applyPaste = useCallback(() => {
    const result = parseUsageBlob(pasteInput);
    if (!result) return;

    const nowMs = Date.now();
    let nextSession = limits.sessionLimit;
    let nextWeekly = limits.weeklyLimit;

    if (
      result.sessionPctUsed &&
      result.sessionPctUsed > 0 &&
      result.sessionReset
    ) {
      const remainingMs = parseDurationMs(result.sessionReset);
      if (
        remainingMs != null &&
        remainingMs >= 0 &&
        remainingMs <= SESSION_LEN_MS
      ) {
        const sessionStart = nowMs - (SESSION_LEN_MS - remainingMs);
        const tokens = sumSince(usage, sessionStart);
        if (tokens > 0) {
          nextSession = Math.round(tokens / (result.sessionPctUsed / 100));
        }
      }
    }

    if (
      result.weeklyPctUsed &&
      result.weeklyPctUsed > 0 &&
      result.weeklyReset
    ) {
      const { start } = weekWindow(result.weeklyReset, nowMs);
      const tokens = sumSince(usage, start);
      if (tokens > 0) {
        nextWeekly = Math.round(tokens / (result.weeklyPctUsed / 100));
      }
    }

    if (
      nextSession !== limits.sessionLimit ||
      nextWeekly !== limits.weeklyLimit
    ) {
      setLimits({ sessionLimit: nextSession, weeklyLimit: nextWeekly });
    }
    const merged: ParsedUsage = {
      plan: result.plan ?? parsed?.plan ?? null,
      sessionPctUsed: result.sessionPctUsed,
      weeklyPctUsed: result.weeklyPctUsed,
      sessionReset: result.sessionReset ?? parsed?.sessionReset ?? null,
      weeklyReset: result.weeklyReset ?? parsed?.weeklyReset ?? null,
      calibratedAt: result.calibratedAt,
    };
    setParsed(merged);
    setPasteInput("");
  }, [pasteInput, usage, limits, parsed, setLimits, setParsed]);

  return (
    <>
      <div className="settings-row">
        <div className="settings-row__label">
          <div className="settings-row__title">Webhook status</div>
          <div className="settings-row__hint">
            {fresh ? (
              <>
                Received <code>POST /api/usage</code>{" "}
                {formatAge(record!.receivedAt!)}.
              </>
            ) : (
              <>
                {record ? "Last payload is stale." : "No payload received yet."}{" "}
                Have your usage source <code>POST /api/usage</code> with the
                Claude usage JSON.
              </>
            )}
          </div>
        </div>
      </div>
      <div className="settings-row settings-row--column">
        <div className="settings-row__label">
          <div className="settings-row__title">Calibrate from /usage paste</div>
          <div className="settings-row__hint">
            Paste the text from <code>/usage</code> in Claude Code (or the
            Claude usage page). Plan, session %, weekly %, and reset times are
            extracted to calibrate the limits below.
          </div>
        </div>
        <input
          type="text"
          className="usage-footer__paste"
          placeholder="Paste from Claude usage page"
          value={pasteInput}
          onChange={(e) => setPasteInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              (e.currentTarget as HTMLInputElement).blur();
            }
          }}
          onBlur={applyPaste}
        />
        {parsed && (
          <div className="usage-footer__parsed">
            {parsed.plan && (
              <span className="usage-footer__tag">{parsed.plan}</span>
            )}
            {parsed.sessionPctUsed != null && (
              <span className="usage-footer__tag">
                session {parsed.sessionPctUsed}%
              </span>
            )}
            {parsed.weeklyPctUsed != null && (
              <span className="usage-footer__tag">
                weekly {parsed.weeklyPctUsed}%
              </span>
            )}
            {parsed.sessionReset && (
              <span className="usage-footer__tag">
                session resets {parsed.sessionReset}
              </span>
            )}
            {parsed.weeklyReset && (
              <span className="usage-footer__tag">
                weekly resets {parsed.weeklyReset}
              </span>
            )}
            {limits.sessionLimit > 0 && (
              <span className="usage-footer__tag">
                session cap ≈ {formatK(limits.sessionLimit)}
              </span>
            )}
            {limits.weeklyLimit > 0 && (
              <span className="usage-footer__tag">
                weekly cap ≈ {formatK(limits.weeklyLimit)}
              </span>
            )}
            <span className="usage-footer__age">
              calibrated {formatAge(parsed.calibratedAt)}
            </span>
          </div>
        )}
      </div>
    </>
  );
};
