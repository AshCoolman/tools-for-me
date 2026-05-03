import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { bisector } from "d3-array";
import { scaleLinear, scaleTime } from "d3-scale";
import { area as d3Area, curveBasis, curveStepAfter, line as d3Line } from "d3-shape";
import { useFeature } from "./Features.js";
import { useSettings } from "./Settings.js";
import { useElementSize } from "./useElementSize.js";
import type { SparkPoint } from "./Sparkline.js";

export const CHART_MARGIN_LEFT = 56;
export const CHART_MARGIN_RIGHT = 80;
const CHART_MARGIN_TOP = 16;
const CHART_MARGIN_BOTTOM = 32;

export type ChartLine = {
  sessionId: string;
  project: string;
  projectPath: string | null;
  name: string;
  color: string;
  tail: string | null;
  data: SparkPoint[];
};

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
const SEVERITY_ORDER: Severity[] = ["crit", "high", "warn", "ok"];
const BAND_LABEL: Record<Severity, string> = {
  crit: "Critical",
  high: "Large",
  warn: "Medium",
  ok: "Fast",
};
const BAND_COLOR: Record<Severity, string> = {
  crit: "#ef4444",
  high: "#f97316",
  warn: "#eab308",
  ok: "#22c55e",
};

type Band = { id: string; from: number; to: number; color: string };
const buildBands = (warn: number, high: number, crit: number): Band[] => [
  { id: "ok", from: 0, to: warn, color: "#22c55e" },
  { id: "warn", from: warn, to: high, color: "#eab308" },
  { id: "high", from: high, to: crit, color: "#f97316" },
  { id: "crit", from: crit, to: Infinity, color: "#ef4444" },
];

