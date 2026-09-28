import "server-only";

import si from "systeminformation";
import {
  bytesToGiB,
  formatClock,
  formatUptime,
  toMbps,
  toMiBps,
} from "./format";
import { record, seriesStats } from "./history-store";
import { buildMockMetrics } from "./mock";
import { windowsDiskByteRates } from "./windows-disk-io";
import type { MetricsPayload, ProcessRow, StatusChip, StorageVolume, TempRow } from "./types";

export function mockAllowed(): boolean {
  return process.env.NODE_ENV === "development" && process.env.USE_MOCK === "1";
}

type NetSnap = { iface: string; rx: number; tx: number; at: number };

let prevNet: NetSnap | null = null;
let lastGood: MetricsPayload | null = null;
let inflight: Promise<MetricsPayload> | null = null;

type StaticCache = {
  at: number;
  osInfo: si.Systeminformation.OsData;
  cpuInfo: si.Systeminformation.CpuData;
  diskLayout: si.Systeminformation.DiskLayoutData[];
  hasBattery: boolean;
};

let staticCache: StaticCache | null = null;
const STATIC_TTL_MS = 120_000;

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function withTimeout<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(fallback), ms);
    promise
      .then((v) => {
        clearTimeout(timer);
        resolve(v);
      })
      .catch(() => {
        clearTimeout(timer);
        resolve(fallback);
      });
  });
}

function pickGpu(controllers: si.Systeminformation.GraphicsControllerData[]) {
  const list = controllers || [];
  const skip = /oray|idd|virtual|basic render|remote|parsec|indirect|microsoft basic/i;
  const preferred = list.find(
    (g) =>
      /nvidia|amd|radeon|geforce|rtx|rx|intel.*graphics|uhd|iris|arc/i.test(g.model || "") &&
      !skip.test(g.model || ""),
  );
  if (preferred) return preferred;
  return list.find((g) => g.model && !skip.test(g.model)) || list[0];
}

function volumeLetter(mount: string): string {
  const m = mount.match(/^([A-Za-z]):/);
  return m ? m[1].toUpperCase() : mount.slice(0, 1).toUpperCase();
}

function toDisplayGiB(bytes: number): { value: number; unit: "GB" | "TB" } {
  const gib = bytesToGiB(bytes);
  if (gib >= 1024) return { value: gib / 1024, unit: "TB" };
  return { value: gib, unit: "GB" };
}

function smartLabel(
  health?: string | null,
): { smart: StorageVolume["smart"]; smartTone: StorageVolume["smartTone"] } {
  if (!health || !String(health).trim()) return { smart: "未知", smartTone: "accent" };
  const h = health.toLowerCase();
  if (/good|ok|passed|healthy|normal/.test(h)) return { smart: "正常", smartTone: "ok" };
  if (/warn|caution|pred|fail|bad|critical/.test(h)) return { smart: "注意", smartTone: "warn" };
  return { smart: "未知", smartTone: "accent" };
}

function buildStatus(args: {
  load: number;
  diskPct: number;
  maxTemp: number | null;
}): StatusChip[] {
  const perf: StatusChip =
    args.load >= 90
      ? { label: "负载过高", tone: "crit" }
      : args.load >= 70
        ? { label: "负载偏高", tone: "warn" }
        : { label: "性能正常", tone: "ok" };

  const disk: StatusChip =
    args.diskPct >= 90
      ? { label: "磁盘危急", tone: "crit" }
      : args.diskPct >= 75
        ? { label: "磁盘偏高", tone: "warn" }
        : { label: "磁盘正常", tone: "ok" };

  const heat: StatusChip =
    args.maxTemp == null
      ? { label: "温度暂无", tone: "accent" }
      : args.maxTemp >= 90
        ? { label: "过热风险", tone: "crit" }
        : args.maxTemp >= 80
          ? { label: "温度偏高", tone: "warn" }
          : { label: "无过热", tone: "ok" };

  return [perf, disk, heat, { label: "风扇暂无", tone: "accent" }];
}

function healthScore(load: number, memPct: number, maxTemp: number | null): number {
  let score = 100;
  score -= Math.max(0, load - 40) * 0.35;
  score -= Math.max(0, memPct - 60) * 0.4;
  if (maxTemp != null) score -= Math.max(0, maxTemp - 65) * 0.8;
  return Math.round(Math.min(99, Math.max(1, score)));
}

