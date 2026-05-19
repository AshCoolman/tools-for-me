import { useMemo } from "react";
import { scaleLinear, scaleTime } from "d3-scale";
import { area as d3Area, curveMonotoneX, line as d3Line } from "d3-shape";
import { useElementSize } from "./useElementSize.js";
import { CHART_MARGIN_LEFT, CHART_MARGIN_RIGHT } from "./Chart.js";
import { FeatureControlBar, useFeature } from "./Features.js";
import type { UsagePointEx } from "./App.js";

const STRIP_HEIGHT = 64;
const MARGIN_TOP = 4;

const USAGE_KEYS = ["input", "cacheCreation", "cacheRead", "output"] as const;
type UsageKey = (typeof USAGE_KEYS)[number];

const USAGE_COLORS: Record<UsageKey, string> = {
  input: "#60a5fa",
  output: "#c084fc",
  cacheRead: "#2dd4bf",
  cacheCreation: "#fbbf24",
};

const USAGE_LABELS: Record<UsageKey, string> = {
  input: "Input",
  output: "Output",
  cacheRead: "Cache read",
  cacheCreation: "Cache create",
};

type StackedBucket = {
  t: number;
  layers: { y0: number; y1: number }[];
};

type Props = {
  usage: UsagePointEx[];
  sessionIds: Set<string>;
  xDomain: [number, number];
};

