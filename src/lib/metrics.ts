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
import { buildMockMetrics, buildMockProcessList } from "./mock";
import { windowsDiskByteRates } from "./windows-disk-io";
import { windowsNvidiaGpu } from "./windows-gpu";
import { windowsProcessPrivateMem, type ProcMemSnap } from "./windows-proc-mem";
import type {
  MetricsPayload,
  ProcessKind,
  ProcessListItem,
  ProcessListPayload,
  ProcessRow,
  StatusChip,
  StorageVolume,
  TempRow,
} from "./types";

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

function gpuScore(g: si.Systeminformation.GraphicsControllerData): number {
  const model = `${g.vendor || ""} ${g.model || ""}`;
  if (/oray|idd|virtual|basic render|remote|parsec|indirect|microsoft basic|meta virtual/i.test(model)) {
    return -100;
  }
  let score = 0;
  // Prefer discrete NVIDIA / AMD over iGPU (Intel often appears first in the list).
  if (/nvidia|geforce|rtx|quadro|tesla/i.test(model)) score += 100;
  if (/amd|radeon|\brx\b/i.test(model)) score += 90;
  if (/intel.*arc/i.test(model)) score += 80;
  if (/intel|uhd|iris/i.test(model)) score += 20;
  if (typeof g.memoryTotal === "number" && g.memoryTotal > 2048) score += 15;
  else if (typeof g.vram === "number" && g.vram > 2048) score += 10;
  if (typeof g.utilizationGpu === "number" && g.utilizationGpu >= 0) score += 5;
  if (g.bus === "PCI") score += 5;
  return score;
}

function pickGpu(controllers: si.Systeminformation.GraphicsControllerData[]) {
  const list = controllers || [];
  if (!list.length) return undefined;
  return [...list].sort((a, b) => gpuScore(b) - gpuScore(a))[0];
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

  return [perf, disk];
}

