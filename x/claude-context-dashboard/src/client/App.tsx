import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { DashboardData, SessionSummary, UsagePoint } from "../types.js";
import { Feature, FeatureControlBar, SettingsButton, useFeaturesCtx, VisibilityButton } from "./Features.js";
import { RollingChart } from "./RollingChart.js";
import { SessionsPage } from "./SessionsPage.js";
import { useSettings } from "./Settings.js";
import { TokenUsageSettings, useUsageLimits, weekWindow } from "./UsageCard.js";

export type UsagePointEx = UsagePoint & { tMs: number };
export type SessionEx = SessionSummary & {
  lastSeenMs: number;
  haystack: string;
};
export type EnrichedData = {
  generatedAt: string;
  generatedAtMs: number;
  sessions: SessionEx[];
  usage: UsagePointEx[];
};

type FetchState =
  | { status: "loading" }
  | { status: "ready"; data: EnrichedData }
  | { status: "error"; message: string };

const EMPTY_USAGE: UsagePointEx[] = [];

const enrichUsage = (u: UsagePoint): UsagePointEx => {
  const ux = u as UsagePointEx;
  if (ux.tMs == null) ux.tMs = new Date(u.time).getTime();
  return ux;
};

const enrichSession = (s: SessionSummary): SessionEx => {
  const sx = s as SessionEx;
  if (sx.lastSeenMs == null) {
    sx.lastSeenMs = s.lastSeen ? new Date(s.lastSeen).getTime() : 0;
  }
  if (sx.haystack == null) {
    sx.haystack = [s.project, s.projectPath, s.sessionId, s.tail]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
  }
  return sx;
};

const enrich = (d: DashboardData): EnrichedData => {
  for (const u of d.usage) enrichUsage(u);
  for (const s of d.sessions) enrichSession(s);
  return {
    generatedAt: d.generatedAt,
    generatedAtMs: new Date(d.generatedAt).getTime(),
    sessions: d.sessions as SessionEx[],
    usage: d.usage as UsagePointEx[],
  };
};

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

const statusTone = (
  indicator: StatusIndicator,
): "ok" | "warn" | "crit" | "idle" => {
  if (indicator === "none") return "ok";
  if (indicator === "minor" || indicator === "maintenance") return "warn";
  if (indicator === "major" || indicator === "critical") return "crit";
  return "idle";
};

const HOUR_MS = 60 * 60 * 1000;
const ROLLING_HOURS = 12;

const formatNumber = (n: number): string => n.toLocaleString();
const formatPercent = (n: number): string => `${n.toFixed(1)}%`;

const rollingAvgByHour = (
  points: UsagePointEx[],
): { t: number; avg: number; cum: number }[] => {
  if (points.length === 0) return [];
  const buckets = new Map<number, number>();
  let minHour = Infinity;
  let maxHour = -Infinity;
  for (const p of points) {
    const ts = p.tMs;
    if (!Number.isFinite(ts)) continue;
    const hour = Math.floor(ts / HOUR_MS) * HOUR_MS;
    buckets.set(hour, (buckets.get(hour) ?? 0) + p.total);
    if (hour < minHour) minHour = hour;
    if (hour > maxHour) maxHour = hour;
  }
  if (!Number.isFinite(minHour) || !Number.isFinite(maxHour)) return [];

  const series: { t: number; v: number }[] = [];
  for (let h = minHour; h <= maxHour; h += HOUR_MS) {
    series.push({ t: h, v: buckets.get(h) ?? 0 });
  }

  let running = 0;
  return series.map((point, i) => {
    const start = Math.max(0, i - (ROLLING_HOURS - 1));
    const slice = series.slice(start, i + 1);
    const sum = slice.reduce((acc, x) => acc + x.v, 0);
    running += point.v;
    return { t: point.t, avg: sum / slice.length, cum: running };
  });
};

const fetchData = async (since: string | null): Promise<EnrichedData> => {
  const url = since
    ? `/api/data?since=${encodeURIComponent(since)}`
    : "/api/data";
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`GET ${url} failed: ${res.status} ${res.statusText}`);
  }
  const raw = (await res.json()) as DashboardData;
  return enrich(raw);
};

const SECOND_MS = 1000;
const usageKey = (u: UsagePointEx): string =>
  `${u.sessionId}|${Math.floor(u.tMs / SECOND_MS)}`;