const formatTickK = (n: number): string => {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${Math.round(n / 1000)}k`;
  return String(n);
};
const formatNumber = (n: number): string => n.toLocaleString();
const formatTimeShort = (t: number): string =>
  new Date(t).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
const splitProjectPath = (
  p: string,
): { dir: string; name: string } => {
  const idx = p.lastIndexOf("/");
  if (idx < 0) return { dir: "", name: p };
  return { dir: p.slice(0, idx + 1), name: p.slice(idx + 1) };
};

const bisect = bisector<SparkPoint, number>((d) => d.t).left;

type HoverRow = {
  sessionId: string;
  name: string;
  project: string;
  projectPath: string | null;
  color: string;
  tail: string | null;
  ctx: number;
  cum: number;
};
type HoverPayload = {
  t: number;
  rows: HoverRow[];
};

type Props = {
  lines: ChartLine[];
  xDomain: [number, number];
  yCtxMax: number;
  yCumMax: number;
  height?: number;
};

export const Chart = ({
  lines,
  xDomain,
  yCtxMax,
  yCumMax,
  height = 420,
}: Props) => {
  const [wrapRef, { width }] = useElementSize<HTMLDivElement>();
  const svgRef = useRef<SVGSVGElement>(null);
  const [hover, setHover] = useState<HoverPayload | null>(null);
  const [cursor, setCursor] = useState<{ x: number; y: number } | null>(null);

  const showBands = useFeature("activeSessions.contextChart.bands");
  const showThresholdLines = useFeature(
    "activeSessions.contextChart.thresholdLines",
  );
  const showAccum = useFeature("activeSessions.contextChart.accumulator");
  const showContext = useFeature("activeSessions.contextChart.context");
  const showPeak = useFeature("activeSessions.contextChart.peak");
  const { settings } = useSettings();
  const BANDS_BASE = useMemo(
    () =>
      buildBands(
        settings.severityWarn,
        settings.severityHigh,
        settings.severityCrit,
      ),
    [settings.severityWarn, settings.severityHigh, settings.severityCrit],
  );

  const innerWidth = Math.max(
    0,
    width - CHART_MARGIN_LEFT - CHART_MARGIN_RIGHT,
  );
  const innerHeight = Math.max(
    0,
    height - CHART_MARGIN_TOP - CHART_MARGIN_BOTTOM,
  );

  const xs = useMemo(
    () => scaleTime().domain(xDomain).range([0, innerWidth]),
    [xDomain, innerWidth],
  );
  const yCtxScale = useMemo(
    () => scaleLinear().domain([0, yCtxMax]).range([innerHeight, 0]),
    [yCtxMax, innerHeight],
  );
  const yCumScale = useMemo(
    () => scaleLinear().domain([0, yCumMax]).range([innerHeight, 0]),
    [yCumMax, innerHeight],
  );

  const ctxLine = useMemo(
    () =>
      d3Line<SparkPoint>()
        .x((d) => xs(d.t))
        .y((d) => yCtxScale(d.ctx))
        .curve(curveStepAfter),
    [xs, yCtxScale],
  );
  const cumLine = useMemo(
    () =>
      d3Line<SparkPoint>()
        .x((d) => xs(d.t))
        .y((d) => yCumScale(d.cum))
        .curve(curveStepAfter),
    [xs, yCumScale],
  );

  const xTicks = useMemo(
    () => (innerWidth > 0 ? xs.ticks(Math.max(2, Math.floor(innerWidth / 100))) : []),
    [xs, innerWidth],
  );
  const yLeftTicks = useMemo(
    () => (innerHeight > 0 ? yCumScale.ticks(6) : []),
    [yCumScale, innerHeight],
  );
  const yRightTicks = useMemo(
    () => (innerHeight > 0 ? yCtxScale.ticks(6) : []),
    [yCtxScale, innerHeight],
  );

  const bands = useMemo(() => {
    return BANDS_BASE.map((b) => ({
      ...b,
      to: Number.isFinite(b.to) ? b.to : yCtxMax,
    })).filter((b) => b.to > b.from);
  }, [yCtxMax, BANDS_BASE]);

  const weekendBlocks = useMemo(() => {
    const [t0, t1] = xDomain;
    const DAY_MS = 86_400_000;
    const start = new Date(t0);
    start.setUTCHours(0, 0, 0, 0);
    const blocks: { from: number; to: number }[] = [];
    for (let d = start.getTime(); d <= t1; d += DAY_MS) {
      const dow = new Date(d).getUTCDay();
      if (dow !== 0 && dow !== 6) continue;
      const from = Math.max(d, t0);
      const to = Math.min(d + DAY_MS, t1);
      if (to > from) blocks.push({ from, to });
    }
    return blocks;
  }, [xDomain]);

  const peakPoints = useMemo(() => {
    const [t0, t1] = xDomain;
    const span = t1 - t0;
    if (span <= 0) return [];
    const stepMs = Math.max(5 * 60_000, Math.floor(span / 240));
    const pts: { t: number; v: number }[] = [];
    const amp = (t: number): number => {
      const d = new Date(t);
      const h = d.getUTCHours() + d.getUTCMinutes() / 60;
      // Cosine peaks at h=15 (3pm UTC, midpoint of 11am–7pm), troughs at h=3.
      // Range: 0 (trough) to 0.2 (peak).
      return 0.1 * (1 - Math.cos((2 * Math.PI * (h - 3)) / 24));
    };
    for (let t = t0; t <= t1; t += stepMs) pts.push({ t, v: amp(t) });
    if (pts.length === 0 || pts[pts.length - 1].t < t1) {
      pts.push({ t: t1, v: amp(t1) });
    }
    return pts;
  }, [xDomain]);

  const peakArea = useMemo(
    () =>
      d3Area<{ t: number; v: number }>()
        .x((d) => xs(d.t))
        .y0(innerHeight)
        .y1((d) => innerHeight - d.v * innerHeight)
        .curve(curveBasis),
    [xs, innerHeight],
  );

  const rafRef = useRef<number | null>(null);
  const pendingRef = useRef<{ clientX: number; clientY: number } | null>(null);

  const onMove = useCallback(
    (e: React.MouseEvent<SVGSVGElement>) => {
      pendingRef.current = { clientX: e.clientX, clientY: e.clientY };
      if (rafRef.current != null) return;
      rafRef.current = requestAnimationFrame(() => {
        rafRef.current = null;
        const ev = pendingRef.current;
        pendingRef.current = null;
        const svg = svgRef.current;
        if (!ev || !svg || lines.length === 0 || innerWidth === 0) return;
        const rect = svg.getBoundingClientRect();
        const sx = ev.clientX - rect.left - CHART_MARGIN_LEFT;
        if (sx < 0 || sx > innerWidth) {
          setHover(null);
          setCursor(null);
          return;
        }
        const t = xs.invert(sx).getTime();
        const rows: HoverRow[] = [];
        for (const l of lines) {
          if (l.data.length === 0) continue;
          const idx = bisect(l.data, t);
          const sample =
            l.data[Math.max(0, Math.min(idx - 1, l.data.length - 1))];
          if (!sample) continue;
          rows.push({
            sessionId: l.sessionId,
            name: l.name,
            project: l.project,
            projectPath: l.projectPath,
            color: l.color,
            tail: l.tail,
            ctx: sample.ctx,
            cum: sample.cum,
          });
        }
        setHover({ t, rows });
        setCursor({ x: ev.clientX, y: ev.clientY });
      });
    },
    [lines, xs, innerWidth],
  );

  useEffect(() => {
    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  const onLeave = useCallback(() => {
    if (rafRef.current != null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    pendingRef.current = null;
    setHover(null);
    setCursor(null);
  }, []);

  const ready = width > 0 && innerWidth > 0 && innerHeight > 0;

  return (
    <div ref={wrapRef} className="chart chart--d3">
      {ready && (
        <svg
          ref={svgRef}
          width={width}
          height={height}
          onMouseMove={onMove}
          onMouseLeave={onLeave}
        >
          <g transform={`translate(${CHART_MARGIN_LEFT}, ${CHART_MARGIN_TOP})`}>
            {yLeftTicks.map((v, i) => (
              <line
                key={`gh-${i}`}
                x1={0}
                x2={innerWidth}
                y1={yCumScale(v)}
                y2={yCumScale(v)}
                stroke="#27272a"
                strokeDasharray="3 3"
              />
            ))}
            {xTicks.map((d, i) => (
              <line
                key={`gv-${i}`}
                y1={0}
                y2={innerHeight}
                x1={xs(d)}
                x2={xs(d)}
                stroke="#27272a"
                strokeDasharray="3 3"
              />
            ))}

            <defs>
              {bands.map((b) => {
                const yTop = yCtxScale(b.to);
                const yBot = yCtxScale(b.from);
                return (
                  <linearGradient
                    key={`grad-${b.id}`}
                    id={`chart-band-${b.id}`}
                    x1={0}
                    x2={0}
                    y1={yTop}
                    y2={yBot}
                    gradientUnits="userSpaceOnUse"
                  >
                    <stop offset="0" stopColor={b.color} stopOpacity={0.1} />
                    <stop offset="1" stopColor={b.color} stopOpacity={0} />
                  </linearGradient>
                );
              })}
            </defs>

            {showBands && bands.map((b) => {
              const yTop = yCtxScale(b.to);
              const yBot = yCtxScale(b.from);
              return (
                <rect
                  key={`band-${b.id}`}
                  x={0}
                  y={yTop}
                  width={innerWidth}
                  height={Math.max(0, yBot - yTop)}
                  fill={`url(#chart-band-${b.id})`}
                />
              );
            })}

            {showThresholdLines &&
              bands
                .filter((b) => b.from > 0)
                .map((b) => (
                  <line
                    key={`thresh-${b.id}`}
                    x1={0}
                    x2={innerWidth}
                    y1={yCtxScale(b.from)}
                    y2={yCtxScale(b.from)}
                    stroke={b.color}
                    strokeWidth={1.5}
                    strokeDasharray="14 8"
                    strokeOpacity={0.85}
                    pointerEvents="none"
                  />
                ))}

            {showPeak && peakPoints.length > 0 && (
              <path
                d={peakArea(peakPoints) ?? ""}
                fill="#a1a1aa"
                fillOpacity={0.18}
                pointerEvents="none"
              />
            )}

            {lines.map((l) => {
              if (l.data.length === 0) return null;
              return (
                <g key={`s-${l.sessionId}`}>
                  {showAccum && (
                    <path
                      d={cumLine(l.data) ?? ""}
                      stroke={l.color}
                      fill="none"
                      strokeWidth={1.5}
                      strokeDasharray="6 4"
                      strokeOpacity={0.9}
                    />
                  )}
                  {showContext && (
                    <path
                      d={ctxLine(l.data) ?? ""}
                      stroke={l.color}
                      fill="none"
                      strokeWidth={2}
                    />
                  )}
                </g>
              );
            })}

            {hover && (
              <line
                x1={xs(hover.t)}
                x2={xs(hover.t)}
                y1={0}
                y2={innerHeight}
                stroke="#52525b"
                strokeWidth={1}
                pointerEvents="none"
              />
            )}

            {weekendBlocks.map((b, i) => {
              const x = xs(b.from);
              const w = Math.max(1, xs(b.to) - x);
              return (
                <rect
                  key={`we-${i}`}
                  x={x}
                  y={innerHeight + 2}
                  width={w}
                  height={6}
                  fill="#52525b"
                  pointerEvents="none"
                />
              );
            })}

            <line
              x1={0}
              x2={innerWidth}
              y1={innerHeight}
              y2={innerHeight}
              stroke="#3f3f46"
            />
            <line x1={0} x2={0} y1={0} y2={innerHeight} stroke="#3f3f46" strokeDasharray="6 4" />
            <line
              x1={innerWidth}
              x2={innerWidth}
              y1={0}
              y2={innerHeight}
              stroke="#3f3f46"
            />

            {xTicks.map((d, i) => (
              <text
                key={`xt-${i}`}
                x={xs(d)}
                y={innerHeight + 18}
                fill="#a1a1aa"
                fontSize={11}
                textAnchor="middle"
              >
                {formatTimeShort(d.getTime())}
              </text>
            ))}

            {yLeftTicks.map((v, i) => (
              <text
                key={`yl-${i}`}
                x={-8}
                y={yCumScale(v) + 4}
                fill="#71717a"
                fontSize={11}
                textAnchor="end"
              >
                {formatTickK(v)}
              </text>
            ))}

            {yRightTicks.map((v, i) => (
              <text
                key={`yr-${i}`}
                x={innerWidth + 8}
                y={yCtxScale(v) + 4}
                fill="#a1a1aa"
                fontSize={11}
                textAnchor="start"
              >
                {formatTickK(v)}
              </text>
            ))}
          </g>
        </svg>
      )}

      {hover && cursor && hover.rows.length > 0 && (
        <ChartHoverTooltip hover={hover} cursor={cursor} />
      )}
    </div>
  );
};