function pickPrimaryNet(
  stats: si.Systeminformation.NetworkStatsData[],
): si.Systeminformation.NetworkStatsData | undefined {
  const usable = (stats || []).filter(
    (n) =>
      n.iface &&
      !/loopback|isatap|teredo|bluetooth|vethernet|wsl|hyper-v/i.test(n.iface) &&
      (n.operstate === "up" || (n.rx_bytes || 0) + (n.tx_bytes || 0) > 0),
  );
  const scored = [...usable].sort((a, b) => {
    const aLive = (a.rx_sec || 0) + (a.tx_sec || 0);
    const bLive = (b.rx_sec || 0) + (b.tx_sec || 0);
    if (bLive !== aLive) return bLive - aLive;
    return (b.rx_bytes || 0) + (b.tx_bytes || 0) - ((a.rx_bytes || 0) + (a.tx_bytes || 0));
  });
  return scored[0];
}

function rateFromBytes(prev: number, next: number, dtSec: number): number {
  if (!(dtSec > 0) || next < prev) return 0;
  return (next - prev) / dtSec;
}

async function getStatic(): Promise<StaticCache> {
  const now = Date.now();
  if (staticCache && now - staticCache.at < STATIC_TTL_MS) return staticCache;

  const [osInfo, cpuInfo, diskLayout, battery] = await Promise.all([
    withTimeout(si.osInfo(), 3000, {
      hostname: "本机",
      distro: "Windows",
      codename: "",
    } as si.Systeminformation.OsData),
    withTimeout(si.cpu(), 3000, { brand: "CPU" } as si.Systeminformation.CpuData),
    withTimeout(si.diskLayout(), 2500, [] as si.Systeminformation.DiskLayoutData[]),
    withTimeout(
      si.battery(),
      2000,
      { hasBattery: false, isCharging: false, acConnected: true } as si.Systeminformation.BatteryData,
    ),
  ]);

  staticCache = {
    at: now,
    osInfo,
    cpuInfo,
    diskLayout: diskLayout || [],
    hasBattery: Boolean(battery?.hasBattery),
  };
  return staticCache;
}

function ssdTempFromLayout(layout: si.Systeminformation.DiskLayoutData[]): number | null {
  for (const d of layout || []) {
    const raw = (d as { temperature?: number }).temperature;
    if (typeof raw === "number" && raw > 0 && raw < 120) return Math.round(raw);
  }
  return null;
}

function cleanCpuBrand(brand: string): string {
  return brand
    .replace(/\(R\)|\(TM\)|®|™/gi, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 36);
}