const mergeData = (prev: EnrichedData, delta: EnrichedData): EnrichedData => {
  const sessionMap = new Map<string, SessionEx>(
    prev.sessions.map((s) => [s.sessionId, s]),
  );
  for (const s of delta.sessions) sessionMap.set(s.sessionId, s);
  const sessions = [...sessionMap.values()].sort(
    (a, b) => b.lastSeenMs - a.lastSeenMs,
  );

  const usageMap = new Map<string, UsagePointEx>(
    prev.usage.map((u) => [usageKey(u), u]),
  );
  for (const u of delta.usage) usageMap.set(usageKey(u), u);
  const usage = [...usageMap.values()].sort((a, b) => a.tMs - b.tMs);

  return {
    generatedAt: delta.generatedAt,
    generatedAtMs: delta.generatedAtMs,
    sessions,
    usage,
  };
};

const FIVE_MIN_MS = 5 * 60_000;
const TEN_MIN_MS = 10 * 60_000;

const intervalFor = (elapsedMs: number, idleMs: number): number => {
  if (typeof document !== "undefined" && document.hidden) return idleMs;
  if (elapsedMs < FIVE_MIN_MS) return 5_000;
  if (elapsedMs < TEN_MIN_MS) return 10_000;
  return idleMs;
};

export const App = () => {
  const [state, setState] = useState<FetchState>({ status: "loading" });
  const [claudeStatus, setClaudeStatus] = useState<StatusSnapshot | null>(null);
  const [search, setSearch] = useState<string>("");
  const { settings } = useSettings();
  const { limits, setLimits, parsed, setParsed } = useUsageLimits();
  const { start: weekStart, end: weekEnd } = useMemo(
    () => weekWindow(parsed?.weeklyReset ?? null),
    [parsed?.weeklyReset],
  );
  const startTimeRef = useRef<number>(Date.now());
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cursorRef = useRef<string | null>(null);

  const idleIntervalRef = useRef(settings.scanIntervalMs);
  useEffect(() => {
    idleIntervalRef.current = settings.scanIntervalMs;
  }, [settings.scanIntervalMs]);

  const poll = useCallback(async (manual: boolean) => {
    if (manual) {
      startTimeRef.current = Date.now();
      cursorRef.current = null;
    }
    try {
      const since = cursorRef.current;
      const incoming = await fetchData(since);
      setState((prev) => {
        if (!since || prev.status !== "ready") {
          return { status: "ready", data: incoming };
        }
        return { status: "ready", data: mergeData(prev.data, incoming) };
      });
      cursorRef.current = incoming.generatedAt;
    } catch (err: unknown) {
      cursorRef.current = null;
      setState({
        status: "error",
        message: err instanceof Error ? err.message : String(err),
      });
    }
    const elapsed = Date.now() - startTimeRef.current;
    timeoutRef.current = setTimeout(() => {
      void poll(false);
    }, intervalFor(elapsed, idleIntervalRef.current));
  }, []);

  useEffect(() => {
    void poll(true);
    const onVisibility = () => {
      if (document.hidden) return;
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      void poll(true);
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, [poll]);

  useEffect(() => {
    let cancelled = false;
    const tick = async () => {
      try {
        const res = await fetch("/api/status");
        if (!res.ok) return;
        const snap = (await res.json()) as StatusSnapshot;
        if (!cancelled) setClaudeStatus(snap);
      } catch {
        /* transient — next tick will retry */
      }
    };
    void tick();
    const id = setInterval(tick, settings.statusPollMs);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [settings.statusPollMs]);

  useEffect(() => {
    const tone = claudeStatus ? statusTone(claudeStatus.indicator) : "idle";
    document.body.classList.toggle("status-warn", tone === "warn");
    document.body.classList.toggle("status-crit", tone === "crit");
  }, [claudeStatus]);

  const { editMode } = useFeaturesCtx();
  useEffect(() => {
    document.body.classList.toggle("edit-mode", editMode);
  }, [editMode]);

  const matchingSessionIds = useMemo(() => {
    if (state.status !== "ready") return null;
    const tokens = search.toLowerCase().trim().split(/\s+/).filter(Boolean);
    if (tokens.length === 0) return null;
    const matches = new Set<string>();
    for (const s of state.data.sessions) {
      if (tokens.every((t) => s.haystack.includes(t))) {
        matches.add(s.sessionId);
      }
    }
    return matches;
  }, [state, search]);

  const usageChartData = useMemo(() => {
    if (state.status !== "ready") return [];
    const usage = matchingSessionIds
      ? state.data.usage.filter((u) => matchingSessionIds.has(u.sessionId))
      : state.data.usage;
    return rollingAvgByHour(usage);
  }, [state, matchingSessionIds]);

  const sessionCounts = useMemo(() => {
    if (state.status !== "ready") return null;
    const total = state.data.sessions.length;
    const visible = matchingSessionIds ? matchingSessionIds.size : total;
    return { visible, total };
  }, [state, matchingSessionIds]);

  const usageBySession = useMemo(() => {
    if (state.status !== "ready") return null;
    const m = new Map<string, UsagePointEx[]>();
    for (const u of state.data.usage) {
      let arr = m.get(u.sessionId);
      if (!arr) {
        arr = [];
        m.set(u.sessionId, arr);
      }
      arr.push(u);
    }
    return m;
  }, [state]);

  const nowMs =
    state.status === "ready" ? state.data.generatedAtMs : Date.now();

  const summary = useMemo(() => {
    if (state.status !== "ready") return null;
    const sessions = state.data.sessions;
    const totalTokens = sessions.reduce((acc, s) => acc + s.contextTokens, 0);
    const limit = settings.contextLimit;
    const avgPct =
      sessions.length === 0
        ? 0
        : sessions.reduce(
            (acc, s) => acc + (s.contextTokens / limit) * 100,
            0,
          ) / sessions.length;
    return {
      sessionCount: sessions.length,
      totalTokens,
      avgPct,
    };
  }, [state, settings.contextLimit]);

  return (
    <div className="page">
      <div className="header">
        <div className="header__title">
          <h1>Claude Context Dashboard</h1>
        </div>
        <span className="header-search-group">
          {search && sessionCounts && (
            <span className="header-meta">
              {sessionCounts.visible.toLocaleString()} of{" "}
              {sessionCounts.total.toLocaleString()}
            </span>
          )}
          <Feature id="header.search" as="span">
            <span className="header-search">
              <span className="header-search__icon" aria-hidden>
                ⌕
              </span>
              <input
                type="search"
                placeholder="Filter project, session id, or chat"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </span>
          </Feature>
        </span>
        {claudeStatus && (
          <a
            href="https://status.claude.com/"
            target="_blank"
            rel="noreferrer"
            className={`status-chip status-chip--${statusTone(claudeStatus.indicator)}`}
            title={`status.claude.com — ${claudeStatus.description}`}
          >
            <span className="status-chip__dot" />
            <span className="status-chip__label">
              {claudeStatus.description || claudeStatus.indicator}
            </span>
          </a>
        )}
        <VisibilityButton />
        <SettingsButton
          tokenUsageContent={
            <TokenUsageSettings
              limits={limits}
              setLimits={setLimits}
              parsed={parsed}
              setParsed={setParsed}
              usage={state.status === "ready" ? state.data.usage : EMPTY_USAGE}
            />
          }
        />
      </div>

      <Feature id="header.blurb">
        <p className="page-blurb">
          Context fullness is an estimate derived from JSONL session logs and
          may not match Claude Code&rsquo;s live context window.
        </p>
      </Feature>

      {state.status === "error" && (
        <div className="card error">
          <h2>Failed to load data</h2>
          <p>{state.message}</p>
        </div>
      )}

      {state.status === "ready" && (
        <>
          <SessionsPage
            data={state.data}
            usageBySession={usageBySession!}
            nowMs={nowMs}
            search={search}
            setSearch={setSearch}
            sessionLimit={limits.sessionLimit}
            weeklyLimit={limits.weeklyLimit}
            weekStart={weekStart}
            weekEnd={weekEnd}
          />

          {summary && (
            <>
              <Feature id="tokenUsage">
                <div className="card">
                  <h2>Token usage (12h rolling avg)</h2>
                  <Feature id="tokenUsage.blurb">
                    <p className="card-blurb">
                      Solid: per-hour tokens (input + output + cache) averaged over
                      the trailing 12 hours. Dashed: cumulative total tokens (right
                      axis).
                    </p>
                  </Feature>
                  <RollingChart data={usageChartData} />
                  <FeatureControlBar
                    ids={["tokenUsage.usage", "tokenUsage.cumulative", "tokenUsage.peak"]}
                  />
                </div>
              </Feature>

              <Feature id="kpis">
                <div className="stats">
                  <Feature id="kpis.sessions">
                    <div className="stat">
                      <span>Sessions</span>
                      <strong>{summary.sessionCount}</strong>
                    </div>
                  </Feature>
                  <Feature id="kpis.tokens">
                    <div className="stat">
                      <span>Sum of current context tokens</span>
                      <strong>{formatNumber(summary.totalTokens)}</strong>
                    </div>
                  </Feature>
                  <Feature id="kpis.avgPct">
                    <div className="stat">
                      <span>Avg context full (est.)</span>
                      <strong>{formatPercent(summary.avgPct)}</strong>
                    </div>
                  </Feature>
                </div>
              </Feature>
            </>
          )}
        </>
      )}

    </div>
  );
};
