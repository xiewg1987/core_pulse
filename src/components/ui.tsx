import type { HTMLAttributes, ReactNode } from "react";
import type { StatusTone } from "@/lib/types";

export function Glass({
  children,
  className = "",
  ...rest
}: {
  children?: ReactNode;
  className?: string;
} & HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={`glass ${className}`} {...rest}>
      {children}
    </div>
  );
}

const toneClass: Record<StatusTone, string> = {
  ok: "border-[rgba(46,230,166,0.45)] text-[#2EE6A6]",
  warn: "border-[rgba(255,176,32,0.5)] text-[#FFB020]",
  crit: "border-[rgba(255,77,109,0.5)] text-[#FF4D6D]",
  accent: "border-[rgba(168,85,255,0.5)] text-[#A855FF]",
};

export function Chip({
  label,
  tone,
  solid = false,
}: {
  label: string;
  tone: StatusTone;
  solid?: boolean;
}) {
  return (
    <span
      className={`inline-flex max-w-full items-center gap-1 truncate rounded-full border px-[0.7em] font-semibold tracking-wide backdrop-blur-[16px] ${toneClass[tone]} ${
        solid ? "bg-[rgba(255,43,214,0.22)]" : "bg-[var(--chip)]"
      }`}
      style={{
        height: "clamp(1.35rem, 2.8vh, 2rem)",
        fontSize: "var(--fs-xs)",
      }}
    >
      {label}
    </span>
  );
}

/** Peak / avg / current KPI pills used on metric tiles. */
export function KpiRow({
  peak,
  avg,
  current,
}: {
  peak: number;
  avg: number;
  current: number;
}) {
  return (
    <div className="flex min-w-0 flex-wrap items-center gap-1 overflow-hidden">
      <span className="kpi-chip">峰 {peak}%</span>
      <span className="kpi-chip">均 {avg}%</span>
      <span className="kpi-chip kpi-chip--now">现 {current}%</span>
    </div>
  );
}

export function Bar({
  value,
  max = 100,
  color,
  className = "",
  fill,
}: {
  value: number;
  max?: number;
  color: string;
  className?: string;
  /** Optional CSS background for the fill (e.g. gradient). Falls back to `color`. */
  fill?: string;
}) {
  const pct = Math.max(0, Math.min(100, (value / max) * 100));
  const bg = fill || color;
  return (
    <div className={`h-[5px] w-full overflow-hidden rounded-full bg-white/10 ${className}`}>
      <div
        className="h-full rounded-full transition-[width] duration-500"
        style={{
          width: `${pct}%`,
          background: bg,
          boxShadow: `0 0 10px ${color}66`,
        }}
      />
    </div>
  );
}

