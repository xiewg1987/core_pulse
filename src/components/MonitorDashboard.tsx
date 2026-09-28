"use client";

import {
  ArcGauge,
  Bar,
  Chip,
  DualRing,
  DualWave,
  Glass,
  KpiRow,
  Sparkline,
} from "@/components/ui";
import { useSystemMetrics } from "@/hooks/useSystemMetrics";

const POLL_MS = 1500;

const APPS: { label: string; color: string }[] = [
  { label: "浏览器", color: "rgba(255,43,214,0.35)" },
  { label: "文件", color: "rgba(168,85,255,0.35)" },
  { label: "终端", color: "rgba(46,230,166,0.35)" },
  { label: "笔记", color: "rgba(255,176,32,0.35)" },
  { label: "聊天", color: "rgba(255,43,214,0.35)" },
  { label: "音乐", color: "rgba(168,85,255,0.35)" },
  { label: "设置", color: "rgba(230,220,230,0.25)" },
  { label: "商店", color: "rgba(255,43,214,0.3)" },
];

function fmt(n: number | null | undefined, digits = 0): string {
  if (n == null || Number.isNaN(n)) return "—";
  return digits > 0 ? n.toFixed(digits) : String(Math.round(n));
}

function IconBtn({
  children,
  title,
  onClick,
}: {
  children: React.ReactNode;
  title: string;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className="flex shrink-0 items-center justify-center rounded-full border border-white/15 bg-white/5 text-white/70 transition hover:border-pink/40 hover:text-pink"
      style={{
        width: "clamp(1.6rem, 3.2vh, 2.1rem)",
        height: "clamp(1.6rem, 3.2vh, 2.1rem)",
      }}
    >
      {children}
    </button>
  );
}

function TrendRow({
  label,
  value,
  data,
  color,
}: {
  label: string;
  value: number;
  data: number[];
  color: string;
}) {
  return (
    <div className="grid min-h-0 grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2 overflow-hidden">
      <span className="shrink-0 text-white/45" style={{ fontSize: "var(--fs-xs)" }}>
        {label}
      </span>
      <Sparkline data={data} color={color} className="h-[clamp(0.7rem,1.6vh,1rem)] w-full" />
      <span className="shrink-0 font-mono text-white/80" style={{ fontSize: "var(--fs-sm)" }}>
        {value}%
      </span>
    </div>
  );
}

