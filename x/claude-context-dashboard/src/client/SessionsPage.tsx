import {
  Fragment,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { EnrichedData, UsagePointEx } from "./App.js";
import {
  Chart,
  ChartLegend,
  CHART_MARGIN_LEFT,
  CHART_MARGIN_RIGHT,
  type ChartLine,
} from "./Chart.js";
import { Feature, FeatureControlBar, useFeature, useFeaturesCtx } from "./Features.js";
import { useSettings } from "./Settings.js";
import { RowSparkline, type SparkPoint } from "./Sparkline.js";
import { UsageCumStrip } from "./UsageCumStrip.js";
import { UsageStrip } from "./UsageStrip.js";

// Row sparkline lives inside .session-row's padding box (offset by 1.5px border
// on each side). The Chart, UsageStrip and UsageCumStrip share .page width and
// the same CHART_MARGIN_LEFT/RIGHT, so subtracting the row's border keeps the
// per-row sparkline plot pixel-aligned with the chart strips above.
const SESSION_ROW_BORDER = 2; // matches CSS border on .session-row, rounded up
const SPARK_PAD_LEFT = CHART_MARGIN_LEFT - SESSION_ROW_BORDER;
const SPARK_PAD_RIGHT = CHART_MARGIN_RIGHT - SESSION_ROW_BORDER;

const ACTIVE_MS = 5 * 60 * 1000;
const PROJECT_COLORS_KEY = "claude-context-dashboard:project-colors";
const SESSION_COLORS_KEY = "claude-context-dashboard:session-colors";
const PROJECT_RESET_ACK_KEY = "claude-context-dashboard:project-reset-ack";
const DISMISSED_SESSIONS_KEY = "claude-context-dashboard:dismissed-sessions";
const SHADE_RANGE = 0.32;

const useDismissed = () => {
  const [dismissed, setDismissed] = useState<Record<string, number>>(() => {
    try {
      const raw = localStorage.getItem(DISMISSED_SESSIONS_KEY);
      return raw ? (JSON.parse(raw) as Record<string, number>) : {};
    } catch {
      return {};
    }
  });
  const persist = (next: Record<string, number>) => {
    try {
      localStorage.setItem(DISMISSED_SESSIONS_KEY, JSON.stringify(next));
    } catch {
      /* ignore */
    }
  };
  const dismiss = useCallback((sessionId: string, lastSeenMs: number) => {
    setDismissed((prev) => {
      const next = { ...prev, [sessionId]: lastSeenMs };
      persist(next);
      return next;
    });
  }, []);
  const restore = useCallback((sessionId: string) => {
    setDismissed((prev) => {
      if (!(sessionId in prev)) return prev;
      const next = { ...prev };
      delete next[sessionId];
      persist(next);
      return next;
    });
  }, []);
  const restoreAll = useCallback(() => {
    setDismissed((prev) => {
      if (Object.keys(prev).length === 0) return prev;
      persist({});
      return {};
    });
  }, []);
  return { dismissed, dismiss, restore, restoreAll };
};

const WINDOWS = [
  { label: "24h", longLabel: "24 hours", ms: 24 * 60 * 60 * 1000 },
  { label: "6h", longLabel: "6 hours", ms: 6 * 60 * 60 * 1000 },
  { label: "1h", longLabel: "1 hour", ms: 60 * 60 * 1000 },
  { label: "20m", longLabel: "20 minutes", ms: 20 * 60 * 1000 },
  { label: "1m", longLabel: "1 minute", ms: 60 * 1000 },
] as const;
const DEFAULT_WINDOW_MS = 6 * 60 * 60 * 1000;
const DAY_WINDOW_MS = 24 * 60 * 60 * 1000;

type Severity = "ok" | "warn" | "high" | "crit";

const severityFor = (
  tokens: number,
  warn: number,
  high: number,
  crit: number,
): Severity => {
  if (tokens >= crit) return "crit";
  if (tokens >= high) return "high";
  if (tokens >= warn) return "warn";
  return "ok";
};

const BAND_INFO: Record<
  Severity,
  { label: string; blurb: string; color: string }
> = {
  crit: {
    label: "Critical",
    blurb: "300k+ — approaching limits; expect slowdowns.",
    color: "#ef4444",
  },
  high: {
    label: "Large",
    blurb: "150k–300k — long session; consider /compact soon.",
    color: "#f97316",
  },
  warn: {
    label: "Medium",
    blurb: "50k–150k — substantial conversation, still responsive.",
    color: "#eab308",
  },
  ok: {
    label: "Fast",
    blurb: "<50k — snappy turns, tight focus.",
    color: "#22c55e",
  },
};

const hashHue = (s: string): number => {
  let h = 5381;
  for (let i = 0; i < s.length; i++) {
    h = (h * 33) ^ s.charCodeAt(i);
  }
  return Math.abs(h) % 360;
};

const hslToHex = (h: number, s: number, l: number): string => {
  const a = s * Math.min(l, 1 - l);
  const f = (n: number): string => {
    const k = (n + h / 30) % 12;
    const c = l - a * Math.max(-1, Math.min(k - 3, Math.min(9 - k, 1)));
    return Math.round(c * 255)
      .toString(16)
      .padStart(2, "0");
  };
  return `#${f(0)}${f(8)}${f(4)}`;
};

const defaultColor = (project: string): string =>
  hslToHex(hashHue(project), 0.7, 0.65);

const hexToHsl = (hex: string): [number, number, number] => {
  const h = hex.replace(/^#/, "");
  const r = parseInt(h.slice(0, 2), 16) / 255;
  const g = parseInt(h.slice(2, 4), 16) / 255;
  const b = parseInt(h.slice(4, 6), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let hue = 0;
  if (max === r) hue = (g - b) / d + (g < b ? 6 : 0);
  else if (max === g) hue = (b - r) / d + 2;
  else hue = (r - g) / d + 4;
  return [hue * 60, s, l];
};

const hash01 = (s: string): number => {
  let h = 5381;
  for (let i = 0; i < s.length; i++) {
    h = (h * 33) ^ s.charCodeAt(i);
  }
  return (Math.abs(h) % 10000) / 10000;
};

const shadeForSession = (baseHex: string, sessionId: string): string => {
  const [h, s, l] = hexToHsl(baseHex);
  const offset = (hash01(sessionId) - 0.5) * SHADE_RANGE;
  const newL = Math.max(0.3, Math.min(0.85, l + offset));
  return hslToHex(h, s, newL);
};

const useStoredColors = (
  storageKey: string,
): {
  colors: Record<string, string>;
  setColor: (id: string, color: string) => void;
  clearColors: (ids: string[]) => void;
} => {
  const [colors, setColors] = useState<Record<string, string>>(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      return raw ? (JSON.parse(raw) as Record<string, string>) : {};
    } catch {
      return {};
    }
  });

  const setColor = useCallback(
    (id: string, color: string) => {
      setColors((prev) => {
        const next = { ...prev, [id]: color };
        try {
          localStorage.setItem(storageKey, JSON.stringify(next));
        } catch {
          /* quota / disabled — ignore */
        }
        return next;
      });
    },
    [storageKey],
  );

  const clearColors = useCallback(
    (ids: string[]) => {
      if (ids.length === 0) return;
      setColors((prev) => {
        let changed = false;
        const next = { ...prev };
        for (const id of ids) {
          if (id in next) {
            delete next[id];
            changed = true;
          }
        }
        if (!changed) return prev;
        try {
          localStorage.setItem(storageKey, JSON.stringify(next));
        } catch {
          /* quota / disabled — ignore */
        }
        return next;
      });
    },
    [storageKey],
  );

  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key !== storageKey) return;
      try {
        setColors(e.newValue ? JSON.parse(e.newValue) : {});
      } catch {
        /* ignore */
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [storageKey]);

  return { colors, setColor, clearColors };
};