const ChartHoverTooltip = ({
  hover,
  cursor,
}: {
  hover: HoverPayload;
  cursor: { x: number; y: number };
}) => {
  const ttRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number }>({
    left: cursor.x + 16,
    top: cursor.y + 16,
  });
  const { settings } = useSettings();

  useEffect(() => {
    const el = ttRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    let left = cursor.x + 16;
    let top = cursor.y + 16;
    if (left + r.width > vw - 8) left = cursor.x - r.width - 16;
    if (top + r.height > vh - 8) top = vh - r.height - 8;
    if (top < 8) top = 8;
    if (left < 8) left = 8;
    setPos({ left, top });
  }, [cursor.x, cursor.y, hover]);

  const grouped = useMemo(() => {
    const m = new Map<Severity, HoverRow[]>();
    for (const r of hover.rows) {
      const sev = severityFor(
        r.ctx,
        settings.severityWarn,
        settings.severityHigh,
        settings.severityCrit,
      );
      const arr = m.get(sev) ?? [];
      arr.push(r);
      m.set(sev, arr);
    }
    for (const arr of m.values()) {
      arr.sort((a, b) => b.ctx - a.ctx);
    }
    return m;
  }, [hover.rows, settings.severityWarn, settings.severityHigh, settings.severityCrit]);

  const time = new Date(hover.t).toLocaleString([], {
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });

  return (
    <div
      ref={ttRef}
      className="chart-tooltip"
      style={{ left: pos.left, top: pos.top }}
    >
      <div className="chart-tooltip__time">{time}</div>
      {SEVERITY_ORDER.map((sev) => {
        const items = grouped.get(sev);
        if (!items || items.length === 0) return null;
        return (
          <div className="chart-tooltip__band" key={sev}>
            <div
              className="chart-tooltip__band-label"
              style={{ color: BAND_COLOR[sev] }}
            >
              {BAND_LABEL[sev]}
            </div>
            {items.map((r) => (
              <ChartTooltipRow key={r.sessionId} row={r} sev={sev} />
            ))}
          </div>
        );
      })}
    </div>
  );
};

