import { useEffect, useMemo, useRef, useState } from "react";
import { scaleLinear, scaleTime } from "d3-scale";
import { curveMonotoneX, line as d3Line } from "d3-shape";

export type SparkPoint = { t: number; ctx: number; cum: number };
export type SparkSeverity = "ok" | "warn" | "high" | "crit";

const SEVERITY_COLOR: Record<SparkSeverity, string> = {
  ok: "#22c55e",
  warn: "#eab308",
  high: "#f97316",
  crit: "#ef4444",
};

type Props = {
  data: SparkPoint[];
  color: string;
  xDomain: [number, number];
  yCtxMax: number;
  padLeft?: number;
  padRight?: number;
  severity?: SparkSeverity;
  sessionId: string;
};

export const RowSparkline = ({
  data,
  color,
  xDomain,
  yCtxMax,
  padLeft = 0,
  padRight = 0,
  severity = "ok",
  sessionId,
}: Props) => {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [inView, setInView] = useState(false);
  const [size, setSize] = useState({ width: 0, height: 0 });

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([entry]) => setInView(entry.isIntersecting),
      { rootMargin: "800px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    if (!inView) return;
    const el = wrapRef.current;
    if (!el) return;
    setSize({ width: el.clientWidth, height: el.clientHeight });
    const ro = new ResizeObserver(([entry]) => {
      setSize({
        width: entry.contentRect.width,
        height: entry.contentRect.height,
      });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [inView]);

  const { width, height } = size;
  const uid = sessionId.replace(/[^a-zA-Z0-9]/g, "").slice(0, 12);

  const paths = useMemo(() => {
    if (!inView || width === 0 || height === 0 || data.length === 0) return null;

    const xs = scaleTime()
      .domain(xDomain)
      .range([padLeft, Math.max(padLeft, width - padRight)]);
    const yCtx = scaleLinear().domain([0, yCtxMax]).range([height - 4, 6]);
    const ctxLine = d3Line<SparkPoint>()
      .x((d) => xs(d.t))
      .y((d) => yCtx(d.ctx))
      .curve(curveMonotoneX);

    const linePath = ctxLine(data) ?? "";
    const last = data[data.length - 1];
    const first = data[0];
    const lastX = xs(last.t);
    const lastY = yCtx(last.ctx);
    const firstX = xs(first.t);
    const areaPath = `${linePath} L${lastX},${height} L${firstX},${height} Z`;

    return { linePath, areaPath, lastX, lastY };
  }, [inView, data, width, height, xDomain, yCtxMax, padLeft, padRight]);

  const sevColor = SEVERITY_COLOR[severity];

  return (
    <div ref={wrapRef} className="row-spark">
      {inView && width > 0 && height > 0 && paths && (
        <svg width={width} height={height} aria-hidden="true">
          <defs>
            <linearGradient
              id={`af-${uid}`}
              x1="0"
              y1="0"
              x2={width}
              y2="0"
              gradientUnits="userSpaceOnUse"
            >
              <stop offset="0%" stopColor={sevColor} stopOpacity={0} />
              <stop offset="70%" stopColor={sevColor} stopOpacity={0.06} />
              <stop offset="90%" stopColor={sevColor} stopOpacity={0.15} />
              <stop offset="100%" stopColor={sevColor} stopOpacity={0.3} />
            </linearGradient>
            <linearGradient
              id={`lf-${uid}`}
              x1="0"
              y1="0"
              x2={width}
              y2="0"
              gradientUnits="userSpaceOnUse"
            >
              <stop offset="0%" stopColor={color} stopOpacity={0} />
              <stop offset="60%" stopColor={color} stopOpacity={0.35} />
              <stop offset="100%" stopColor={color} stopOpacity={0.9} />
            </linearGradient>
          </defs>
          <path d={paths.areaPath} fill={`url(#af-${uid})`} />
          <path
            d={paths.linePath}
            stroke={`url(#lf-${uid})`}
            fill="none"
            strokeWidth={1.5}
          />
          <circle
            cx={paths.lastX}
            cy={paths.lastY}
            r={2.5}
            fill={sevColor}
            opacity={0.9}
          />
        </svg>
      )}
    </div>
  );
};