export function MonitorDashboard() {
  const { data, ready, err, refresh } = useSystemMetrics(POLL_MS);

  const storageHeader = data.storage.some(
    (s) => s.smartTone === "warn" || s.smartTone === "crit",
  )
    ? "注意"
    : data.storage.every((s) => s.smart === "未知")
      ? "—"
      : data.storage.length
        ? "正常"
        : "暂无";

  const storageTone =
    storageHeader === "注意" ? "text-[#FFB020]" : storageHeader === "正常" ? "text-[#2EE6A6]" : "text-white/40";

  const processes =
    data.processes.length > 0
      ? data.processes.slice(0, 3)
      : [
          { name: "—", percent: 0 },
          { name: "—", percent: 0 },
          { name: "—", percent: 0 },
        ];

  return (
    <div className="monitor-shell">
      <div className="monitor-frame">
        {/* Row 1 — TopBar + SpecStrip */}
        <header className="grid min-h-0 min-w-0 grid-rows-[minmax(0,1.15fr)_minmax(0,0.85fr)] gap-[clamp(0.2rem,0.6vh,0.45rem)] overflow-hidden">
          <div className="grid min-h-0 min-w-0 grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2 overflow-hidden">
            <div className="min-w-0 overflow-hidden">
              <div className="flex items-center gap-2 overflow-hidden">
                <h1
                  className="truncate font-semibold tracking-wide text-[#F8F0FF]"
                  style={{ fontSize: "var(--fs-lg)" }}
                >
                  本机监控
                </h1>
                {data.mock ? (
                  <span
                    className="shrink-0 rounded-full border border-[#FFB020]/40 px-1.5 text-[#FFB020]"
                    style={{ fontSize: "var(--fs-xs)" }}
                  >
                    MOCK
                  </span>
                ) : null}
                {!ready ? (
                  <span className="shrink-0 text-white/35" style={{ fontSize: "var(--fs-xs)" }}>
                    采集中…
                  </span>
                ) : null}
                {err ? (
                  <span className="shrink-0 text-[#FF4D6D]" style={{ fontSize: "var(--fs-xs)" }}>
                    错误
                  </span>
                ) : null}
              </div>
              <div
                className="mt-[0.2em] truncate text-[#5C4A6E]"
                style={{ fontSize: "var(--fs-sm)" }}
              >
                {data.host.name}
              </div>
            </div>

            <div className="flex items-center justify-center gap-[clamp(0.4rem,1vw,1rem)]">
              <div className="glow-pink clock-num font-mono text-pink">{data.clock}</div>
              <div className="flex items-center gap-1.5">
                <IconBtn title="刷新" onClick={() => void refresh()}>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M21 12a9 9 0 1 1-2.64-6.36" />
                    <polyline points="21 3 21 9 15 9" />
                  </svg>
                </IconBtn>
                <IconBtn title="主题">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="12" cy="12" r="4" />
                    <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
                  </svg>
                </IconBtn>
              </div>
            </div>

            <div className="hidden min-w-0 lg:block" aria-hidden />
          </div>

          <div className="flex min-h-0 min-w-0 items-center justify-between gap-3 overflow-hidden">
            <p
              className="min-w-0 flex-1 truncate font-semibold text-[#5C4A6E]"
              style={{ fontSize: "var(--fs-xs)" }}
            >
              {data.host.os} · {data.host.cpu} · {data.host.ram} · {data.host.gpu} · 开机{" "}
              {data.host.uptime}
            </p>
            <div className="flex max-w-[55%] shrink-0 flex-wrap items-center justify-end gap-1.5 overflow-hidden sm:max-w-none sm:flex-nowrap">
              {data.status.map((s) => (
                <Chip key={s.label} label={s.label} tone={s.tone} />
              ))}
            </div>
          </div>
        </header>

        {/* Row 2 — Hero: health + CPU / Memory / GPU / MiniTrend */}
        <section className="grid min-h-0 min-w-0 grid-cols-1 gap-[var(--gap)] overflow-hidden md:grid-cols-[minmax(0,1.05fr)_minmax(0,1.65fr)]">
          <Glass className="corner-brackets card-pad relative flex min-h-0 min-w-0 flex-col items-center justify-center overflow-hidden">
            <DualRing
              outer={data.health.score}
              inner={Math.max(0, 100 - data.health.load)}
              center={ready ? String(data.health.score) : "—"}
              sub={`负载 ${data.health.load}% · ${
                data.health.temp != null ? `${data.health.temp}°C` : "健康"
              }`}
            />
          </Glass>

          <div className="grid min-h-0 min-w-0 grid-cols-2 grid-rows-2 gap-[var(--gap)] overflow-hidden">
            {/* CPU */}
            <Glass className="corner-brackets card-pad flex min-h-0 min-w-0 flex-col justify-between overflow-hidden">
              <div className="min-w-0 overflow-hidden">
                <div className="tracking-[0.14em] text-white/45" style={{ fontSize: "var(--fs-xs)" }}>
                  CPU
                </div>
                <div className="glow-num metric-num mt-[0.2em]">{data.cpu.percent}%</div>
                <div className="mt-[0.4em]">
                  <KpiRow peak={data.cpu.peak} avg={data.cpu.avg} current={data.cpu.percent} />
                </div>
              </div>
              <div className="mt-1 min-h-0 overflow-hidden">
                <Sparkline
                  data={data.cpu.history}
                  color="#FF2BD6"
                  className="h-[clamp(0.9rem,1.8vh,1.25rem)] w-full"
                />
                <div className="mt-[0.25em] truncate text-white/50" style={{ fontSize: "var(--fs-xs)" }}>
                  {data.cpu.speedGhz != null
                    ? `${data.cpu.speedGhz.toFixed(1)} GHz · 当前频率`
                    : "频率暂无"}
                </div>
              </div>
            </Glass>

            {/* Memory */}
            <Glass className="corner-brackets card-pad flex min-h-0 min-w-0 flex-col justify-between overflow-hidden">
              <div className="flex min-h-0 items-start justify-between gap-2 overflow-hidden">
                <div className="min-w-0 overflow-hidden">
                  <div className="tracking-[0.14em] text-white/45" style={{ fontSize: "var(--fs-xs)" }}>
                    MEMORY
                  </div>
                  <div className="glow-num metric-num mt-[0.2em]">{data.memory.percent}%</div>
                  <div className="mt-[0.3em] truncate text-white/55" style={{ fontSize: "var(--fs-sm)" }}>
                    {data.memory.usedGb} / {data.memory.totalGb} GB
                  </div>
                  <div className="mt-[0.35em]">
                    <KpiRow
                      peak={data.memory.peak}
                      avg={data.memory.avg}
                      current={data.memory.percent}
                    />
                  </div>
                </div>
                <div className="hidden shrink-0 sm:block">
                  <ArcGauge value={data.memory.percent} color="#A855FF" size={64} />
                </div>
              </div>
              <Sparkline
                data={data.memory.history}
                color="#A855FF"
                className="mt-1 h-[clamp(0.9rem,1.8vh,1.25rem)] w-full"
              />
            </Glass>

            {/* GPU */}
            <Glass className="corner-brackets card-pad flex min-h-0 min-w-0 flex-col justify-between overflow-hidden">
              <div className="flex min-h-0 items-start justify-between gap-2 overflow-hidden">
                <div className="min-w-0 overflow-hidden">
                  <div className="tracking-[0.14em] text-white/45" style={{ fontSize: "var(--fs-xs)" }}>
                    GPU
                  </div>
                  <div className="glow-num metric-num mt-[0.2em]">
                    {ready ? `${data.gpu.percent}%` : "—"}
                  </div>
                  <div className="mt-[0.3em] truncate text-white/55" style={{ fontSize: "var(--fs-sm)" }}>
                    显存{" "}
                    {data.gpu.vramUsedGb != null && data.gpu.vramTotalGb != null
                      ? `${data.gpu.vramUsedGb} / ${data.gpu.vramTotalGb} GB`
                      : "暂无"}
                    {data.gpu.percent != null ? ` · 占用 ${data.gpu.percent}%` : ""}
                  </div>
                  <div className="mt-[0.35em]">
                    <KpiRow peak={data.gpu.peak} avg={data.gpu.avg} current={data.gpu.percent} />
                  </div>
                </div>
                <div className="hidden shrink-0 flex-col items-end gap-1 sm:flex">
                  {data.gpu.vramTotalGb != null && data.gpu.vramUsedGb != null ? (
                    <Bar
                      value={(data.gpu.vramUsedGb / data.gpu.vramTotalGb) * 100}
                      color="#FF2BD6"
                      className="!h-1 w-16"
                    />
                  ) : null}
                  <ArcGauge
                    value={data.gpu.percent}
                    color="#FF2BD6"
                    size={64}
                    label={data.gpu.temp != null ? `${data.gpu.temp}°` : undefined}
                  />
                </div>
              </div>
              <Sparkline
                data={data.gpu.history}
                color="#A855FF"
                className="mt-1 h-[clamp(0.9rem,1.8vh,1.25rem)] w-full"
              />
            </Glass>

            {/* MiniTrend */}
            <Glass className="corner-brackets card-pad flex min-h-0 min-w-0 flex-col overflow-hidden">
              <div
                className="mb-[0.35em] shrink-0 tracking-[0.06em] text-white/45"
                style={{ fontSize: "var(--fs-xs)" }}
              >
                近 1 小时
              </div>
              <div className="grid min-h-0 flex-1 grid-rows-3 gap-[clamp(0.25rem,0.8vh,0.5rem)] overflow-hidden">
                <TrendRow
                  label="CPU%"
                  value={data.cpu.percent}
                  data={data.cpu.history}
                  color="#FF2BD6"
                />
                <TrendRow
                  label="内存%"
                  value={data.memory.percent}
                  data={data.memory.history}
                  color="#A855FF"
                />
                <TrendRow
                  label="GPU%"
                  value={data.gpu.percent}
                  data={data.gpu.history}
                  color="#2EE6A6"
                />
              </div>
            </Glass>
          </div>
        </section>

        {/* Row 3 — NETWORK */}
        <Glass className="corner-brackets card-pad flex min-h-0 min-w-0 items-center gap-[clamp(0.5rem,1.2vw,1rem)] overflow-hidden">
          <div className="w-[clamp(5.5rem,12vw,9rem)] shrink-0 overflow-hidden">
            <div className="tracking-[0.14em] text-white/45" style={{ fontSize: "var(--fs-xs)" }}>
              NETWORK
            </div>
            <div className="mt-[0.15em] truncate font-medium text-white/80" style={{ fontSize: "var(--fs-md)" }}>
              实时流量
            </div>
            <span
              className="mt-[0.35em] inline-flex items-center gap-1 rounded-full border border-[rgba(46,230,166,0.4)] bg-[var(--chip)] px-2 text-[#2EE6A6]"
              style={{ fontSize: "var(--fs-xs)", height: "clamp(1.1rem,2.4vh,1.4rem)" }}
            >
              <span className="live-dot">●</span> LIVE
            </span>
          </div>
          <div className="min-h-0 min-w-0 flex-1 overflow-hidden">
            <DualWave
              a={data.network.historyDown}
              b={data.network.historyUp}
              colorA="#FF2BD6"
              colorB="#A855FF"
              className="h-[clamp(2rem,6vh,3.25rem)]"
            />
          </div>
          <div className="w-[clamp(7rem,16vw,11rem)] shrink-0 overflow-hidden text-right">
            <div className="flex items-baseline justify-end gap-1">
              <span className="text-pink">↓</span>
              <span className="glow-pink net-num text-pink">{fmt(data.network.downMbps, 2)}</span>
              <span className="text-pink/80" style={{ fontSize: "var(--fs-xs)" }}>
                Mbps
              </span>
            </div>
            <div
              className="mt-[0.25em] truncate text-[var(--text-secondary)]"
              style={{ fontSize: "var(--fs-xs)" }}
            >
              ↑ {fmt(data.network.upMbps, 2)} Mbps
              {data.network.latencyMs != null ? ` · 延迟 ${data.network.latencyMs} ms` : ""}
            </div>
          </div>
        </Glass>

        {/* Row 4 — QuickLaunch / PowerSession / Storage */}
        <section className="grid min-h-0 min-w-0 grid-cols-3 gap-[var(--gap)] overflow-hidden">
          <Glass className="card-pad flex min-h-0 min-w-0 flex-col overflow-hidden">
            <h2
              className="mb-[clamp(0.3rem,0.8vh,0.5rem)] shrink-0 truncate text-[#5C4A6E]"
              style={{ fontSize: "var(--fs-sm)" }}
            >
              快捷启动
            </h2>
            <div className="grid min-h-0 flex-1 grid-cols-4 grid-rows-2 gap-[clamp(0.3rem,0.8vh,0.55rem)] overflow-hidden">
              {APPS.map((app) => (
                <button key={app.label} type="button" className="app-tile">
                  <span className="app-icon" style={{ background: app.color }} />
                  <span className="truncate">{app.label}</span>
                </button>
              ))}
            </div>
          </Glass>

          <Glass className="card-pad flex min-h-0 min-w-0 flex-col overflow-hidden">
            <h2
              className="mb-[clamp(0.3rem,0.7vh,0.45rem)] shrink-0 truncate text-[#5C4A6E]"
              style={{ fontSize: "var(--fs-sm)" }}
            >
              电源与会话
            </h2>
            <div className="mb-[clamp(0.3rem,0.7vh,0.45rem)] flex shrink-0 gap-1.5 overflow-hidden">
              <button type="button" className="power-btn">
                睡眠
              </button>
              <button type="button" className="power-btn">
                锁定
              </button>
              <button type="button" className="power-btn power-btn--warn">
                重启
                <small>需确认</small>
              </button>
              <button type="button" className="power-btn power-btn--crit">
                关机
                <small>需确认</small>
              </button>
            </div>
            <div className="mb-[0.3em] shrink-0 text-[#5C4A6E]" style={{ fontSize: "var(--fs-xs)" }}>
              结束进程
            </div>
            <div className="grid min-h-0 flex-1 grid-rows-[repeat(3,minmax(0,1fr))_auto] gap-[clamp(0.2rem,0.55vh,0.35rem)] overflow-hidden">
              {processes.map((p, i) => (
                <div key={`${p.name}-${i}`} className="proc-row">
                  <div className="flex min-w-0 items-baseline gap-2 overflow-hidden">
                    <span className="truncate text-white/85" style={{ fontSize: "var(--fs-sm)" }}>
                      {p.name}
                    </span>
                    <span className="shrink-0 text-white/40" style={{ fontSize: "var(--fs-xs)" }}>
                      {p.percent}%
                    </span>
                  </div>
                  <button type="button" className="kill-btn">
                    结束
                  </button>
                </div>
              ))}
              <button
                type="button"
                className="power-btn !flex-none w-full"
                style={{ fontSize: "var(--fs-sm)" }}
              >
                全部进程
              </button>
            </div>
          </Glass>

          <Glass className="card-pad flex min-h-0 min-w-0 flex-col overflow-hidden">
            <div className="mb-[clamp(0.35rem,0.9vh,0.55rem)] flex shrink-0 items-center justify-between gap-2 overflow-hidden">
              <h2 className="truncate text-[#5C4A6E]" style={{ fontSize: "var(--fs-sm)" }}>
                存储
              </h2>
              <span className={`shrink-0 ${storageTone}`} style={{ fontSize: "var(--fs-sm)" }}>
                {storageHeader}
              </span>
            </div>
            <div className="grid min-h-0 flex-1 grid-rows-[1fr_1fr_auto] gap-[clamp(0.55rem,1.2vh,0.9rem)] overflow-hidden">
              {data.storage.length === 0 ? (
                <div className="text-white/40" style={{ fontSize: "var(--fs-sm)" }}>
                  暂无磁盘信息
                </div>
              ) : (
                data.storage.slice(0, 2).map((vol) => {
                  const color = vol.accent === "orange" ? "#FFB020" : "#A855FF";
                  const usedLabel =
                    vol.unit === "TB"
                      ? `${(vol.usedGb / 1024).toFixed(1)} / ${(vol.totalGb / 1024).toFixed(1)} TB`
                      : `${vol.usedGb >= 100 ? Math.round(vol.usedGb) : vol.usedGb.toFixed(0)} / ${
                          vol.totalGb >= 100 ? Math.round(vol.totalGb) : vol.totalGb.toFixed(0)
                        } GB`;
                  return (
                    <div key={vol.id} className="flex min-h-0 flex-col justify-center gap-1.5 overflow-hidden">
                      <div className="flex items-center justify-between gap-2 overflow-hidden">
                        <span className="font-medium text-white/85" style={{ fontSize: "var(--fs-sm)" }}>
                          {vol.letter}:
                        </span>
                        <span className="truncate text-white/45" style={{ fontSize: "var(--fs-xs)" }}>
                          {usedLabel}
                        </span>
                      </div>
                      <Bar value={vol.percent} color={color} />
                    </div>
                  );
                })
              )}
              <div className="shrink-0 truncate text-white/45" style={{ fontSize: "var(--fs-xs)" }}>
                读 {fmt(data.diskIO.readMBps, 0)} MB/s · 写 {fmt(data.diskIO.writeMBps, 0)} MB/s
              </div>
            </div>
          </Glass>
        </section>
      </div>
    </div>
  );
}
