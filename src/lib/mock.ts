import "server-only";

import { formatClock } from "./format";
import type { MetricsPayload } from "./types";

function wave(seed: number, amp: number, base: number): number {
  const t = Date.now() / 1000 + seed;
  return Math.max(0, base + Math.sin(t) * amp + Math.sin(t * 0.37) * amp * 0.4);
}

function series(base: number, amp: number, n = 32): number[] {
  return Array.from({ length: n }, (_, i) =>
    Math.max(0, base + Math.sin(i * 0.45 + Date.now() / 4000) * amp),
  );
}

function stats(history: number[], current: number) {
  const vals = history.length ? history : [current];
  return {
    peak: Math.round(Math.max(current, ...vals)),
    avg: Math.round(vals.reduce((a, b) => a + b, 0) / vals.length),
  };
}

export function buildMockMetrics(): MetricsPayload {
  const cpuPct = wave(0, 8, 42);
  const memPct = wave(1, 4, 68);
  const gpuPct = wave(2, 6, 31);
  const read = wave(3, 18, 86);
  const write = wave(4, 12, 42);
  const down = wave(5, 8, 42.6);
  const up = wave(6, 2.5, 8.2);
  const cpuTemp = wave(7, 3, 68);
  const gpuTemp = wave(8, 2, 62);

  const cpuHist = series(42, 10);
  const memHist = series(68, 6);
  const gpuHist = series(31, 8);
  const cpuS = stats(cpuHist, cpuPct);
  const memS = stats(memHist, memPct);
  const gpuS = stats(gpuHist, gpuPct);

  return {
    mock: true,
    timestamp: Date.now(),
    host: {
      name: "我的主力机",
      os: "Windows 11 Pro",
      cpu: "Ryzen 7 7800X3D",
      ram: "32 GB DDR5",
      gpu: "RTX 4070",
      uptime: "14h 22m",
    },
    clock: formatClock(),
    status: [
      { label: "性能正常", tone: "ok" },
      { label: "磁盘正常", tone: "ok" },
      { label: "负载平稳", tone: "ok" },
      { label: "风扇安静", tone: "accent" },
    ],
    health: {
      score: 87,
      load: Math.round(cpuPct),
      temp: Math.round(cpuTemp),
    },
    cpu: {
      percent: Math.round(cpuPct),
      peak: cpuS.peak,
      avg: cpuS.avg,
      history: cpuHist,
      speedGhz: 4.2,
    },
    memory: {
      percent: Math.round(memPct),
      peak: memS.peak,
      avg: memS.avg,
      usedGb: 21.8,
      totalGb: 32,
      availableGb: 10.2,
      history: memHist,
    },
    disk: {
      percent: 39,
      volumesSummary: "186/476 · 612/931",
      cPercent: 39,
      dPercent: 66,
      readMBps: Math.round(read),
      writeMBps: Math.round(write),
    },
    gpu: {
      percent: Math.round(gpuPct),
      peak: gpuS.peak,
      avg: gpuS.avg,
      history: gpuHist,
      vramUsedGb: 4.1,
      vramTotalGb: 12,
      temp: Math.round(gpuTemp),
      powerW: 98,
    },
    power: {
      mode: "AC",
      plugged: true,
      drawW: 186,
      ratedW: 750,
    },
    network: {
      downMbps: Number(down.toFixed(1)),
      upMbps: Number(up.toFixed(1)),
      latencyMs: 12,
      rxBytesToday: 12_000_000_000,
      txBytesToday: 3_000_000_000,
      historyDown: series(42, 10),
      historyUp: series(8, 3),
    },
    temps: [
      { id: "cpu", label: "CPU", celsius: Math.round(cpuTemp), max: 95 },
      { id: "gpu", label: "GPU", celsius: Math.round(gpuTemp), max: 90 },
      { id: "mb", label: "主板", celsius: 48, max: 85 },
      { id: "ssd", label: "SSD", celsius: 41, max: 80 },
    ],
    diskIO: {
      readMBps: Number((read / 2).toFixed(1)) || 128,
      writeMBps: Number((write / 2).toFixed(1)) || 46,
      peak: Math.round(Math.max(read, write, 186)),
      historyRead: series(86, 20),
      historyWrite: series(42, 14),
    },
    storage: [
      {
        id: "c",
        letter: "C",
        usedGb: 186,
        totalGb: 476,
        unit: "GB",
        percent: 39,
        smart: "正常",
        smartTone: "ok",
        accent: "orange",
      },
      {
        id: "d",
        letter: "D",
        usedGb: 612,
        totalGb: 931,
        unit: "GB",
        percent: 66,
        smart: "正常",
        smartTone: "ok",
        accent: "purple",
      },
    ],
    processes: [
      { name: "chrome.exe", percent: 12 },
      { name: "Code.exe", percent: 8 },
      { name: "Discord.exe", percent: 3 },
    ],
  };
}