const DAY_MS = 24 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;
const MINUTE_MS = 60 * 1000;

const formatTime = (iso: string | null): string => {
  if (!iso) return "—";
  const d = new Date(iso);
  const diff = Date.now() - d.getTime();
  if (diff >= 0 && diff < DAY_MS) {
    if (diff < MINUTE_MS) return "just now";
    if (diff < HOUR_MS) return `${Math.round(diff / MINUTE_MS)}m ago`;
    const h = Math.floor(diff / HOUR_MS);
    const m = Math.round((diff % HOUR_MS) / MINUTE_MS);
    return m > 0 ? `${h}h ${m}m ago` : `${h}h ago`;
  }
  return d.toLocaleString(undefined, {
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
};

const shortSessionId = (id: string): string => id.split("-")[0] ?? id;

const formatTokensK = (n: number): string => `${Math.round(n / 1_000)}k`;

const splitProjectPath = (
  p: string,
): { dir: string; name: string } => {
  const idx = p.lastIndexOf("/");
  if (idx < 0) return { dir: "", name: p };
  return { dir: p.slice(0, idx + 1), name: p.slice(idx + 1) };
};

const Copyable = ({
  text,
  children,
  className = "",
  style,
  title,
}: {
  text: string;
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
  title?: string;
}) => {
  const [copied, setCopied] = useState(false);
  const onClick = useCallback(
    async (e: React.MouseEvent) => {
      e.stopPropagation();
      try {
        await navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 1100);
      } catch {
        /* clipboard blocked — give up silently */
      }
    },
    [text],
  );
  return (
    <span
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e: React.KeyboardEvent) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          void onClick(e as unknown as React.MouseEvent);
        }
      }}
      title={copied ? "Copied" : (title ?? "Click to copy")}
      className={`${className} copyable${copied ? " copyable--copied" : ""}`}
      style={style}
    >
      {children}
    </span>
  );
};

