import { useMemo } from "react";
import { scaleLinear, scaleTime } from "d3-scale";
import { area as d3Area, curveStepAfter } from "d3-shape";
import { useElementSize } from "./useElementSize.js";
import { CHART_MARGIN_LEFT, CHART_MARGIN_RIGHT } from "./Chart.js";
import { FeatureControlBar, useFeature } from "./Features.js";
import type { UsagePointEx } from "./App.js";

const STRIP_HEIGHT = 104;
const MARGIN_TOP = 6;
const MARGIN_BOTTOM = 6;
const SESSION_MS = 5 * 60 * 60 * 1000;

const COLD = "#60a5fa";
const ONTARGET = "#34d399";
const HOT = "#f87171";
const NEUTRAL = "#a1a1aa";

const COLD_LO = 0.85;
const HOT_HI = 1.15;
const GRADIENT_STOPS = 24;

type PaceState = "cold" | "ontarget" | "hot" | "neutral";

const paceColor = (s: PaceState): string =>
  s === "cold" ? COLD : s === "hot" ? HOT : s === "ontarget" ? ONTARGET : NEUTRAL;

const paceFromRatio = (ratio: number | null): PaceState => {
  if (ratio === null || !Number.isFinite(ratio)) return "neutral";
  if (ratio < COLD_LO) return "cold";
  if (ratio > HOT_HI) return "hot";
  return "ontarget";
};

const hexToRgb = (hex: string): [number, number, number] => {
  const h = hex.replace(/^#/, "");
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ];
};
const rgbToHex = (r: number, g: number, b: number): string =>
  `#${[r, g, b]
    .map((v) =>
      Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0"),
    )
    .join("")}`;
const lerpHex = (a: string, b: string, t: number): string => {
  const [ar, ag, ab] = hexToRgb(a);
  const [br, bg, bb] = hexToRgb(b);
  return rgbToHex(
    ar + (br - ar) * t,
    ag + (bg - ag) * t,
    ab + (bb - ab) * t,
  );
};
const ratioToColor = (ratio: number | null): string => {
  if (ratio === null || !Number.isFinite(ratio)) return NEUTRAL;
  const r = Math.max(0, ratio);
  if (r <= COLD_LO) return COLD;
  if (r >= HOT_HI) return HOT;
  if (r <= 1) return lerpHex(COLD, ONTARGET, (r - COLD_LO) / (1 - COLD_LO));
  return lerpHex(ONTARGET, HOT, (r - 1) / (HOT_HI - 1));
};

const cumAt = (points: CumPoint[], t: number): number => {
  let cum = 0;
  for (let i = 0; i < points.length; i++) {
    if (points[i].t > t) break;
    cum = points[i].cum;
  }
  return cum;
};

type GradientSpec = {
  id: string;
  x1: number;
  x2: number;
  stops: { offset: number; color: string }[];
};

type CumPoint = { t: number; cum: number };
type SessionWindow = {
  start: number;
  end: number;
  ended: boolean;
  total: number;
  points: CumPoint[];
};

type Props = {
  usage: UsagePointEx[];
  sessionIds: Set<string>;
  xDomain: [number, number];
  nowMs: number;
  sessionLimit: number;
  weeklyLimit: number;
  weekStart: number;
  weekEnd: number;
};