const ChartTooltipRow = ({
  row,
  sev,
}: {
  row: HoverRow;
  sev: Severity;
}) => {
  const path = row.projectPath ? splitProjectPath(row.projectPath) : null;
  const shortId = row.sessionId.split("-")[0] ?? row.sessionId;
  return (
    <div className={`chart-tooltip__row chart-tooltip__row--${sev}`}>
      <div className="chart-tooltip__row-head">
        <span
          className="chart-tooltip__swatch"
          style={{ background: row.color }}
        />
        <span
          className="chart-tooltip__project"
          style={{ color: row.color }}
        >
          {path ? (
            <>
              <span className="chart-tooltip__project-dim">{path.dir}</span>
              {path.name}
            </>
          ) : (
            row.project
          )}
        </span>
        <span className="chart-tooltip__short-id" style={{ color: row.color }}>
          {shortId}
        </span>
      </div>
      <div className="chart-tooltip__row-meta">
        <span className="chart-tooltip__metric">
          <span className="chart-tooltip__metric-label">ctx</span>
          <span className="chart-tooltip__metric-value">
            {formatNumber(row.ctx)}
          </span>
        </span>
        <span className="chart-tooltip__metric chart-tooltip__metric--cum">
          <span className="chart-tooltip__metric-label">cum</span>
          <span className="chart-tooltip__metric-value">
            {formatNumber(row.cum)}
          </span>
        </span>
      </div>
      {row.tail && (
        <div className="chart-tooltip__tail">{row.tail}</div>
      )}
    </div>
  );
};

export const ChartLegend = ({ lines }: { lines: ChartLine[] }) => {
  if (lines.length === 0) return null;
  return (
    <div className="chart-legend">
      {lines.map((l) => (
        <div className="chart-legend__item" key={l.sessionId}>
          <span
            className="chart-legend__swatch"
            style={{ background: l.color }}
          />
          <span className="chart-legend__name">{l.name}</span>
        </div>
      ))}
    </div>
  );
};