async function collectOnce(): Promise<MetricsPayload> {
  const now = Date.now();
  const staticInfo = await getStatic();

  const [memInfo, load, time, fsSize, netStatsRaw, fsStats, temp, graphics, cpuSpeed, battery, winDisk, procs] =
    await Promise.all([
      withTimeout(
        si.mem(),
        2500,
        { total: 0, used: 0, available: 0, active: 0 } as si.Systeminformation.MemData,
      ),
      withTimeout(
        si.currentLoad(),
        2500,
        { currentLoad: 0 } as si.Systeminformation.CurrentLoadData,
      ),
      withTimeout(Promise.resolve(si.time()), 1000, {
        uptime: 0,
      } as si.Systeminformation.TimeData),
      withTimeout(si.fsSize(), 2500, [] as si.Systeminformation.FsSizeData[]),
      withTimeout(si.networkStats(), 2500, [] as si.Systeminformation.NetworkStatsData[]),
      withTimeout(si.fsStats(), 2000, null),
      withTimeout(si.cpuTemperature(), 2000, { main: -1, cores: [] as number[], max: -1 }),
      withTimeout(si.graphics(), 2500, { controllers: [], displays: [] }),
      withTimeout(si.cpuCurrentSpeed(), 1500, { avg: 0, min: 0, max: 0, cores: [] }),
      staticInfo.hasBattery
        ? withTimeout(
            si.battery(),
            1500,
            {
              hasBattery: true,
              isCharging: false,
              acConnected: true,
            } as si.Systeminformation.BatteryData,
          )
        : Promise.resolve({
            hasBattery: false,
            isCharging: false,
            acConnected: true,
          } as si.Systeminformation.BatteryData),
      withTimeout(windowsDiskByteRates(), 3500, null),
      withTimeout(
        si.processes(),
        3000,
        { list: [] } as unknown as si.Systeminformation.ProcessesData,
      ),
    ]);

  // First poll: prime networkStats so rx_sec is populated (si needs 2 samples)
  let netStats = netStatsRaw;
  if (!prevNet) {
    await sleep(350);
    netStats = await withTimeout(si.networkStats(), 2500, netStatsRaw);
  }

  const gpu = pickGpu(graphics.controllers || []);

  // Match Windows Task Manager: GiB, used ≈ total - available
  const totalBytes = memInfo.total || 0;
  const availableBytes = memInfo.available || 0;
  const usedBytes =
    totalBytes > 0 && availableBytes >= 0
      ? Math.max(0, totalBytes - availableBytes)
      : memInfo.used || memInfo.active || 0;
  const totalGiB = bytesToGiB(totalBytes);
  const usedGiB = bytesToGiB(usedBytes);
  const availableGiB = bytesToGiB(availableBytes);
  const memPct = totalBytes > 0 ? (usedBytes / totalBytes) * 100 : 0;

  const volumes = (fsSize || [])
    .filter((f) => /^[A-Za-z]:/.test(f.mount) && f.size > 0)
    .sort((a, b) => volumeLetter(a.mount).localeCompare(volumeLetter(b.mount)));

  const c = volumes.find((v) => volumeLetter(v.mount) === "C") || volumes[0];
  const d = volumes.find((v) => volumeLetter(v.mount) === "D");
  const diskLayout = staticInfo.diskLayout;

  // One physical disk SMART applies to all volumes on that machine when only one SSD
  const primarySmart = smartLabel(diskLayout[0]?.smartStatus);

  const storage: StorageVolume[] = volumes.slice(0, 4).map((vol, idx) => {
    const letter = volumeLetter(vol.mount);
    const used = toDisplayGiB(vol.used);
    const total = toDisplayGiB(vol.size);
    const percent =
      typeof vol.use === "number" && vol.use >= 0
        ? Math.round(vol.use)
        : vol.size > 0
          ? Math.round((vol.used / vol.size) * 100)
          : 0;
    return {
      id: letter.toLowerCase(),
      letter,
      usedGb: used.unit === "TB" ? used.value * 1024 : used.value,
      totalGb: total.unit === "TB" ? total.value * 1024 : total.value,
      unit: total.unit,
      percent,
      smart: primarySmart.smart,
      smartTone: primarySmart.smartTone,
      accent: letter === "C" || idx === 0 ? "orange" : "purple",
    };
  });

  const volumePct = (vol?: si.Systeminformation.FsSizeData) => {
    if (!vol) return 0;
    if (typeof vol.use === "number" && vol.use >= 0) return Math.round(vol.use);
    return vol.size > 0 ? Math.round((vol.used / vol.size) * 100) : 0;
  };

  const cPct = volumePct(c);
  const dPct = volumePct(d);
  const diskPct = Math.max(cPct, dPct, ...storage.map((s) => s.percent), 0);

  const volumesSummary = [c, d]
    .filter(Boolean)
    .map((vol) => {
      const used = toDisplayGiB(vol!.used);
      const total = toDisplayGiB(vol!.size);
      const uDigits = used.unit === "TB" || used.value >= 100 ? 0 : 1;
      const tDigits = total.unit === "TB" ? 1 : 0;
      return `${used.value.toFixed(uDigits)}/${total.value.toFixed(tDigits)}${
        total.unit === "TB" ? "T" : ""
      }`;
    })
    .join(" · ");

  const primary = pickPrimaryNet(netStats);
  let downMbps = 0;
  let upMbps = 0;
  const rxBytes = primary?.rx_bytes ?? 0;
  const txBytes = primary?.tx_bytes ?? 0;
  if (primary) {
    const hasSec =
      typeof primary.rx_sec === "number" &&
      Number.isFinite(primary.rx_sec) &&
      primary.rx_sec >= 0;
    if (hasSec) {
      downMbps = toMbps(primary.rx_sec!);
      upMbps = toMbps(primary.tx_sec || 0);
    } else if (prevNet && prevNet.iface === primary.iface) {
      const dt = (now - prevNet.at) / 1000;
      downMbps = toMbps(rateFromBytes(prevNet.rx, rxBytes, dt));
      upMbps = toMbps(rateFromBytes(prevNet.tx, txBytes, dt));
    }
    prevNet = { iface: primary.iface, rx: rxBytes, tx: txBytes, at: Date.now() };
  }

  // Disk IO: prefer si.fsStats; on Windows fall back to perf counters (MiB/s)
  let readMBps = 0;
  let writeMBps = 0;
  if (fsStats && typeof fsStats.rx_sec === "number" && fsStats.rx_sec >= 0) {
    readMBps = toMiBps(fsStats.rx_sec);
    writeMBps = toMiBps(fsStats.wx_sec || 0);
  } else if (winDisk) {
    readMBps = toMiBps(winDisk.readBps);
    writeMBps = toMiBps(winDisk.writeBps);
  }

  const cpuTempRaw =
    typeof temp.main === "number" && temp.main > 0
      ? temp.main
      : Array.isArray(temp.cores) && temp.cores.some((t) => typeof t === "number" && t > 0)
        ? Math.max(...temp.cores.filter((t): t is number => typeof t === "number" && t > 0))
        : null;
  const gpuTemp =
    typeof gpu?.temperatureGpu === "number" && gpu.temperatureGpu > 0
      ? gpu.temperatureGpu
      : null;

  const temps: TempRow[] = [
    {
      id: "cpu",
      label: "CPU",
      celsius: cpuTempRaw != null ? Math.round(cpuTempRaw) : null,
      max: 95,
    },
    {
      id: "gpu",
      label: "GPU",
      celsius: gpuTemp != null ? Math.round(gpuTemp) : null,
      max: 90,
    },
    { id: "mb", label: "主板", celsius: null, max: 85 },
    { id: "ssd", label: "SSD", celsius: ssdTempFromLayout(diskLayout), max: 80 },
  ];

  const maxTemp = temps
    .map((t) => t.celsius)
    .filter((t): t is number => t != null)
    .reduce<number | null>((m, v) => (m == null || v > m ? v : m), null);

  const loadPct = load.currentLoad || 0;
  const score = healthScore(loadPct, memPct, maxTemp);

  const cpuPct = Math.round(loadPct);
  const cpuHistory = record("cpu", cpuPct);
  const memHistory = record("mem", memPct);
  const gpuHistory = record(
    "gpu",
    typeof gpu?.utilizationGpu === "number" && gpu.utilizationGpu >= 0
      ? Math.round(gpu.utilizationGpu)
      : 0,
  );
  const netDownHist = record("netDown", downMbps);
  const netUpHist = record("netUp", upMbps);
  const ioReadHist = record("ioRead", readMBps);
  const ioWriteHist = record("ioWrite", writeMBps);
  const peak = Math.max(0, ...ioReadHist, ...ioWriteHist, readMBps, writeMBps);
  const cpuStats = seriesStats(cpuHistory, cpuPct);
  const memStats = seriesStats(memHistory, Math.round(memPct));

  // VRAM: memoryTotal (MB) or fallback vram (MB)
  const vramTotalMb =
    typeof gpu?.memoryTotal === "number" && gpu.memoryTotal > 0
      ? gpu.memoryTotal
      : typeof gpu?.vram === "number" && gpu.vram > 0
        ? gpu.vram
        : null;
  const vramUsedMb =
    typeof gpu?.memoryUsed === "number" && gpu.memoryUsed >= 0 ? gpu.memoryUsed : null;
  const vramTotalGb = vramTotalMb != null ? vramTotalMb / 1024 : null;
  const vramUsedGb = vramUsedMb != null ? vramUsedMb / 1024 : null;
  const gpuUtil =
    typeof gpu?.utilizationGpu === "number" && gpu.utilizationGpu >= 0
      ? Math.round(gpu.utilizationGpu)
      : 0;
  const gpuStats = seriesStats(gpuHistory, gpuUtil);
  const gpuPower =
    typeof (gpu as { powerDraw?: number } | undefined)?.powerDraw === "number"
      ? (gpu as { powerDraw: number }).powerDraw
      : null;

  const plugged = staticInfo.hasBattery
    ? Boolean(battery.acConnected || battery.isCharging)
    : true;

  const speedGhz =
    typeof cpuSpeed.avg === "number" && cpuSpeed.avg > 0 ? cpuSpeed.avg : null;
  const cpuLabel = [
    cleanCpuBrand(staticInfo.cpuInfo.brand || "CPU"),
    speedGhz != null ? `@ ${speedGhz.toFixed(2)}GHz` : null,
  ]
    .filter(Boolean)
    .join(" ");

  const ramLabel =
    totalGiB >= 10 ? `${Math.round(totalGiB)} GB` : `${totalGiB.toFixed(1)} GB`;

  const processes: ProcessRow[] = (procs.list || [])
    .filter((p) => p.name && typeof p.cpu === "number" && p.cpu > 0)
    .sort((a, b) => (b.cpu || 0) - (a.cpu || 0))
    .slice(0, 3)
    .map((p) => ({
      name: String(p.name).replace(/\s+/g, " ").trim().slice(0, 28),
      percent: Math.round(p.cpu || 0),
    }));

  return {
    mock: false,
    timestamp: Date.now(),
    host: {
      name: staticInfo.osInfo.hostname || "本机",
      os: staticInfo.osInfo.distro || staticInfo.osInfo.codename || "Windows",
      cpu: cpuLabel,
      ram: ramLabel,
      gpu: (gpu?.model || "暂无").replace(/\s+/g, " ").trim().slice(0, 28),
      uptime: formatUptime(time.uptime || 0),
    },
    clock: formatClock(),
    status: buildStatus({ load: loadPct, diskPct, maxTemp }),
    health: {
      score,
      load: cpuPct,
      temp: temps.find((t) => t.id === "cpu")?.celsius ?? null,
    },
    cpu: {
      percent: cpuPct,
      peak: cpuStats.peak,
      avg: cpuStats.avg,
      history: cpuHistory,
      speedGhz: speedGhz != null ? Number(speedGhz.toFixed(1)) : null,
    },
    memory: {
      percent: Math.round(memPct),
      peak: memStats.peak,
      avg: memStats.avg,
      usedGb: Number(usedGiB.toFixed(1)),
      totalGb: Number(totalGiB.toFixed(1)),
      availableGb: Number(availableGiB.toFixed(1)),
      history: memHistory,
    },
    disk: {
      percent: diskPct,
      volumesSummary: volumesSummary || "—",
      cPercent: cPct,
      dPercent: dPct,
      readMBps: Number(readMBps.toFixed(1)),
      writeMBps: Number(writeMBps.toFixed(1)),
    },
    gpu: {
      percent: gpuUtil,
      peak: gpuStats.peak,
      avg: gpuStats.avg,
      history: gpuHistory,
      vramUsedGb: vramUsedGb != null ? Number(vramUsedGb.toFixed(1)) : null,
      vramTotalGb: vramTotalGb != null ? Number(vramTotalGb.toFixed(1)) : null,
      temp: gpuTemp != null ? Math.round(gpuTemp) : null,
      powerW: gpuPower != null ? Math.round(gpuPower) : null,
    },
    power: {
      mode: "AC",
      plugged,
      drawW: null,
      ratedW: null,
    },
    network: {
      downMbps: Number(downMbps.toFixed(2)),
      upMbps: Number(upMbps.toFixed(2)),
      latencyMs: null,
      rxBytesToday: rxBytes,
      txBytesToday: txBytes,
      historyDown: netDownHist,
      historyUp: netUpHist,
    },
    temps,
    diskIO: {
      readMBps: Number(readMBps.toFixed(1)),
      writeMBps: Number(writeMBps.toFixed(1)),
      peak: Number(peak.toFixed(1)),
      historyRead: ioReadHist,
      historyWrite: ioWriteHist,
    },
    storage,
    processes,
  };
}

export async function collectMetrics(): Promise<MetricsPayload> {
  if (mockAllowed()) return buildMockMetrics();

  if (inflight) return inflight;

  inflight = collectOnce()
    .then((data) => {
      lastGood = data;
      return data;
    })
    .catch((err) => {
      if (lastGood) return { ...lastGood, clock: formatClock(), timestamp: Date.now() };
      throw err;
    })
    .finally(() => {
      inflight = null;
    });

  return inflight;
}