export const UsageCumStrip = ({
  usage,
  sessionIds,
  xDomain,
  nowMs,
  sessionLimit,
  weeklyLimit,
  weekStart,
  weekEnd,
}: Props) => {
  const [wrapRef, { width }] = useElementSize<HTMLDivElement>();
  const innerWidth = Math.max(0, width - CHART_MARGIN_LEFT - CHART_MARGIN_RIGHT);
  const innerHeight = STRIP_HEIGHT - MARGIN_TOP - MARGIN_BOTTOM;
  const halfHeight = innerHeight / 2;
  const centerY = halfHeight;
  const [t0, t1] = xDomain;

  const showSession = useFeature("activeSessions.usage.session");
  const showWeekly = useFeature("activeSessions.usage.weekly");

  const xs = useMemo(
    () => scaleTime().domain(xDomain).range([0, innerWidth]),
    [xDomain, innerWidth],
  );

  const sessionWindows = useMemo<SessionWindow[]>(() => {
    const windows: SessionWindow[] = [];
    let cur: SessionWindow | null = null;

    for (const u of usage) {
      if (!sessionIds.has(u.sessionId)) continue;
      const t = u.tMs;
      if (cur) {
        const hitLimit = sessionLimit > 0 && cur.total >= sessionLimit;
        const timedOut = t >= cur.start + SESSION_MS;
        if (hitLimit || timedOut) {
          cur.ended = true;
          cur.end = hitLimit
            ? cur.points[cur.points.length - 1].t
            : cur.start + SESSION_MS;
          windows.push(cur);
          cur = null;
        }
      }
      if (!cur) {
        cur = {
          start: t,
          end: 0,
          ended: false,
          total: 0,
          points: [{ t, cum: 0 }],
        };
      }
      cur.total += u.total;
      cur.points.push({ t, cum: cur.total });
    }

    if (cur) {
      if (sessionLimit > 0 && cur.total >= sessionLimit) {
        cur.ended = true;
        cur.end = cur.points[cur.points.length - 1].t;
      } else if (nowMs >= cur.start + SESSION_MS) {
        cur.ended = true;
        cur.end = cur.start + SESSION_MS;
      } else {
        cur.ended = false;
        cur.end = nowMs;
        if (cur.points[cur.points.length - 1].t < nowMs) {
          cur.points.push({ t: nowMs, cum: cur.total });
        }
      }
      windows.push(cur);
    }
    return windows;
  }, [usage, sessionIds, sessionLimit, nowMs]);

  const weeklyAllCum = useMemo(() => {
    let cum = 0;
    const all: CumPoint[] = [];
    for (const u of usage) {
      const t = u.tMs;
      if (t < weekStart) continue;
      if (t > weekEnd) break;
      cum += u.total;
      all.push({ t, cum });
    }
    return { points: all, total: cum };
  }, [usage, weekStart, weekEnd]);

  const weeklyCum = useMemo(() => {
    const visible: CumPoint[] = [];
    let preWindowCum = 0;
    for (const p of weeklyAllCum.points) {
      if (p.t < t0) {
        preWindowCum = p.cum;
        continue;
      }
      if (p.t > t1) break;
      visible.push(p);
    }
    visible.unshift({ t: t0, cum: preWindowCum });
    if (visible[visible.length - 1].t < t1) {
      visible.push({ t: t1, cum: visible[visible.length - 1].cum });
    }
    return { points: visible, total: weeklyAllCum.total };
  }, [weeklyAllCum, t0, t1]);

  const sessionMaxTotal = sessionWindows.reduce((m, w) => Math.max(m, w.total), 0);
  const sessionYMax = sessionLimit > 0 ? sessionLimit : Math.max(sessionMaxTotal, 1000);
  const weekYMax = Math.max(
    weeklyLimit > 0 ? weeklyLimit : 0,
    weeklyCum.total * 1.15,
    1000,
  );

  const ySession = useMemo(
    () => scaleLinear().domain([0, sessionYMax]).range([centerY, 0]),
    [sessionYMax, centerY],
  );
  const yWeek = useMemo(
    () => scaleLinear().domain([0, weekYMax]).range([centerY, innerHeight]),
    [weekYMax, centerY, innerHeight],
  );

  const sessionAreaGen = useMemo(
    () =>
      d3Area<CumPoint>()
        .x((d) => xs(d.t))
        .y0(centerY)
        .y1((d) => ySession(d.cum))
        .curve(curveStepAfter),
    [xs, ySession, centerY],
  );

  const weekAreaGen = useMemo(
    () =>
      d3Area<CumPoint>()
        .x((d) => xs(d.t))
        .y0(centerY)
        .y1((d) => yWeek(d.cum))
        .curve(curveStepAfter),
    [xs, yWeek, centerY],
  );

  const sessionAreaPaths = useMemo(() => {
    if (innerWidth <= 0) return [];
    return sessionWindows
      .filter((w) => w.end >= t0 && w.start <= t1)
      .map((w, i) => {
        const points = [...w.points];
        if (w.ended) points.push({ t: w.end, cum: 0 });
        return { id: i, path: sessionAreaGen(points) ?? "", window: w };
      });
  }, [sessionWindows, sessionAreaGen, innerWidth, t0, t1]);

  const sessionGradients = useMemo<GradientSpec[]>(() => {
    if (innerWidth <= 0 || sessionLimit <= 0) return [];
    return sessionAreaPaths.map(({ id, window: w }) => {
      const span = w.end - w.start;
      const stops: { offset: number; color: string }[] = [];
      if (span <= 0) {
        stops.push({ offset: 0, color: NEUTRAL });
        stops.push({ offset: 1, color: NEUTRAL });
      } else {
        for (let k = 0; k <= GRADIENT_STOPS; k++) {
          const f = k / GRADIENT_STOPS;
          const t = w.start + f * span;
          const elapsed = t - w.start;
          const ideal = (elapsed / SESSION_MS) * sessionLimit;
          const cum = cumAt(w.points, t);
          const ratio = ideal > 0 ? cum / ideal : null;
          stops.push({ offset: f, color: ratioToColor(ratio) });
        }
      }
      return {
        id: `usage-strip-session-grad-${id}`,
        x1: xs(w.start),
        x2: xs(w.end > w.start ? w.end : w.start + 1),
        stops,
      };
    });
  }, [sessionAreaPaths, sessionLimit, xs, innerWidth]);

  const weekGradient = useMemo<GradientSpec | null>(() => {
    if (innerWidth <= 0 || weeklyLimit <= 0) return null;
    const span = weekEnd - weekStart;
    if (span <= 0) return null;
    const xSpan = t1 - t0;
    if (xSpan <= 0) return null;
    const stops: { offset: number; color: string }[] = [];
    for (let k = 0; k <= GRADIENT_STOPS; k++) {
      const f = k / GRADIENT_STOPS;
      const t = t0 + f * xSpan;
      if (t < weekStart || t > weekEnd) {
        stops.push({ offset: f, color: NEUTRAL });
        continue;
      }
      const elapsed = t - weekStart;
      const ideal = (elapsed / span) * weeklyLimit;
      const cum = cumAt(weeklyAllCum.points, t);
      const ratio = ideal > 0 ? cum / ideal : null;
      stops.push({ offset: f, color: ratioToColor(ratio) });
    }
    return {
      id: "usage-strip-week-grad",
      x1: xs(t0),
      x2: xs(t1),
      stops,
    };
  }, [weeklyAllCum, weeklyLimit, weekStart, weekEnd, t0, t1, xs, innerWidth]);

  const weekAreaPath = useMemo(() => {
    if (innerWidth <= 0) return null;
    return weekAreaGen(weeklyCum.points);
  }, [weeklyCum.points, weekAreaGen, innerWidth]);

  const sessionIdealPath = useMemo(() => {
    if (innerWidth <= 0 || sessionLimit <= 0) return null;
    const latest = sessionWindows[sessionWindows.length - 1];
    if (!latest) return null;
    const x0 = xs(latest.start);
    const x1 = xs(latest.start + SESSION_MS);
    return `M${x0} ${centerY} L${x1} ${ySession(sessionLimit)}`;
  }, [sessionWindows, xs, ySession, innerWidth, sessionLimit, centerY]);

  const weekIdealPath = useMemo(() => {
    if (innerWidth <= 0 || weeklyLimit <= 0) return null;
    const x0 = xs(weekStart);
    const x1 = xs(weekEnd);
    return `M${x0} ${centerY} L${x1} ${yWeek(weeklyLimit)}`;
  }, [xs, yWeek, innerWidth, weeklyLimit, centerY, weekStart, weekEnd]);

  const latestSession =
    sessionWindows.length > 0 ? sessionWindows[sessionWindows.length - 1] : null;
  const latestSessionTotal = latestSession ? latestSession.total : 0;
  const sessionPct = sessionLimit > 0 ? (latestSessionTotal / sessionLimit) * 100 : 0;
  const weekPct = weeklyLimit > 0 ? (weeklyCum.total / weeklyLimit) * 100 : 0;

  const sessionState = useMemo<PaceState>(() => {
    if (sessionLimit <= 0 || !latestSession) return "neutral";
    const elapsed =
      Math.min(nowMs, latestSession.start + SESSION_MS) - latestSession.start;
    if (elapsed <= 0) return "neutral";
    const idealCum = (elapsed / SESSION_MS) * sessionLimit;
    return paceFromRatio(idealCum > 0 ? latestSession.total / idealCum : null);
  }, [latestSession, sessionLimit, nowMs]);

  const weekState = useMemo<PaceState>(() => {
    if (weeklyLimit <= 0) return "neutral";
    const elapsed = nowMs - weekStart;
    const span = weekEnd - weekStart;
    if (elapsed <= 0 || span <= 0) return "neutral";
    const idealCum = (elapsed / span) * weeklyLimit;
    return paceFromRatio(idealCum > 0 ? weeklyCum.total / idealCum : null);
  }, [weeklyCum.total, weeklyLimit, weekStart, weekEnd, nowMs]);

  const sessionColor = paceColor(sessionState);
  const weekColor = paceColor(weekState);

  const ready = width > 0 && innerWidth > 0;
  const clipId = "usage-strip-clip";

  return (
    <div ref={wrapRef} className="usage-strip">
      {ready && (
        <svg width={width} height={STRIP_HEIGHT} aria-hidden="true">
          <defs>
            <clipPath id={clipId}>
              <rect x={0} y={0} width={innerWidth} height={innerHeight} />
            </clipPath>
            {sessionGradients.map((g) => (
              <linearGradient
                key={g.id}
                id={g.id}
                gradientUnits="userSpaceOnUse"
                x1={g.x1}
                y1={0}
                x2={g.x2}
                y2={0}
              >
                {g.stops.map((s, i) => (
                  <stop
                    key={i}
                    offset={`${(s.offset * 100).toFixed(2)}%`}
                    stopColor={s.color}
                  />
                ))}
              </linearGradient>
            ))}
            {weekGradient && (
              <linearGradient
                id={weekGradient.id}
                gradientUnits="userSpaceOnUse"
                x1={weekGradient.x1}
                y1={0}
                x2={weekGradient.x2}
                y2={0}
              >
                {weekGradient.stops.map((s, i) => (
                  <stop
                    key={i}
                    offset={`${(s.offset * 100).toFixed(2)}%`}
                    stopColor={s.color}
                  />
                ))}
              </linearGradient>
            )}
          </defs>
          <g transform={`translate(${CHART_MARGIN_LEFT}, ${MARGIN_TOP})`}>
            <rect
              x={0}
              y={0}
              width={innerWidth}
              height={innerHeight}
              fill="rgba(255,255,255,0.012)"
              stroke="#27272a"
            />
            <line
              x1={0}
              x2={innerWidth}
              y1={ySession(sessionYMax * 0.5)}
              y2={ySession(sessionYMax * 0.5)}
              stroke="#27272a"
              strokeDasharray="2 3"
            />
            <line
              x1={0}
              x2={innerWidth}
              y1={yWeek(weekYMax * 0.5)}
              y2={yWeek(weekYMax * 0.5)}
              stroke="#27272a"
              strokeDasharray="2 3"
            />
            <line x1={0} x2={innerWidth} y1={centerY} y2={centerY} stroke="#52525b" />
            <g clipPath={`url(#${clipId})`}>
              {showWeekly && weekAreaPath && (
                <path
                  d={weekAreaPath}
                  fill={weekGradient ? `url(#${weekGradient.id})` : weekColor}
                  fillOpacity={0.45}
                />
              )}
              {showWeekly && weekIdealPath && (
                <path
                  d={weekIdealPath}
                  stroke="#e4e4e7"
                  strokeWidth={1}
                  strokeDasharray="4 3"
                  fill="none"
                  opacity={0.55}
                />
              )}
              {showSession &&
                sessionAreaPaths.map((s, i) => {
                  const grad = sessionGradients[i];
                  return (
                    <path
                      key={s.id}
                      d={s.path}
                      fill={grad ? `url(#${grad.id})` : sessionColor}
                      fillOpacity={0.55}
                    />
                  );
                })}
              {showSession && sessionIdealPath && (
                <path
                  d={sessionIdealPath}
                  stroke="#e4e4e7"
                  strokeWidth={1}
                  strokeDasharray="4 3"
                  fill="none"
                  opacity={0.7}
                />
              )}
            </g>
            <line x1={0} x2={0} y1={0} y2={innerHeight} stroke="#3f3f46" strokeDasharray="4 3" />
            <line x1={innerWidth} x2={innerWidth} y1={0} y2={innerHeight} stroke="#3f3f46" />
            {showSession && (
              <g>
                <text
                  x={6}
                  y={12}
                  fill={sessionColor}
                  fontSize={10}
                  fontWeight={600}
                  style={{ letterSpacing: "0.04em", textTransform: "uppercase" }}
                >
                  Session usage
                </text>
                <text
                  x={innerWidth - 6}
                  y={12}
                  textAnchor="end"
                  fill={sessionColor}
                  fontSize={10}
                  fontWeight={600}
                  style={{ fontVariantNumeric: "tabular-nums" }}
                >
                  {sessionLimit > 0 ? fmtPct(sessionPct) : "—"}
                </text>
              </g>
            )}
            {showWeekly && (
              <g>
                <text
                  x={6}
                  y={innerHeight - 4}
                  fill={weekColor}
                  fontSize={10}
                  fontWeight={600}
                  style={{ letterSpacing: "0.04em", textTransform: "uppercase" }}
                >
                  Weekly usage
                </text>
                <text
                  x={innerWidth - 6}
                  y={innerHeight - 4}
                  textAnchor="end"
                  fill={weekColor}
                  fontSize={10}
                  fontWeight={600}
                  style={{ fontVariantNumeric: "tabular-nums" }}
                >
                  {weeklyLimit > 0 ? fmtPct(weekPct) : "—"}
                </text>
              </g>
            )}
          </g>
        </svg>
      )}
      <FeatureControlBar ids={["activeSessions.usage.session", "activeSessions.usage.weekly"]} />
    </div>
  );
};

const fmtPct = (n: number): string => {
  if (n > 0 && n < 1) return `${n.toFixed(2)}%`;
  return `${n.toFixed(1)}%`;
};