function healthScore(load: number, memPct: number): number {
  let score = 100;
  score -= Math.max(0, load - 40) * 0.35;
  score -= Math.max(0, memPct - 60) * 0.4;
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

/** Kernel processes that are not meaningful "end process" targets. */
const SKIP_PROCESS = new Set([
  "system idle process",
  "system",
  "registry",
  "memory compression",
  "secure system",
]);

/**
 * Windows service / shell hosts — Task Manager "Apps" folds these into the parent app
 * (e.g. MiniMax Code's node.exe children show under MiniMax, not as node.exe).
 */
const ROLLUP_HOST = new Set([
  "node.exe",
  "cmd.exe",
  "powershell.exe",
  "pwsh.exe",
  "conhost.exe",
  "runtimebroker.exe",
  "dllhost.exe",
  "werfault.exe",
  "openidictionary.exe",
  "crashpad_handler.exe",
  "git.exe",
  "bash.exe",
]);

/** Background Windows processes — hide from the memory "Apps" style top list. */
const HIDE_FROM_MEM_TOP = new Set([
  "svchost.exe",
  "services.exe",
  "lsass.exe",
  "csrss.exe",
  "wininit.exe",
  "winlogon.exe",
  "smss.exe",
  "fontdrvhost.exe",
  "dwm.exe",
  "sihost.exe",
  "taskhostw.exe",
  "explorer.exe",
  "shellexperiencehost.exe",
  "startmenuexperiencehost.exe",
  "searchhost.exe",
  "searchindexer.exe",
  "securityhealthservice.exe",
  "msmpeng.exe",
  "nissrv.exe",
  "wudfhost.exe",
  "memory compression",
  "registry",
  "system",
  "idle",
]);

type ProcSnap = {
  name?: string;
  pid?: number;
  parentPid?: number;
  cpu?: number;
  mem?: number;
  memRss?: number;
};

function normalizeProcName(name?: string): string | null {
  const raw = String(name || "")
    .replace(/\s+/g, " ")
    .trim();
  if (!raw) return null;
  if (SKIP_PROCESS.has(raw.toLowerCase())) return null;
  return raw.slice(0, 28);
}

function displayProcName(name: string): string {
  // Task Manager style: "MiniMax Code.exe" → "MiniMax Code"
  return name.replace(/\.exe$/i, "").trim() || name;
}

/**
 * Attribute helper hosts (node/cmd/…) to the nearest real app ancestor,
 * matching Task Manager Apps (MiniMax owns its node children).
 * System processes are skipped, not rolled into siblings.
 */
function resolveAppName(
  proc: { name?: string; pid?: number; parentPid?: number },
  byPid: Map<number, { name?: string; pid?: number; parentPid?: number }>,
): string | null {
  const selfName = normalizeProcName(proc.name);
  if (!selfName) return null;
  const selfKey = selfName.toLowerCase();

  if (HIDE_FROM_MEM_TOP.has(selfKey)) return null;
  if (!ROLLUP_HOST.has(selfKey)) return selfName;

  let cur: { name?: string; pid?: number; parentPid?: number } | undefined = proc;
  const seen = new Set<number>();
  for (let i = 0; i < 12 && cur; i++) {
    const pid = typeof cur.pid === "number" ? cur.pid : -1;
    if (pid >= 0) {
      if (seen.has(pid)) break;
      seen.add(pid);
    }
    const name = normalizeProcName(cur.name);
    if (!name) break;
    const key = name.toLowerCase();
    if (HIDE_FROM_MEM_TOP.has(key)) return null;
    if (!ROLLUP_HOST.has(key)) return name;
    const parentPid = cur.parentPid;
    if (typeof parentPid !== "number" || parentPid <= 0) break;
    cur = byPid.get(parentPid);
  }
  return null;
}

/**
 * Top programs by CPU / memory.
 * Memory prefers Windows Working-Set-Private (Task Manager column).
 */
function topProcessesByCpu(list: ProcSnap[], limit = 5): ProcessRow[] {
  const byPid = new Map<number, ProcSnap>();
  for (const p of list) {
    if (typeof p.pid === "number") byPid.set(p.pid, p);
  }
  const grouped = new Map<
    string,
    { name: string; imageName: string; cpu: number; pids: number[] }
  >();
  for (const p of list) {
    const imageName = resolveAppName(p, byPid) || normalizeProcName(p.name);
    if (!imageName) continue;
    if (HIDE_FROM_MEM_TOP.has(imageName.toLowerCase())) continue;
    const cpu = typeof p.cpu === "number" && p.cpu > 0 ? p.cpu : 0;
    if (cpu <= 0) continue;
    const key = imageName.toLowerCase();
    const cur = grouped.get(key) || {
      name: displayProcName(imageName),
      imageName,
      cpu: 0,
      pids: [],
    };
    cur.cpu += cpu;
    if (typeof p.pid === "number" && p.pid > 0) cur.pids.push(p.pid);
    grouped.set(key, cur);
  }
  return [...grouped.values()]
    .sort((a, b) => b.cpu - a.cpu)
    .slice(0, limit)
    .map((p) => ({
      name: p.name,
      imageName: p.imageName,
      pids: [...new Set(p.pids)],
      percent: Math.max(0, Math.round(p.cpu)),
    }));
}

function topProcessesByMemory(
  list: ProcSnap[],
  totalBytes: number,
  limit = 5,
  privateMem: ProcMemSnap[] | null = null,
): ProcessRow[] {
  type Row = { name?: string; pid?: number; parentPid?: number; bytes: number };
  const rows: Row[] = privateMem?.length
    ? privateMem.map((p) => ({
        name: p.name,
        pid: p.pid,
        parentPid: p.parentPid,
        bytes: p.privateBytes,
      }))
    : list.map((p) => ({
        name: p.name,
        pid: p.pid,
        parentPid: p.parentPid,
        // memRss is KiB Working Set — fallback only
        bytes: typeof p.memRss === "number" && p.memRss > 0 ? p.memRss * 1024 : 0,
      }));

  const byPid = new Map<number, Row>();
  for (const p of rows) {
    if (typeof p.pid === "number") byPid.set(p.pid, p);
  }

  const grouped = new Map<
    string,
    { name: string; imageName: string; bytes: number; pids: number[] }
  >();
  for (const p of rows) {
    const imageName = resolveAppName(p, byPid);
    if (!imageName) continue;
    if (HIDE_FROM_MEM_TOP.has(imageName.toLowerCase())) continue;
    if (p.bytes <= 0) continue;
    const key = imageName.toLowerCase();
    const cur = grouped.get(key) || {
      name: displayProcName(imageName),
      imageName,
      bytes: 0,
      pids: [],
    };
    cur.bytes += p.bytes;
    if (typeof p.pid === "number" && p.pid > 0) cur.pids.push(p.pid);
    grouped.set(key, cur);
  }

  return [...grouped.values()]
    .sort((a, b) => b.bytes - a.bytes)
    .slice(0, limit)
    .map((p) => {
      const usedMb = p.bytes / (1024 * 1024);
      const percent =
        totalBytes > 0 ? Math.max(0, Math.round((p.bytes / totalBytes) * 100)) : 0;
      return {
        name: p.name,
        imageName: p.imageName,
        pids: [...new Set(p.pids)],
        percent,
        usedMb: Number(usedMb.toFixed(usedMb >= 100 ? 0 : 1)),
      };
    });
}

async function collectOnce(): Promise<MetricsPayload> {
  const now = Date.now();
  const staticInfo = await getStatic();

  const [
    memInfo,
    load,
    time,
    fsSize,
    netStatsRaw,
    fsStats,
    temp,
    graphics,
    cpuSpeed,
    battery,
    winDisk,
    nvidiaSnap,
    winProcMem,
    procs,
    blockDevices,
  ] = await Promise.all([
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
      withTimeout(windowsNvidiaGpu(), 2500, null),
      withTimeout(windowsProcessPrivateMem(), 8000, null),
      withTimeout(
        si.processes(),
        3000,
        { list: [] } as unknown as si.Systeminformation.ProcessesData,
      ),
      withTimeout(si.blockDevices(), 2500, [] as si.Systeminformation.BlockDevicesData[]),
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

  const labelByLetter = new Map<string, string>();
  for (const b of blockDevices || []) {
    const letter = volumeLetter(b.mount || b.name || "");
    const label = String(b.label || "").trim();
    if (letter && label) labelByLetter.set(letter, label);
  }

  const c = volumes.find((v) => volumeLetter(v.mount) === "C") || volumes[0];
  const d = volumes.find((v) => volumeLetter(v.mount) === "D");
  const diskLayout = staticInfo.diskLayout;

  // One physical disk SMART applies to all volumes on that machine when only one SSD
  const primarySmart = smartLabel(diskLayout[0]?.smartStatus);

  const storage: StorageVolume[] = volumes.map((vol, idx) => {
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
      label: labelByLetter.get(letter) || null,
      usedGb: used.unit === "TB" ? used.value * 1024 : used.value,
      totalGb: total.unit === "TB" ? total.value * 1024 : total.value,
      unit: total.unit,
      percent,
      readMBps: 0,
      writeMBps: 0,
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

  // Disk IO: prefer Windows per-disk perf counters; else si.fsStats total
  let readMBps = 0;
  let writeMBps = 0;
  if (winDisk) {
    readMBps = toMiBps(winDisk.total.readBps);
    writeMBps = toMiBps(winDisk.total.writeBps);
    for (const vol of storage) {
      const rate = winDisk.byLetter[vol.letter];
      vol.readMBps = rate ? Number(toMiBps(rate.readBps).toFixed(1)) : 0;
      vol.writeMBps = rate ? Number(toMiBps(rate.writeBps).toFixed(1)) : 0;
    }
  } else if (fsStats && typeof fsStats.rx_sec === "number" && fsStats.rx_sec >= 0) {
    readMBps = toMiBps(fsStats.rx_sec);
    writeMBps = toMiBps(fsStats.wx_sec || 0);
  }

  const cpuTempRaw =
    typeof temp.main === "number" && temp.main > 0
      ? temp.main
      : Array.isArray(temp.cores) && temp.cores.some((t) => typeof t === "number" && t > 0)
        ? Math.max(...temp.cores.filter((t): t is number => typeof t === "number" && t > 0))
        : null;
  const gpuTemp =
    nvidiaSnap?.temperature != null && nvidiaSnap.temperature > 0
      ? nvidiaSnap.temperature
      : typeof gpu?.temperatureGpu === "number" && gpu.temperatureGpu > 0
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

  const loadPct = load.currentLoad || 0;
  const score = healthScore(loadPct, memPct);

  const gpuUtilRaw =
    nvidiaSnap?.utilization != null && nvidiaSnap.utilization >= 0
      ? nvidiaSnap.utilization
      : typeof gpu?.utilizationGpu === "number" && gpu.utilizationGpu >= 0
        ? gpu.utilizationGpu
        : null;
  const gpuUtil = gpuUtilRaw != null ? Math.round(gpuUtilRaw) : 0;
  const cpuPct = Math.round(loadPct);
  const cpuHistory = record("cpu", cpuPct);
  const memHistory = record("mem", memPct);
  const gpuHistory = record("gpu", gpuUtil);
  const netDownHist = record("netDown", downMbps);
  const netUpHist = record("netUp", upMbps);
  const ioReadHist = record("ioRead", readMBps);
  const ioWriteHist = record("ioWrite", writeMBps);
  const peak = Math.max(0, ...ioReadHist, ...ioWriteHist, readMBps, writeMBps);
  const cpuStats = seriesStats(cpuHistory, cpuPct);
  const memStats = seriesStats(memHistory, Math.round(memPct));

  // VRAM: prefer nvidia-smi MiB, else systeminformation memoryTotal/vram (MB)
  const vramTotalMb =
    nvidiaSnap?.memoryTotalMb != null && nvidiaSnap.memoryTotalMb > 0
      ? nvidiaSnap.memoryTotalMb
      : typeof gpu?.memoryTotal === "number" && gpu.memoryTotal > 0
        ? gpu.memoryTotal
        : typeof gpu?.vram === "number" && gpu.vram > 0
          ? gpu.vram
          : null;
  const vramUsedMb =
    nvidiaSnap?.memoryUsedMb != null && nvidiaSnap.memoryUsedMb >= 0
      ? nvidiaSnap.memoryUsedMb
      : typeof gpu?.memoryUsed === "number" && gpu.memoryUsed >= 0
        ? gpu.memoryUsed
        : null;
  const vramTotalGb = vramTotalMb != null ? vramTotalMb / 1024 : null;
  const vramUsedGb = vramUsedMb != null ? vramUsedMb / 1024 : null;
  const gpuStats = seriesStats(gpuHistory, gpuUtil);
  const gpuPower =
    nvidiaSnap?.powerDraw != null
      ? nvidiaSnap.powerDraw
      : typeof (gpu as { powerDraw?: number } | undefined)?.powerDraw === "number"
        ? (gpu as { powerDraw: number }).powerDraw
        : null;

  const plugged = staticInfo.hasBattery
    ? Boolean(battery.acConnected || battery.isCharging)
    : true;

  const speedGhz =
    typeof cpuSpeed.avg === "number" && cpuSpeed.avg > 0 ? cpuSpeed.avg : null;
  const cpuLabel = cleanCpuBrand(staticInfo.cpuInfo.brand || "CPU");

  const ramLabel =
    totalGiB >= 10 ? `${Math.round(totalGiB)} GB` : `${totalGiB.toFixed(1)} GB`;

  const list = procs.list || [];
  const processesCpu = topProcessesByCpu(list, 5);
  const processesMem = topProcessesByMemory(list, totalBytes, 5, winProcMem);

  return {
    mock: false,
    timestamp: Date.now(),
    host: {
      name: staticInfo.osInfo.hostname || "本机",
      os: staticInfo.osInfo.distro || staticInfo.osInfo.codename || "Windows",
      cpu: cpuLabel,
      ram: ramLabel,
      gpu: (nvidiaSnap?.name || gpu?.model || "暂无").replace(/\s+/g, " ").trim().slice(0, 28),
      uptime: formatUptime(time.uptime || 0),
    },
    clock: formatClock(),
    status: buildStatus({ load: loadPct, diskPct }),
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
    processesCpu,
    processesMem,
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

function classifyProcessKind(imageName: string): ProcessKind {
  const key = imageName.toLowerCase();
  if (HIDE_FROM_MEM_TOP.has(key) || key === "system" || key === "idle") return "系统";
  if (ROLLUP_HOST.has(key)) return "后台";
  return "应用";
}

/**
 * Full process table for the 全部进程 page — one row per PID.
 * Sorted by CPU desc by default (client may re-sort).
 */
export async function listAllProcesses(): Promise<ProcessListPayload> {
  if (mockAllowed()) return buildMockProcessList();

  const [procs, privateMem] = await Promise.all([
    withTimeout(
      si.processes(),
      4000,
      { list: [] } as unknown as si.Systeminformation.ProcessesData,
    ),
    withTimeout(windowsProcessPrivateMem(), 8000, null),
  ]);

  const memByPid = new Map<number, number>();
  for (const p of privateMem || []) {
    if (p.pid > 0) memByPid.set(p.pid, p.privateBytes);
  }

  const list = (procs.list || []) as ProcSnap[];
  const rows: ProcessListItem[] = [];

  for (const p of list) {
    const imageName = normalizeProcName(p.name);
    if (!imageName) continue;
    const pid = typeof p.pid === "number" ? p.pid : 0;
    if (pid <= 0) continue;

    const cpu = typeof p.cpu === "number" && p.cpu > 0 ? p.cpu : 0;
    const bytes =
      memByPid.get(pid) ??
      (typeof p.memRss === "number" && p.memRss > 0 ? p.memRss * 1024 : 0);
    const usedMb = bytes / (1024 * 1024);

    rows.push({
      name: displayProcName(imageName),
      imageName,
      pid,
      pids: [pid],
      cpuPercent: Number(cpu.toFixed(1)),
      usedMb: Number(usedMb.toFixed(usedMb >= 100 ? 0 : 1)),
      kind: classifyProcessKind(imageName),
    });
  }

  rows.sort((a, b) => b.cpuPercent - a.cpuPercent || b.usedMb - a.usedMb);

  return {
    mock: false,
    timestamp: Date.now(),
    clock: formatClock(),
    processes: rows.slice(0, 200),
  };
}