const sessionEvents = (
  events: UsagePointEx[] | undefined,
  cutoff: number,
  now: number,
): SparkPoint[] => {
  if (!events || events.length === 0) return [];
  let cum = 0;
  const points: SparkPoint[] = [];
  for (const e of events) {
    if (e.tMs < cutoff) continue;
    cum += e.total;
    points.push({ t: e.tMs, ctx: e.contextSize, cum });
  }
  if (points.length > 0) {
    const last = points[points.length - 1];
    if (last.t < now) {
      points.push({ t: now, ctx: last.ctx, cum: last.cum });
    }
  }
  return points;
};

const SessionConvo = ({
  tail,
  prompt,
}: {
  tail: string | null;
  prompt: string | null;
}) => {
  const [pulse, setPulse] = useState(false);
  const prevTailRef = useRef<string | null>(tail);

  useEffect(() => {
    const prev = prevTailRef.current;
    prevTailRef.current = tail;
    if (tail && tail !== prev) {
      setPulse(true);
      const t = setTimeout(() => setPulse(false), 1400);
      return () => clearTimeout(t);
    }
  }, [tail]);

  if (!tail && !prompt) return null;
  return (
    <span
      className={`session-convo${tail && prompt ? " session-convo--swap" : ""}`}
    >
      {prompt && (
        <span className="session-convo__line session-convo__prompt" title={prompt}>
          <span className="session-convo__tag">prompt:</span> {prompt}
        </span>
      )}
      {tail && (
        <span
          className={`session-convo__line session-convo__reply${pulse ? " session-convo__reply--pulse" : ""}`}
          title={tail}
        >
          <span className="session-convo__tag">reply:</span> {tail}
        </span>
      )}
    </span>
  );
};

