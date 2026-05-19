import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { bisector, extent } from "d3-array";
import { scaleLinear, scaleTime } from "d3-scale";
import { area as d3Area, curveBasis, curveMonotoneX, line as d3Line } from "d3-shape";
import { useFeature } from "./Features.js";
import { useElementSize } from "./useElementSize.js";

const MARGIN_LEFT = 56;
const MARGIN_RIGHT = 56;
const MARGIN_TOP = 16;
const MARGIN_BOTTOM = 32;

type Point = { t: number; avg: number; cum: number };

const formatTickK = (n: number): string => {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${Math.round(n / 1000)}k`;
  return String(n);
};
const formatNumber = (n: number): string => n.toLocaleString();
const formatXTick = (t: number): string =>
  new Date(t).toLocaleString([], {
    month: "short",
    day: "2-digit",
    hour: "2-digit",
  });
const formatHover = (t: number): string =>
  new Date(t).toLocaleString();

const bisect = bisector<Point, number>((d) => d.t).left;

export const RollingChart = ({
  data,
  height = 420,
  avgColor = "#a1a1aa",
  cumColor = "#71717a",
  avgLabel = "Tokens / hour (12h avg)",
  cumLabel = "Cumulative tokens",
}: {
  data: Point[];
  height?: number;
  avgColor?: string;
  cumColor?: string;
  avgLabel?: string;
  cumLabel?: string;
}) => {
  const [wrapRef, { width }] = useElementSize<HTMLDivElement>();
  const svgRef = useRef<SVGSVGElement>(null);
  const [hover, setHover] = useState<Point | null>(null);

  const showPeak = useFeature("tokenUsage.peak");
  const showCum = useFeature("tokenUsage.cumulative");
  const showUsage = useFeature("tokenUsage.usage");

  const innerWidth = Math.max(0, width - MARGIN_LEFT - MARGIN_RIGHT);
  const innerHeight = Math.max(0, height - MARGIN_TOP - MARGIN_BOTTOM);

  const xDomain = useMemo<[number, number]>(() => {
    const ext = extent(data, (d) => d.t);
    if (ext[0] == null || ext[1] == null) return [0, 1];
    return [ext[0], ext[1]];
  }, [data]);

  const yAvgMax = useMemo(() => {
    let m = 0;
    for (const p of data) if (p.avg > m) m = p.avg;
    return Math.max(m * 1.05, 1);
  }, [data]);

  const yCumMax = useMemo(() => {
    let m = 0;
    for (const p of data) if (p.cum > m) m = p.cum;
    return Math.max(m * 1.05, 1);
  }, [data]);

  const xs = useMemo(
    () => scaleTime().domain(xDomain).range([0, innerWidth]),
    [xDomain, innerWidth],
  );
  const ysAvg = useMemo(
    () => scaleLinear().domain([0, yAvgMax]).range([innerHeight, 0]),
    [yAvgMax, innerHeight],
  );
  const ysCum = useMemo(
    () => scaleLinear().domain([0, yCumMax]).range([innerHeight, 0]),
    [yCumMax, innerHeight],
  );

  const avgPath = useMemo(() => {
    if (data.length === 0 || innerWidth === 0 || innerHeight === 0) return "";
    return (
      d3Line<Point>()
        .x((d) => xs(d.t))
        .y((d) => ysAvg(d.avg))
        .curve(curveMonotoneX)(data) ?? ""
    );
  }, [data, xs, ysAvg, innerWidth, innerHeight]);

  const cumPath = useMemo(() => {
    if (data.length === 0 || innerWidth === 0 || innerHeight === 0) return "";
    return (
      d3Line<Point>()
        .x((d) => xs(d.t))
        .y((d) => ysCum(d.cum))
        .curve(curveMonotoneX)(data) ?? ""
    );
  }, [data, xs, ysCum, innerWidth, innerHeight]);

  const xTicks = useMemo(
    () => (innerWidth > 0 ? xs.ticks(Math.max(2, Math.floor(innerWidth / 130))) : []),
    [xs, innerWidth],
  );

  const weekendBlocks = useMemo(() => {
    const [t0, t1] = xDomain;
    if (!(t1 > t0)) return [];
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
    const amp = (t: number): number => {
      const d = new Date(t);
      const h = d.getUTCHours() + d.getUTCMinutes() / 60;
      return 0.1 * (1 - Math.cos((2 * Math.PI * (h - 3)) / 24));
    };
    const pts: { t: number; v: number }[] = [];
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
  const yLeftTicks = useMemo(
    () => (innerHeight > 0 ? ysCum.ticks(6) : []),
    [ysCum, innerHeight],
  );
  const yRightTicks = useMemo(
    () => (innerHeight > 0 ? ysAvg.ticks(6) : []),
    [ysAvg, innerHeight],
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
        if (!ev || !svg || data.length === 0 || innerWidth === 0) return;
        const rect = svg.getBoundingClientRect();
        const sx = ev.clientX - rect.left - MARGIN_LEFT;
        if (sx < 0 || sx > innerWidth) {
          setHover(null);
          return;
        }
        const t = xs.invert(sx).getTime();
        const idx = bisect(data, t);
        const a = data[idx - 1];
        const b = data[idx];
        let chosen: Point | null = null;
        if (a && b) chosen = Math.abs(a.t - t) < Math.abs(b.t - t) ? a : b;
        else chosen = a ?? b ?? null;
        if (!chosen) return;
        setHover(chosen);
      });
    },
    [data, xs, innerWidth],
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
          <g transform={`translate(${MARGIN_LEFT}, ${MARGIN_TOP})`}>
            {yLeftTicks.map((v, i) => (
              <line
                key={`gh-${i}`}
                x1={0}
                x2={innerWidth}
                y1={ysCum(v)}
                y2={ysCum(v)}
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

            {showPeak && peakPoints.length > 0 && (
              <path
                d={peakArea(peakPoints) ?? ""}
                fill="#a1a1aa"
                fillOpacity={0.18}
                pointerEvents="none"
              />
            )}

            {showCum && (
              <path
                d={cumPath}
                stroke={cumColor}
                fill="none"
                strokeWidth={1}
                strokeDasharray="3 3"
                strokeOpacity={0.6}
              />
            )}
            {showUsage && (
              <path d={avgPath} stroke={avgColor} fill="none" strokeWidth={1} />
            )}

            {hover && (
              <>
                <line
                  x1={xs(hover.t)}
                  x2={xs(hover.t)}
                  y1={0}
                  y2={innerHeight}
                  stroke="#3f3f46"
                  strokeWidth={1}
                  pointerEvents="none"
                />
                <circle
                  cx={xs(hover.t)}
                  cy={ysAvg(hover.avg)}
                  r={2.5}
                  fill={avgColor}
                  stroke="#18181b"
                  strokeWidth={1}
                  pointerEvents="none"
                />
                <circle
                  cx={xs(hover.t)}
                  cy={ysCum(hover.cum)}
                  r={2.5}
                  fill={cumColor}
                  stroke="#18181b"
                  strokeWidth={1}
                  pointerEvents="none"
                />
                <text x={innerWidth + 8} y={ysAvg(hover.avg) + 3.5} fill={avgColor} fontSize={10} fontWeight={600} pointerEvents="none">
                  {formatTickK(Math.round(hover.avg))}
                </text>
                <text x={-8} y={ysCum(hover.cum) + 3.5} fill={cumColor} fontSize={10} fontWeight={600} textAnchor="end" pointerEvents="none">
                  {formatTickK(Math.round(hover.cum))}
                </text>
                <rect x={xs(hover.t) - 28} y={innerHeight + 6} width={56} height={16} rx={3} fill="#27272a" pointerEvents="none" />
                <text x={xs(hover.t)} y={innerHeight + 18} fill="#e4e4e7" fontSize={10} textAnchor="middle" pointerEvents="none">
                  {formatHover(hover.t)}
                </text>
              </>
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
            <line
              x1={0}
              x2={0}
              y1={0}
              y2={innerHeight}
              stroke="#3f3f46"
              strokeDasharray="4 4"
            />
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
                {formatXTick(d.getTime())}
              </text>
            ))}
            {yLeftTicks.map((v, i) => (
              <text
                key={`yl-${i}`}
                x={-8}
                y={ysCum(v) + 4}
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
                y={ysAvg(v) + 4}
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

    </div>
  );
};