export function Sparkline({
  data,
  color,
  height = 28,
  className = "",
}: {
  data: number[];
  color: string;
  height?: number;
  className?: string;
}) {
  const w = 120;
  const h = height;
  const vals = data.length ? data : [0, 0];
  const max = Math.max(...vals, 1);
  const min = Math.min(...vals, 0);
  const span = Math.max(max - min, 1);
  const pts = vals
    .map((v, i) => {
      const x = (i / Math.max(vals.length - 1, 1)) * w;
      const y = h - ((v - min) / span) * (h - 4) - 2;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");

  return (
    <svg viewBox={`0 0 ${w} ${h}`} className={`overflow-visible ${className}`} preserveAspectRatio="none">
      <polyline
        fill="none"
        stroke={color}
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        points={pts}
        opacity={0.95}
        style={{ filter: `drop-shadow(0 0 4px ${color}88)` }}
      />
    </svg>
  );
}

export function DualWave({
  a,
  b,
  colorA,
  colorB,
  className = "",
}: {
  a: number[];
  b: number[];
  colorA: string;
  colorB: string;
  className?: string;
}) {
  const w = 640;
  const h = 56;
  const build = (vals: number[]) => {
    const data = vals.length ? vals : [0, 0];
    const max = Math.max(...data, 1);
    return data
      .map((v, i) => {
        const x = (i / Math.max(data.length - 1, 1)) * w;
        const y = h - (v / max) * (h - 8) - 4;
        return `${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(" ");
  };

  return (
    <svg viewBox={`0 0 ${w} ${h}`} className={`w-full ${className}`} preserveAspectRatio="none">
      <polyline fill="none" stroke={colorA} strokeWidth="2" points={build(a)} opacity={0.9} />
      <polyline fill="none" stroke={colorB} strokeWidth="2" points={build(b)} opacity={0.75} />
    </svg>
  );
}

export function ArcGauge({
  value,
  color,
  size = 72,
  stroke = 7,
  label,
}: {
  value: number;
  color: string;
  size?: number;
  stroke?: number;
  label?: string;
}) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const half = c / 2;
  const pct = Math.max(0, Math.min(100, value)) / 100;
  const dash = half * pct;

  return (
    <svg width={size} height={size / 2 + 6} viewBox={`0 0 ${size} ${size / 2 + 6}`}>
      <g transform={`translate(0, 4)`}>
        <path
          d={`M ${stroke / 2} ${size / 2} A ${r} ${r} 0 0 1 ${size - stroke / 2} ${size / 2}`}
          fill="none"
          stroke="rgba(255,255,255,0.08)"
          strokeWidth={stroke}
          strokeLinecap="round"
        />
        <path
          d={`M ${stroke / 2} ${size / 2} A ${r} ${r} 0 0 1 ${size - stroke / 2} ${size / 2}`}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${dash} ${half}`}
          style={{ filter: `drop-shadow(0 0 6px ${color}99)` }}
        />
        {label ? (
          <text
            x={size / 2}
            y={size / 2 - 2}
            textAnchor="middle"
            fill="#F8F0FF"
            fontSize="13"
            fontWeight="600"
          >
            {label}
          </text>
        ) : null}
      </g>
    </svg>
  );
}

export function DualRing({
  outer,
  inner,
  center,
  sub,
  label = "系统健康",
}: {
  outer: number;
  inner: number;
  center: string;
  sub: string;
  label?: string;
}) {
  const size = 240;
  const cx = size / 2;
  const cy = size / 2;
  const oR = 102;
  const iR = 78;
  const oC = 2 * Math.PI * oR;
  const iC = 2 * Math.PI * iR;
  const oPct = Math.max(0, Math.min(100, outer)) / 100;
  const iPct = Math.max(0, Math.min(100, inner)) / 100;

  return (
    <div className="relative mx-auto aspect-square h-auto w-[min(100%,var(--ring))] max-h-[min(92%,var(--ring))] shrink-0">
      <svg viewBox={`0 0 ${size} ${size}`} className="absolute inset-0 h-full w-full">
        <circle cx={cx} cy={cy} r={oR} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="12" />
        <circle cx={cx} cy={cy} r={iR} fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="9" />
        <circle
          cx={cx}
          cy={cy}
          r={oR}
          fill="none"
          stroke="#FF2BD6"
          strokeWidth="12"
          strokeLinecap="round"
          strokeDasharray={`${oC * oPct} ${oC}`}
          transform={`rotate(-90 ${cx} ${cy})`}
          style={{ filter: "drop-shadow(0 0 14px rgba(255,43,214,0.7))" }}
        />
        <circle
          cx={cx}
          cy={cy}
          r={iR}
          fill="none"
          stroke="#A855FF"
          strokeWidth="9"
          strokeLinecap="round"
          strokeDasharray={`${iC * iPct} ${iC}`}
          transform={`rotate(-90 ${cx} ${cy})`}
          style={{ filter: "drop-shadow(0 0 10px rgba(168,85,255,0.65))" }}
        />
      </svg>
      <div className="relative z-10 flex h-full w-full flex-col items-center justify-center px-3 text-center">
        <div
          className="mb-[0.35em] tracking-[0.08em] text-white/55"
          style={{ fontSize: "var(--fs-sm)" }}
        >
          {label}
        </div>
        <div
          className="glow-num font-semibold leading-none tracking-tight"
          style={{ fontSize: "var(--fs-health)" }}
        >
          {center}
        </div>
        <div
          className="mt-[0.45em] max-w-full truncate text-[var(--muted)]"
          style={{ fontSize: "var(--fs-sm)" }}
        >
          {sub}
        </div>
      </div>
    </div>
  );
}
