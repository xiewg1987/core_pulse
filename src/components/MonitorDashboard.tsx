"use client";

import { useState, useTransition } from "react";
import {
  ArcGauge,
  Bar,
  Chip,
  DualWave,
  Glass,
  KpiRow,
  Sparkline,
} from "@/components/ui";
import { endProcessGroup } from "@/actions/metrics";
import type { MetricsPayload } from "@/lib/types";
import { QuickLaunchCard } from "@/components/QuickLaunchCard";

function fmt(n: number | null | undefined, digits = 0): string {
  if (n == null || Number.isNaN(n)) return "—";
  return digits > 0 ? n.toFixed(digits) : String(Math.round(n));
}

function shortGpuName(name: string): string {
  return name
    .replace(/^NVIDIA\s+/i, "")
    .replace(/^GeForce\s+/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

function HostDescCard({ host }: { host: MetricsPayload["host"] }) {
  const rows: { label: string; value: string }[] = [
    { label: "主机", value: host.name },
    { label: "系统", value: host.os },
    { label: "CPU", value: host.cpu },
    { label: "内存", value: host.ram },
    { label: "GPU", value: shortGpuName(host.gpu) },
    { label: "开机", value: host.uptime },
  ];
  return (
    <Glass className="card-pad flex min-h-0 min-w-0 flex-col overflow-hidden">
      <h2
        className="mb-[clamp(0.35rem,0.9vh,0.55rem)] shrink-0 truncate text-[#5C4A6E]"
        style={{ fontSize: "var(--fs-sm)" }}
      >
        本机描述
      </h2>
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        {rows.map((row) => (
          <div
            key={row.label}
            className="flex min-h-0 flex-1 items-center justify-between gap-3 overflow-hidden"
          >
            <span className="shrink-0 text-[#5C4A6E]" style={{ fontSize: "var(--fs-sm)" }}>
              {row.label}
            </span>
            <span
              className="min-w-0 truncate text-right text-[#F2E5F5]"
              style={{ fontSize: "var(--fs-sm)" }}
              title={row.value}
            >
              {row.value || "—"}
            </span>
          </div>
        ))}
      </div>
    </Glass>
  );
}

function padProcRows(
  rows: MetricsPayload["processesCpu"],
  count = 5,
): MetricsPayload["processesCpu"] {
  const next = rows.slice(0, count);
  while (next.length < count) {
    next.push({ name: "—", imageName: "", pids: [], percent: 0 });
  }
  return next;
}

function fmtMem(mb: number | null | undefined): string {
  if (mb == null || Number.isNaN(mb) || mb <= 0) return "—";
  if (mb >= 1024) return `${(mb / 1024).toFixed(1)} GB`;
  return `${mb >= 100 ? Math.round(mb) : mb.toFixed(1)} MB`;
}

function ProcColumn({
  title,
  rows,
  valueMode = "percent",
  onKill,
  killingKey,
}: {
  title: string;
  rows: MetricsPayload["processesCpu"];
  valueMode?: "percent" | "memory";
  onKill?: (row: MetricsPayload["processesCpu"][number]) => void;
  killingKey?: string | null;
}) {
  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
      <div className="mb-1 shrink-0 text-[#5C4A6E]" style={{ fontSize: "var(--fs-xs)" }}>
        {title}
      </div>
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        {rows.map((p, i) => {
          const canKill = Boolean(p.imageName && p.name !== "—");
          const key = `${p.imageName}:${p.pids.join(",")}`;
          const busy = killingKey === key;
          return (
            <div
              key={`${title}-${p.name}-${i}`}
              className={`proc-row${i < rows.length - 1 ? " proc-row--div" : ""}`}
            >
              <span
                className="min-w-0 flex-1 truncate text-white/85"
                style={{ fontSize: "var(--fs-sm)" }}
              >
                {p.name}
              </span>
              <span className="shrink-0 text-white/40" style={{ fontSize: "var(--fs-xs)" }}>
                {valueMode === "memory" ? fmtMem(p.usedMb) : `${p.percent}%`}
              </span>
              <button
                type="button"
                className="kill-btn"
                disabled={!canKill || busy || !onKill}
                onClick={() => onKill?.(p)}
              >
                {busy ? "…" : "结束"}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function PowerSessionCard({
  cpuRows,
  memRows,
  onKill,
  killingKey,
  onOpenProcesses,
}: {
  cpuRows: MetricsPayload["processesCpu"];
  memRows: MetricsPayload["processesMem"];
  onKill?: (row: MetricsPayload["processesCpu"][number]) => void;
  killingKey?: string | null;
  onOpenProcesses?: (originEl?: HTMLElement | null) => void;
}) {
  return (
    <Glass className="card-pad flex min-h-0 min-w-0 flex-col overflow-hidden">
      <h2
        className="mb-[clamp(0.3rem,0.7vh,0.45rem)] shrink-0 truncate text-[#5C4A6E]"
        style={{ fontSize: "var(--fs-sm)" }}
      >
        电源与会话
      </h2>
      <div className="mb-[clamp(0.35rem,0.8vh,0.55rem)] grid shrink-0 grid-cols-4 gap-1.5 overflow-hidden">
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
      <div className="mb-[clamp(0.35rem,0.8vh,0.55rem)] flex min-h-0 flex-1 gap-2.5 overflow-hidden">
        <ProcColumn title="CPU" rows={cpuRows} onKill={onKill} killingKey={killingKey} />
        <ProcColumn
          title="内存"
          rows={memRows}
          valueMode="memory"
          onKill={onKill}
          killingKey={killingKey}
        />
      </div>
      <button
        type="button"
        className="all-proc-btn"
        onClick={(e) => onOpenProcesses?.(e.currentTarget)}
      >
        全部进程
      </button>
    </Glass>
  );
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
      className="flex shrink-0 items-center justify-center rounded-none border border-white/15 bg-white/5 text-white/70 transition hover:border-pink/40 hover:text-pink"
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

/** Figma MetricCard: Meta left + semicircle gauge / spark Visual right. */
function MetricCard({
  kind,
  percent,
  subtitle,
  peak,
  avg,
  color,
  history,
  gaugeValue,
}: {
  kind: string;
  percent: number;
  subtitle: string;
  peak: number;
  avg: number;
  color: string;
  history: number[];
  gaugeValue?: number;
}) {
  return (
    <Glass className="card-pad flex min-h-0 min-w-0 items-center gap-3 overflow-hidden">
      <div className="flex min-h-0 min-w-0 flex-1 flex-col justify-center gap-1.5 overflow-hidden">
        <div
          className="tracking-[0.1em] text-[#5C4A6E]"
          style={{ fontSize: "var(--fs-xs)" }}
        >
          {kind}
        </div>
        <div className="glow-num metric-num">{percent}%</div>
        <div
          className="truncate font-mono text-[var(--text-secondary)]"
          style={{ fontSize: "var(--fs-sm)" }}
        >
          {subtitle}
        </div>
        <KpiRow peak={peak} avg={avg} current={percent} />
      </div>
      <div className="flex w-[clamp(5.5rem,38%,9rem)] shrink-0 flex-col items-center justify-center gap-[clamp(0.55rem,1.4vh,1rem)] overflow-hidden">
        <ArcGauge value={gaugeValue ?? percent} color={color} size={100} stroke={10} />
        <Sparkline
          data={history}
          color={color}
          className="h-[clamp(0.9rem,2vh,1.25rem)] w-full"
        />
      </div>
    </Glass>
  );
}

export function MonitorDashboard({
  data,
  ready,
  err,
  refresh,
  onOpenProcesses,
  onOpenAppPicker,
  shortcutRefreshToken = 0,
}: {
  data: MetricsPayload;
  ready: boolean;
  err: string | null;
  refresh: () => void | Promise<void>;
  onOpenProcesses?: (originEl?: HTMLElement | null) => void;
  onOpenAppPicker?: (originEl?: HTMLElement | null) => void;
  shortcutRefreshToken?: number;
}) {
  const [killingKey, setKillingKey] = useState<string | null>(null);
  const [killMsg, setKillMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const [, startTransition] = useTransition();

  const cpuRows = padProcRows(data.processesCpu, 5);
  const memRows = padProcRows(data.processesMem, 5);

  const handleKill = (row: MetricsPayload["processesCpu"][number]) => {
    if (!row.imageName || row.name === "—") return;
    const key = `${row.imageName}:${row.pids.join(",")}`;
    setKillingKey(key);
    setKillMsg(null);
    startTransition(() => {
      void (async () => {
        try {
          const res = await endProcessGroup({
            imageName: row.imageName,
            pids: row.pids,
          });
          setKillMsg({ text: res.message, ok: res.ok });
          if (res.ok) {
            window.setTimeout(() => setKillMsg(null), 2500);
          }
          await refresh();
        } catch (e) {
          setKillMsg({
            text: e instanceof Error ? e.message : "结束失败",
            ok: false,
          });
        } finally {
          setKillingKey(null);
        }
      })();
    });
  };

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
                    className="shrink-0 rounded-none border border-[#FFB020]/40 px-1.5 text-[#FFB020]"
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
                {killMsg ? (
                  <span
                    className={`shrink-0 truncate ${killMsg.ok ? "text-[#2EE6A6]" : "text-[#FF4D6D]"}`}
                    style={{ fontSize: "var(--fs-xs)" }}
                  >
                    {killMsg.text}
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

        {/* Row 2 — Hero: PowerSession + CPU / Memory / GPU / MiniTrend */}
        <section className="grid min-h-0 min-w-0 grid-cols-1 gap-[var(--gap)] overflow-hidden md:grid-cols-[minmax(0,1.05fr)_minmax(0,1.65fr)]">
          <PowerSessionCard
            cpuRows={cpuRows}
            memRows={memRows}
            onKill={handleKill}
            killingKey={killingKey}
            onOpenProcesses={onOpenProcesses}
          />

          <div className="grid min-h-0 min-w-0 grid-cols-2 grid-rows-2 gap-[var(--gap)] overflow-hidden">
            <MetricCard
              kind="CPU"
              percent={data.cpu.percent}
              subtitle={
                data.cpu.speedGhz != null
                  ? `${data.cpu.speedGhz.toFixed(1)} GHz`
                  : "频率暂无"
              }
              peak={data.cpu.peak}
              avg={data.cpu.avg}
              color="#FF2BD6"
              history={data.cpu.history}
            />
            <MetricCard
              kind="MEMORY"
              percent={data.memory.percent}
              subtitle={`${data.memory.usedGb} / ${data.memory.totalGb} GB`}
              peak={data.memory.peak}
              avg={data.memory.avg}
              color="#A855FF"
              history={data.memory.history}
            />
            <MetricCard
              kind="GPU"
              percent={data.gpu.percent}
              subtitle={
                data.gpu.vramUsedGb != null && data.gpu.vramTotalGb != null
                  ? `显存 ${data.gpu.vramUsedGb} / ${data.gpu.vramTotalGb} GB`
                  : "显存暂无"
              }
              peak={data.gpu.peak}
              avg={data.gpu.avg}
              color="#FF2BD6"
              history={data.gpu.history}
              gaugeValue={
                data.gpu.vramTotalGb != null &&
                data.gpu.vramTotalGb > 0 &&
                data.gpu.vramUsedGb != null
                  ? Math.round((data.gpu.vramUsedGb / data.gpu.vramTotalGb) * 100)
                  : data.gpu.percent
              }
            />
            <Glass className="card-pad flex min-h-0 min-w-0 flex-col overflow-hidden">
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

        {/* Row 3 — NETWORK (no HUD corner brackets) */}
        <Glass className="card-pad flex min-h-0 min-w-0 items-center gap-[clamp(0.5rem,1.2vw,1rem)] overflow-hidden">
          <div className="w-[clamp(5.5rem,12vw,9rem)] shrink-0 overflow-hidden">
            <div className="tracking-[0.14em] text-[#5C4A6E]" style={{ fontSize: "var(--fs-xs)" }}>
              NETWORK
            </div>
            <div className="mt-[0.15em] truncate font-semibold text-[#F8F0FF]" style={{ fontSize: "var(--fs-md)" }}>
              实时流量
            </div>
            <span
              className="mt-[0.35em] inline-flex items-center gap-1.5 rounded-none border border-white/12 bg-[rgba(22,11,36,0.55)] px-2 text-[#2EE6A6]"
              style={{ fontSize: "var(--fs-xs)", height: "clamp(1.1rem,2.4vh,1.4rem)" }}
            >
              <span className="live-dot inline-block h-1.5 w-1.5 rounded-full bg-[#2EE6A6] shadow-[0_0_4px_#2EE6A68C]" />
              LIVE
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
              style={{ fontSize: "var(--fs-sm)" }}
            >
              ↑ {fmt(data.network.upMbps, 2)} Mbps
              {data.network.latencyMs != null ? ` · 延迟 ${data.network.latencyMs} ms` : ""}
            </div>
          </div>
        </Glass>

        {/* Row 4 — 本机描述 / 快捷启动 / 存储 */}
        <section className="grid min-h-0 min-w-0 grid-cols-3 gap-[var(--gap)] overflow-hidden">
          <HostDescCard host={data.host} />

          <QuickLaunchCard
            onOpenPicker={onOpenAppPicker}
            refreshToken={shortcutRefreshToken}
          />

          <Glass className="card-pad flex min-h-0 min-w-0 flex-col overflow-hidden">
            <h2
              className="mb-[clamp(0.35rem,0.9vh,0.55rem)] shrink-0 truncate text-[#5C4A6E]"
              style={{ fontSize: "var(--fs-sm)" }}
            >
              存储
            </h2>
            <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
              {data.storage.length === 0 ? (
                <div className="text-white/40" style={{ fontSize: "var(--fs-sm)" }}>
                  暂无磁盘信息
                </div>
              ) : (
                <>
                  <div
                    className="flex min-h-0 flex-col overflow-hidden"
                    style={{
                      gap: data.storage.length >= 4
                        ? "clamp(0.45rem, 1vh, 0.75rem)"
                        : "1rem",
                    }}
                  >
                    {data.storage.map((vol) => {
                      const color = vol.accent === "orange" ? "#FFB020" : "#A855FF";
                      const usedLabel =
                        vol.unit === "TB"
                          ? `${(vol.usedGb / 1024).toFixed(1)} / ${(vol.totalGb / 1024).toFixed(1)} TB`
                          : `${vol.usedGb >= 100 ? Math.round(vol.usedGb) : vol.usedGb.toFixed(0)} / ${
                              vol.totalGb >= 100 ? Math.round(vol.totalGb) : vol.totalGb.toFixed(0)
                            } GB`;
                      const ioLabel = `读 ${fmt(vol.readMBps, 0)} MB/s  ·  写 ${fmt(vol.writeMBps, 0)} MB/s`;
                      return (
                        <div
                          key={vol.id}
                          className="flex shrink-0 flex-col gap-2 overflow-hidden"
                        >
                          <div className="flex items-center justify-between gap-2 overflow-hidden">
                            <div className="flex min-w-0 items-baseline gap-2 overflow-hidden">
                              <span
                                className="shrink-0 text-[#F2E5F5]"
                                style={{ fontSize: "var(--fs-sm)" }}
                              >
                                {vol.letter}:
                              </span>
                              <span
                                className="min-w-0 truncate text-[#B2A6BF]"
                                style={{ fontSize: "var(--fs-xs)" }}
                              >
                                {ioLabel}
                              </span>
                            </div>
                            <span
                              className="shrink-0 truncate text-[#B2A6BF]"
                              style={{ fontSize: "var(--fs-xs)" }}
                            >
                              {usedLabel}
                            </span>
                          </div>
                          <Bar value={vol.percent} color={color} className="h-2!" />
                        </div>
                      );
                    })}
                  </div>
                  <div
                    className="mt-auto shrink-0 pt-2 font-mono text-[var(--text-secondary)]"
                    style={{ fontSize: "var(--fs-xs)" }}
                  >
                    ↑ {fmt(data.diskIO.writeMBps, 0)} MB/s · ↓ {fmt(data.diskIO.readMBps, 0)} MB/s
                  </div>
                </>
              )}
            </div>
          </Glass>
        </section>
      </div>
    </div>
  );
}