export const SessionsPage = ({
  data,
  usageBySession,
  nowMs,
  search,
  setSearch,
  sessionLimit,
  weeklyLimit,
  weekStart,
  weekEnd,
}: {
  data: EnrichedData;
  usageBySession: Map<string, UsagePointEx[]>;
  nowMs: number;
  search: string;
  setSearch: (s: string) => void;
  sessionLimit: number;
  weeklyLimit: number;
  weekStart: number;
  weekEnd: number;
}) => {
  const now = nowMs;
  const [windowMs, setWindowMs] = useState<number>(DEFAULT_WINDOW_MS);
  const [yWindowMs, setYWindowMs] = useState<number>(DEFAULT_WINDOW_MS);
  const [dayInput, setDayInput] = useState<string>("");
  const cutoff = now - windowMs;
  const xDomain = useMemo<[number, number]>(() => [cutoff, now], [cutoff, now]);
  const effectiveYWindowMs = Math.min(yWindowMs, windowMs);
  const yCutoff = now - effectiveYWindowMs;
  const activeWindow = WINDOWS.find((w) => w.ms === windowMs);
  const windowLongLabel = activeWindow
    ? activeWindow.longLabel
    : (() => {
        const d = windowMs / DAY_WINDOW_MS;
        return d === 1 ? "1 day" : `${d % 1 === 0 ? d : d.toFixed(1)} days`;
      })();
  const applyDays = useCallback(() => {
    const n = Number(dayInput);
    if (Number.isFinite(n) && n > 0) {
      setWindowMs(n * DAY_WINDOW_MS);
    }
  }, [dayInput]);
  const pickPreset = useCallback((ms: number) => {
    setWindowMs(ms);
    setDayInput("");
  }, []);
  const { colors: projectColors, setColor: setProjectColor } =
    useStoredColors(PROJECT_COLORS_KEY);
  const {
    colors: sessionColors,
    setColor: setSessionColor,
    clearColors: clearSessionColors,
  } = useStoredColors(SESSION_COLORS_KEY);
  const { dismissed, dismiss, restore, restoreAll } = useDismissed();
  const [showDismissed, setShowDismissed] = useState(false);
  const [restoreInput, setRestoreInput] = useState("");
  const { settings } = useSettings();

  const projectSessionCount = useMemo(() => {
    const counts = new Map<string, number>();
    for (const s of data.sessions) {
      counts.set(s.project, (counts.get(s.project) ?? 0) + 1);
    }
    return counts;
  }, [data.sessions]);

  const handleProjectColorChange = useCallback(
    (project: string, color: string) => {
      const overriddenIds = data.sessions
        .filter((s) => s.project === project && sessionColors[s.sessionId])
        .map((s) => s.sessionId);

      if (overriddenIds.length > 0) {
        let ack = false;
        try {
          ack = localStorage.getItem(PROJECT_RESET_ACK_KEY) === "1";
        } catch {
          /* ignore */
        }
        if (!ack) {
          const ok = window.confirm(
            "Changing the project color will clear the custom session colors you've set within this project. Continue? (You won't be asked again.)",
          );
          if (!ok) return;
          try {
            localStorage.setItem(PROJECT_RESET_ACK_KEY, "1");
          } catch {
            /* ignore */
          }
        }
        clearSessionColors(overriddenIds);
      }
      setProjectColor(project, color);
    },
    [data.sessions, sessionColors, clearSessionColors, setProjectColor],
  );

  const rows = useMemo(() => {
    const tokens = search.toLowerCase().trim().split(/\s+/).filter(Boolean);
    const matchesSearch = (s: (typeof data.sessions)[number]) =>
      tokens.length === 0 || tokens.every((t) => s.haystack.includes(t));
    const activeCutoff = now - ACTIVE_MS;
    const isDismissed = (s: (typeof data.sessions)[number]) => {
      const at = dismissed[s.sessionId];
      return at != null && s.lastSeenMs <= at;
    };
    return data.sessions
      .filter(
        (s) =>
          s.contextTokens > 0 &&
          s.lastSeenMs >= cutoff &&
          matchesSearch(s) &&
          !isDismissed(s),
      )
      .sort((a, b) => b.contextTokens - a.contextTokens)
      .map((s) => ({
        session: s,
        active: s.lastSeenMs >= activeCutoff,
        sev: severityFor(
          s.contextTokens,
          settings.severityWarn,
          settings.severityHigh,
          settings.severityCrit,
        ),
      }));
  }, [
    data,
    cutoff,
    now,
    search,
    dismissed,
    settings.severityWarn,
    settings.severityHigh,
    settings.severityCrit,
  ]);

  const projectBaseFor = useCallback(
    (project: string) => projectColors[project] ?? defaultColor(project),
    [projectColors],
  );

  const lineColorFor = useCallback(
    (sessionId: string, project: string) =>
      sessionColors[sessionId] ??
      shadeForSession(projectBaseFor(project), sessionId),
    [sessionColors, projectBaseFor],
  );

  const lines: ChartLine[] = useMemo(() => {
    return rows.map((r) => ({
      sessionId: r.session.sessionId,
      project: r.session.project,
      projectPath: r.session.projectPath,
      name: r.session.projectPath
        ? splitProjectPath(r.session.projectPath).name
        : r.session.project,
      color: lineColorFor(r.session.sessionId, r.session.project),
      tail: r.session.tail,
      data: sessionEvents(
        usageBySession.get(r.session.sessionId),
        cutoff,
        now,
      ),
    }));
  }, [rows, usageBySession, cutoff, now, lineColorFor]);

  const sparkExtents = useMemo(() => {
    let yCtx = 0;
    let yCum = 0;
    for (const l of lines) {
      for (const p of l.data) {
        if (p.t < yCutoff) continue;
        if (p.ctx > yCtx) yCtx = p.ctx;
        if (p.cum > yCum) yCum = p.cum;
      }
    }
    return {
      yCtxMax: Math.max(yCtx * 1.05, 50_000),
      yCumMax: Math.max(yCum * 1.1, 50_000),
    };
  }, [lines, yCutoff]);

  const sparkBySession = useMemo(() => {
    const m = new Map<string, SparkPoint[]>();
    for (const l of lines) m.set(l.sessionId, l.data);
    return m;
  }, [lines]);

  const visibleSessionIds = useMemo(
    () => new Set(rows.map((r) => r.session.sessionId)),
    [rows],
  );

  const dismissedEntries = useMemo(() => {
    const sessionMap = new Map(data.sessions.map((s) => [s.sessionId, s]));
    const out: Array<{
      sessionId: string;
      lastSeenMs: number;
      session: (typeof data.sessions)[number] | undefined;
    }> = [];
    for (const [sessionId, lastSeenMs] of Object.entries(dismissed)) {
      const s = sessionMap.get(sessionId);
      if (!s || s.lastSeenMs <= lastSeenMs) {
        out.push({ sessionId, lastSeenMs, session: s });
      }
    }
    out.sort((a, b) => b.lastSeenMs - a.lastSeenMs);
    return out;
  }, [dismissed, data.sessions]);

  const submitRestoreInput = useCallback(() => {
    const id = restoreInput.trim();
    if (!id) return;
    restore(id);
    setRestoreInput("");
  }, [restoreInput, restore]);

  const showBands = useFeature("activeSessions.rows.bands");
  const showBigTitle = useFeature("activeSessions.rows.titleBig");
  const showSmallTitle = useFeature("activeSessions.rows.titleSmall");
  const showPrompt = useFeature("activeSessions.rows.prompt");
  const showReply = useFeature("activeSessions.rows.reply");
  const showTags = useFeature("activeSessions.rows.tags");
  const showSparkline = useFeature("activeSessions.rows.sparkline");
  const showBar = useFeature("activeSessions.rows.bar");

  const showContextChart = useFeature("activeSessions.contextChart");
  const showActivity = useFeature("activeSessions.activity");
  const showUsage = useFeature("activeSessions.usage");
  const showRows = useFeature("activeSessions.rows");
  const { editMode } = useFeaturesCtx();
  const headingVisible =
    editMode || showContextChart || showActivity || showUsage || showRows;

  const total = data.sessions.length;
  const shown = rows.length;

  return (
    <>
      {headingVisible && (
        <h2>Active sessions (last {windowLongLabel})</h2>
      )}
      <Feature id="activeSessions.blurb">
        <p className="card-blurb" title="Solid = per-turn context tokens (left axis: input + output + cache for that turn, or post-compact summary size); approximate, can drop after /compact or smaller turns. Dashed = cumulative API-billed tokens within this window (right axis: running sum of input + output + cacheRead + cacheCreation); monotonically increasing.">
          Showing {shown} of {total} sessions with activity in the last {windowLongLabel}.
        </p>
      </Feature>
      <Feature id="activeSessions.window">
        <div className="window-buttons" role="group" aria-label="Time range">
          <span className="window-label">Range</span>
          {WINDOWS.map((w) => (
            <button
              key={w.label}
              className={`tab ${windowMs === w.ms ? "active" : ""}`}
              onClick={() => pickPreset(w.ms)}
            >
              {w.label}
            </button>
          ))}
          <input
            type="number"
            min="1"
            step="1"
            inputMode="numeric"
            className={`window-days${!activeWindow ? " active" : ""}`}
            placeholder="days"
            aria-label="Custom range in days"
            value={dayInput}
            onChange={(e) => setDayInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.currentTarget.blur();
              }
            }}
            onBlur={applyDays}
          />
          <span className="window-label window-label--suffix" aria-hidden="true">d</span>
        </div>
      </Feature>
      <Feature id="activeSessions.contextChart">
        <Feature id="activeSessions.contextChart.yAxis">
          <div className="window-buttons" role="group" aria-label="Y-axis time range">
            <span className="window-label">Y-axis</span>
            {WINDOWS.map((w) => {
              const disabled = w.ms > windowMs;
              const active = !disabled && effectiveYWindowMs === w.ms;
              return (
                <button
                  key={w.label}
                  className={`tab ${active ? "active" : ""}`}
                  disabled={disabled}
                  onClick={() => setYWindowMs(w.ms)}
                >
                  {w.label}
                </button>
              );
            })}
          </div>
        </Feature>
        {lines.length === 0 ? (
          <div className="empty-state">
            <p className="empty-state__heading">No sessions in the last {windowLongLabel}</p>
            <p className="empty-state__body">
              The dashboard scans Claude Code session logs from <code>~/.claude/projects/</code>.
              Start a Claude Code session and it will appear here automatically.
            </p>
          </div>
        ) : (
          <>
            <Chart
              lines={lines}
              xDomain={xDomain}
              yCtxMax={Math.max(sparkExtents.yCtxMax, 300_000)}
              yCumMax={sparkExtents.yCumMax}
            />
            <FeatureControlBar
              ids={[
                "activeSessions.contextChart.bands",
                "activeSessions.contextChart.context",
                "activeSessions.contextChart.accumulator",
                "activeSessions.contextChart.peak",
              ]}
            />
            <ChartLegend lines={lines} />
          </>
        )}
      </Feature>
      {lines.length > 0 && (
        <>
          <Feature id="activeSessions.activity">
            <UsageStrip
              usage={data.usage}
              sessionIds={visibleSessionIds}
              xDomain={xDomain}
            />
          </Feature>
          <Feature id="activeSessions.usage">
            <UsageCumStrip
              usage={data.usage}
              sessionIds={visibleSessionIds}
              xDomain={xDomain}
              nowMs={now}
              sessionLimit={sessionLimit}
              weeklyLimit={weeklyLimit}
              weekStart={weekStart}
              weekEnd={weekEnd}
            />
          </Feature>
        </>
      )}

      {(rows.length > 0 || dismissedEntries.length > 0) && (
        <Feature id="activeSessions.rows">
          <div className="session-list" role="list">
            <FeatureControlBar
              ids={[
                "activeSessions.rows.bands",
                "activeSessions.rows.titleBig",
                "activeSessions.rows.titleSmall",
                "activeSessions.rows.prompt",
                "activeSessions.rows.reply",
                "activeSessions.rows.tags",
                "activeSessions.rows.sparkline",
                "activeSessions.rows.bar",
              ]}
              className="feature-control-bar--row"
            />
            <div className="session-list__bulk">
              {dismissedEntries.length > 0 && (
                <button
                  type="button"
                  className="text-link"
                  onClick={() => setShowDismissed((v) => !v)}
                  title="Restore sessions you previously dismissed"
                >
                  {showDismissed ? "Hide" : "Show"} {dismissedEntries.length}{" "}
                  dismissed
                </button>
              )}
              {rows.length > 0 && (
                <button
                  type="button"
                  className="text-link session-list__dismiss-all"
                  onClick={() => {
                    for (const r of rows) {
                      dismiss(r.session.sessionId, r.session.lastSeenMs);
                    }
                  }}
                  title="Hide all visible sessions until each gets new activity"
                >
                  Dismiss {rows.length} sessions until active
                </button>
              )}
            </div>
            {showDismissed && dismissedEntries.length > 0 && (
              <div className="dismissed-panel">
                <div className="dismissed-panel__header">
                  <h3 className="dismissed-panel__title">
                    Dismissed sessions
                  </h3>
                  <button
                    type="button"
                    className="text-link"
                    onClick={() => restoreAll()}
                  >
                    Restore all
                  </button>
                </div>
                <div className="dismissed-panel__list">
                  {dismissedEntries.map((e) => {
                    const projectName = e.session
                      ? e.session.projectPath
                        ? splitProjectPath(e.session.projectPath).name
                        : e.session.project
                      : "(removed)";
                    const projColor = e.session
                      ? projectBaseFor(e.session.project)
                      : "#71717a";
                    return (
                      <div
                        key={e.sessionId}
                        className="dismissed-panel__row"
                      >
                        <span
                          className="dismissed-panel__name"
                          style={{ color: projColor }}
                          title={
                            e.session?.projectPath ?? e.session?.project ?? ""
                          }
                        >
                          {projectName}
                        </span>
                        <Copyable
                          text={e.sessionId}
                          className="dismissed-panel__id"
                          title={e.sessionId}
                        >
                          {shortSessionId(e.sessionId)}
                        </Copyable>
                        <span className="dismissed-panel__time">
                          last active{" "}
                          {formatTime(new Date(e.lastSeenMs).toISOString())}
                        </span>
                        <button
                          type="button"
                          className="text-link"
                          onClick={() => restore(e.sessionId)}
                        >
                          Restore
                        </button>
                      </div>
                    );
                  })}
                </div>
                <div className="dismissed-panel__restore-by-id">
                  <input
                    type="text"
                    className="dismissed-panel__input"
                    placeholder="Or paste a session id to restore"
                    value={restoreInput}
                    onChange={(ev) => setRestoreInput(ev.target.value)}
                    onKeyDown={(ev) => {
                      if (ev.key === "Enter") submitRestoreInput();
                    }}
                  />
                  <button
                    type="button"
                    className="text-link"
                    onClick={submitRestoreInput}
                    disabled={!restoreInput.trim()}
                  >
                    Restore by id
                  </button>
                </div>
              </div>
            )}
          {rows.map(({ session, active, sev }, i) => {
            const projectColor = projectBaseFor(session.project);
            const sessionColor = lineColorFor(
              session.sessionId,
              session.project,
            );
            const detached = Boolean(sessionColors[session.sessionId]);
            const showDivider = i === 0 || rows[i - 1].sev !== sev;
            const band = BAND_INFO[sev];
            const sparkData = sparkBySession.get(session.sessionId) ?? [];
            const fillFraction = Math.max(
              0,
              Math.min(1, session.contextTokens / sparkExtents.yCtxMax),
            );
            const compacted = Boolean(session.compactedAt);
            const awaiting = (() => {
              const p = session.lastPromptAt;
              const r = session.lastReplyAt;
              if (!p) return false;
              if (!r) return true;
              return p > r;
            })();
            const cacheHeavy =
              session.usage.cacheRead > 1_000_000 &&
              session.usage.cacheRead >
                10 * (session.usage.input + session.usage.cacheCreation + 1);
            const orphan = !session.projectPath;
            return (
              <Fragment key={session.sessionId}>
                {showDivider && showBands && (
                  <div className={`band-divider ${sev}`}>
                    <span
                      className="band-divider__chip"
                      style={{ background: band.color }}
                    />
                    <strong>{band.label}</strong>
                    <em>{band.blurb}</em>
                  </div>
                )}
                <div className={`session-row ${sev}`} role="listitem">
                  {showSparkline && (
                    <RowSparkline
                      data={sparkData}
                      color={sessionColor}
                      xDomain={[cutoff, now]}
                      yCtxMax={sparkExtents.yCtxMax}
                      padLeft={SPARK_PAD_LEFT}
                      padRight={SPARK_PAD_RIGHT}
                      severity={sev}
                      sessionId={session.sessionId}
                    />
                  )}
                  {showBigTitle && (
                    <div
                      className="session-row__bg-name"
                      style={{ color: projectColor }}
                    >
                      {session.projectPath
                        ? splitProjectPath(session.projectPath).name
                        : session.project}
                    </div>
                  )}
                  {showBar && (
                    <div
                      className="session-row__bar"
                      style={{
                        height: `${fillFraction * 100}%`,
                        background: BAND_INFO[sev].color,
                      }}
                    />
                  )}
                  <div className="session-row__status">
                    <span
                      className={`status-glyph status-glyph--${sev}${active ? "" : " status-glyph--off"}${awaiting ? " status-glyph--blink" : ""}`}
                      role="img"
                      aria-label={awaiting ? "Awaiting reply" : active ? "Active" : "Idle"}
                      title={
                        awaiting
                          ? active
                            ? "Awaiting reply (last event was a user prompt)"
                            : "Awaiting reply (no reply since last prompt)"
                          : active
                            ? "Last event ≤ 5 min ago (heuristic)"
                            : "No events in the last 5 min"
                      }
                    >{awaiting ? "▌" : active ? "▶" : "⏸"}</span>
                    <span className={`session-pct session-row__ctx-num ${sev}`} title="Estimated context window tokens" aria-label={`${formatTokensK(session.contextTokens)} context tokens`}>
                      {formatTokensK(session.contextTokens)}
                    </span>
                  </div>
                  <div className="session-row__content">
                    <div className="session-row__info">
                      {showSmallTitle && (
                      <div className="session-name__primary">
                        {(projectSessionCount.get(session.project) ?? 0) >
                          1 && (
                          <input
                            type="color"
                            className="color-swatch"
                            value={projectColor}
                            onChange={(e) =>
                              handleProjectColorChange(
                                session.project,
                                e.target.value,
                              )
                            }
                            title="Project color (applies to all sessions in this project; sessions auto-shade for distinction)"
                          />
                        )}
                        {session.projectPath ? (
                          (() => {
                            const { dir, name } = splitProjectPath(
                              session.projectPath,
                            );
                            return (
                              <span
                                className="session-name__project"
                                role="button"
                                tabIndex={0}
                                onClick={() => {
                                  const target = session.projectPath ?? "";
                                  setSearch(search === target ? "" : target);
                                }}
                                title={`${session.projectPath} (click to search)`}
                                style={{ color: projectColor }}
                              >
                                <span className="session-name__path-dim">
                                  {dir}
                                </span>
                                {name}
                              </span>
                            );
                          })()
                        ) : (
                          <span
                            className={`session-name__project${orphan ? " session-name__project--orphan" : ""}`}
                            role="button"
                            tabIndex={0}
                            onClick={() =>
                              setSearch(
                                search === session.project
                                  ? ""
                                  : session.project,
                              )
                            }
                            title={
                              orphan
                                ? `${session.project} — no project path (orphan session); click to search`
                                : `${session.project} (click to search)`
                            }
                            style={{ color: projectColor }}
                          >
                            {session.project}
                          </span>
                        )}
                      </div>
                      )}
                      {showSmallTitle && (
                      <div className="session-name__session">
                        <input
                          type="color"
                          className={`color-swatch color-swatch--session${detached ? " color-swatch--detached" : ""}`}
                          value={sessionColor}
                          onChange={(e) =>
                            setSessionColor(
                              session.sessionId,
                              e.target.value,
                            )
                          }
                          title={
                            detached
                              ? "Session color (custom override — detached from project color)"
                              : "Session color (auto-derived from project color; pick to detach)"
                          }
                        />
                        <Copyable
                          text={session.sessionId}
                          className="session-name__short-id"
                          title={session.sessionId}
                          style={{ color: sessionColor }}
                        >
                          {shortSessionId(session.sessionId)}
                        </Copyable>
                      </div>
                      )}
                      {(showPrompt || showReply) && (
                      <div className="session-name__convo">
                        <SessionConvo
                          tail={showReply ? session.tail : null}
                          prompt={showPrompt ? session.lastPrompt : null}
                        />
                      </div>
                      )}
                      {showTags && (
                      <div className="session-row__meta">
                        <time className="session-time" dateTime={session.lastSeen ?? ""}>
                          {formatTime(session.lastSeen)}
                        </time>
                        {active && (
                          <span className="session-tag session-tag--active">
                            active
                          </span>
                        )}
                        {awaiting && (
                          <span className="session-tag session-tag--awaiting">
                            awaiting
                          </span>
                        )}
                        {compacted && (
                          <span
                            className="session-tag session-tag--compact"
                            title={`Compacted ${formatTime(session.compactedAt)} — current context is post-/compact`}
                          >
                            compacted
                          </span>
                        )}
                        {cacheHeavy && (
                          <span
                            className="session-tag session-tag--cache"
                            title={`Cache-heavy: ${Math.round(session.usage.cacheRead / 1000).toLocaleString()}k cached reads vs ${Math.round((session.usage.input + session.usage.cacheCreation) / 1000).toLocaleString()}k new`}
                          >
                            cache-heavy
                          </span>
                        )}
                      </div>
                      )}
                      <button
                        type="button"
                        className="text-link session-row__dismiss"
                        onClick={(e) => {
                          e.stopPropagation();
                          dismiss(session.sessionId, session.lastSeenMs);
                        }}
                        title="Hide this session until it has new activity (handy after /clear)"
                      >
                        Dismiss until active
                      </button>
                    </div>
                  </div>
                </div>
              </Fragment>
            );
          })}
          </div>
        </Feature>
      )}
    </>
  );
};