export const UsageStrip = ({ usage, sessionIds, xDomain }: Props) => {
  const [wrapRef, { width }] = useElementSize<HTMLDivElement>();
  const innerWidth = Math.max(0, width - CHART_MARGIN_LEFT - CHART_MARGIN_RIGHT);
  const innerHeight = STRIP_HEIGHT - MARGIN_TOP;

  const showInput = useFeature("activeSessions.activity.input");
  const showOutput = useFeature("activeSessions.activity.output");
  const showCacheRead = useFeature("activeSessions.activity.cacheRead");
  const showCacheCreation = useFeature("activeSessions.activity.cacheCreation");
  const showCum = useFeature("activeSessions.activity.cumulative");
  const layerEnabled: Record<UsageKey, boolean> = {
    input: showInput,
    output: showOutput,
    cacheRead: showCacheRead,
    cacheCreation: showCacheCreation,
  };

  const filtered = useMemo(() => {
    const [t0, t1] = xDomain;
    return usage.filter(
      (u) =>
        sessionIds.has(u.sessionId) && u.tMs >= t0 && u.tMs <= t1,
    );
  }, [usage, sessionIds, xDomain]);

  // --- Per-event stacked areas (right axis) ---

  const buckets = useMemo(() => {
    const [t0, t1] = xDomain;
    const span = t1 - t0;
    if (span <= 0 || innerWidth <= 0) return [];

    const numBuckets = Math.max(1, Math.min(80, Math.floor(innerWidth / 6)));
    const bucketMs = span / numBuckets;

    const bins: { t: number; input: number; output: number; cacheRead: number; cacheCreation: number }[] = [];
    for (let i = 0; i <= numBuckets; i++) {
      bins.push({ t: t0 + i * bucketMs, input: 0, output: 0, cacheRead: 0, cacheCreation: 0 });
    }

    for (const u of filtered) {
      const idx = Math.min(
        Math.floor((u.tMs - t0) / bucketMs),
        numBuckets - 1,
      );
      bins[idx].input += u.input;
      bins[idx].output += u.output;
      bins[idx].cacheRead += u.cacheRead;
      bins[idx].cacheCreation += u.cacheCreation;
    }

    return bins;
  }, [filtered, xDomain, innerWidth]);

  const yEventMax = useMemo(() => {
    let max = 0;
    for (const b of buckets) {
      const total = b.input + b.output + b.cacheRead + b.cacheCreation;
      if (total > max) max = total;
    }
    return Math.max(max * 1.1, 1000);
  }, [buckets]);

  const xs = useMemo(
    () => scaleTime().domain(xDomain).range([0, innerWidth]),
    [xDomain, innerWidth],
  );
  const yEventScale = useMemo(
    () => scaleLinear().domain([0, yEventMax]).range([innerHeight, 0]),
    [yEventMax, innerHeight],
  );

  const layers = useMemo(() => {
    if (buckets.length === 0 || innerWidth <= 0) return null;

    const stacked: StackedBucket[] = buckets.map((b) => {
      let y0 = 0;
      const ls: { y0: number; y1: number }[] = [];
      for (const k of USAGE_KEYS) {
        const y1 = y0 + b[k];
        ls.push({ y0, y1 });
        y0 = y1;
      }
      return { t: b.t, layers: ls };
    });

    return USAGE_KEYS.map((key, ki) => {
      const areaGen = d3Area<StackedBucket>()
        .x((d) => xs(d.t))
        .y0((d) => yEventScale(d.layers[ki].y0))
        .y1((d) => yEventScale(d.layers[ki].y1))
        .curve(curveMonotoneX);

      return { key, color: USAGE_COLORS[key], path: areaGen(stacked) ?? "" };
    });
  }, [buckets, xs, yEventScale, innerWidth]);

  // --- Cumulative line (left axis, dashed) ---

  const cumPoints = useMemo(() => {
    let cum = 0;
    const pts: { t: number; cum: number }[] = [];
    for (const e of filtered) {
      cum += e.total;
      pts.push({ t: e.tMs, cum });
    }
    if (pts.length > 0) {
      const last = pts[pts.length - 1];
      const [, t1] = xDomain;
      if (last.t < t1) pts.push({ t: t1, cum: last.cum });
    }
    return pts;
  }, [filtered, xDomain]);

  const yCumMax = useMemo(() => {
    if (cumPoints.length === 0) return 1000;
    return Math.max(cumPoints[cumPoints.length - 1].cum * 1.1, 1000);
  }, [cumPoints]);

  const yCumScale = useMemo(
    () => scaleLinear().domain([0, yCumMax]).range([innerHeight, 0]),
    [yCumMax, innerHeight],
  );

  const cumLinePath = useMemo(() => {
    if (cumPoints.length === 0 || innerWidth <= 0) return null;
    const lineGen = d3Line<{ t: number; cum: number }>()
      .x((d) => xs(d.t))
      .y((d) => yCumScale(d.cum))
      .curve(curveMonotoneX);
    return lineGen(cumPoints);
  }, [cumPoints, xs, yCumScale, innerWidth]);

  // --- Totals for legend ---

  const totals = useMemo(() => {
    const t = { input: 0, output: 0, cacheRead: 0, cacheCreation: 0, total: 0 };
    for (const u of filtered) {
      t.input += u.input;
      t.output += u.output;
      t.cacheRead += u.cacheRead;
      t.cacheCreation += u.cacheCreation;
      t.total += u.total;
    }
    return t;
  }, [filtered]);

  const ready = width > 0 && innerWidth > 0 && layers;

  return (
    <div ref={wrapRef} className="usage-strip">
      {ready && (
        <svg width={width} height={STRIP_HEIGHT} aria-hidden="true">
          <g transform={`translate(${CHART_MARGIN_LEFT}, ${MARGIN_TOP})`}>
            {layers.map((l) =>
              layerEnabled[l.key] ? (
                <path key={l.key} d={l.path} fill={l.color} fillOpacity={0.35} />
              ) : null,
            )}
            {showCum && cumLinePath && (
              <path
                d={cumLinePath}
                stroke="#a1a1aa"
                fill="none"
                strokeWidth={1}
                strokeDasharray="4 3"
                strokeOpacity={0.7}
              />
            )}
            <line x1={0} x2={0} y1={0} y2={innerHeight} stroke="#3f3f46" strokeDasharray="4 3" />
            <line x1={innerWidth} x2={innerWidth} y1={0} y2={innerHeight} stroke="#3f3f46" />
            <line x1={0} x2={innerWidth} y1={innerHeight} y2={innerHeight} stroke="#3f3f46" />
          </g>
        </svg>
      )}
      <div className="usage-strip__legend">
        {USAGE_KEYS.map((k) =>
          layerEnabled[k] ? (
            <span key={k} className="usage-strip__legend-item">
              <span className="usage-strip__legend-swatch" style={{ background: USAGE_COLORS[k] }} />
              <span className="usage-strip__legend-label">{USAGE_LABELS[k]}</span>
              <span className="usage-strip__legend-value">{formatK(totals[k])}</span>
            </span>
          ) : null,
        )}
        {showCum && (
          <span className="usage-strip__legend-item usage-strip__legend-item--cum">
            <span className="usage-strip__legend-swatch usage-strip__legend-swatch--cum" />
            <span className="usage-strip__legend-label">Cumulative</span>
            <span className="usage-strip__legend-value">{formatK(totals.total)}</span>
          </span>
        )}
      </div>
      <FeatureControlBar
        ids={[
          "activeSessions.activity.input",
          "activeSessions.activity.cacheCreation",
          "activeSessions.activity.cacheRead",
          "activeSessions.activity.output",
          "activeSessions.activity.cumulative",
        ]}
      />
    </div>
  );
};

const formatK = (n: number): string => {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${Math.round(n / 1_000)}k`;
  return String(n);
};
