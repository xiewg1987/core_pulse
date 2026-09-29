import "server-only";

import { formatClock } from "./format";
import type { MetricsPayload, ProcessListPayload } from "./types";

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
        label: "990",
        usedGb: 320,
        totalGb: 1863,
        unit: "TB",
        percent: 17,
        readMBps: 12,
        writeMBps: 4,
        smart: "正常",
        smartTone: "ok",
        accent: "orange",
      },
      {
        id: "d",
        letter: "D",
        label: "860",
        usedGb: 643,
        totalGb: 931,
        unit: "GB",
        percent: 69,
        readMBps: 3,
        writeMBps: 1,
        smart: "正常",
        smartTone: "ok",
        accent: "purple",
      },
      {
        id: "e",
        letter: "E",
        label: "机械",
        usedGb: 5,
        totalGb: 931,
        unit: "GB",
        percent: 1,
        readMBps: 0,
        writeMBps: 0,
        smart: "正常",
        smartTone: "ok",
        accent: "purple",
      },
      {
        id: "f",
        letter: "F",
        label: "980",
        usedGb: 1350,
        totalGb: 1863,
        unit: "TB",
        percent: 72,
        readMBps: 28,
        writeMBps: 9,
        smart: "正常",
        smartTone: "ok",
        accent: "orange",
      },
    ],
    processesCpu: [
      { name: "chrome", imageName: "chrome.exe", pids: [101], percent: 18 },
      { name: "Code", imageName: "Code.exe", pids: [102], percent: 11 },
      { name: "Discord", imageName: "Discord.exe", pids: [103], percent: 4 },
      { name: "Cursor", imageName: "Cursor.exe", pids: [104], percent: 3 },
      { name: "node", imageName: "node.exe", pids: [105], percent: 2 },
    ],
    processesMem: [
      { name: "Cursor", imageName: "Cursor.exe", pids: [201], percent: 2, usedMb: 799 },
      { name: "MiniMax Code", imageName: "MiniMax Code.exe", pids: [202], percent: 1, usedMb: 548 },
      { name: "chrome", imageName: "chrome.exe", pids: [203], percent: 1, usedMb: 420 },
      { name: "Figma", imageName: "Figma.exe", pids: [204], percent: 1, usedMb: 380 },
      { name: "ChatGPT", imageName: "ChatGPT.exe", pids: [205], percent: 1, usedMb: 310 },
    ],
  };
}

export function buildMockProcessList(): ProcessListPayload {
  const samples: ProcessListPayload["processes"] = [
    { name: "chrome", imageName: "chrome.exe", pid: 12480, pids: [12480], cpuPercent: 18.4, usedMb: 799, kind: "应用" },
    { name: "Cursor", imageName: "Cursor.exe", pid: 8821, pids: [8821], cpuPercent: 12.1, usedMb: 642, kind: "应用" },
    { name: "Code", imageName: "Code.exe", pid: 5512, pids: [5512], cpuPercent: 8.6, usedMb: 548, kind: "应用" },
    { name: "Discord", imageName: "Discord.exe", pid: 9934, pids: [9934], cpuPercent: 4.2, usedMb: 615, kind: "应用" },
    { name: "explorer", imageName: "explorer.exe", pid: 1840, pids: [1840], cpuPercent: 1.8, usedMb: 770, kind: "系统" },
    { name: "msedge", imageName: "msedge.exe", pid: 7201, pids: [7201], cpuPercent: 3.1, usedMb: 460, kind: "应用" },
    { name: "node", imageName: "node.exe", pid: 14022, pids: [14022], cpuPercent: 2.4, usedMb: 312, kind: "后台" },
    { name: "Figma", imageName: "Figma.exe", pid: 11008, pids: [11008], cpuPercent: 5.7, usedMb: 890, kind: "应用" },
    { name: "Spotify", imageName: "Spotify.exe", pid: 6033, pids: [6033], cpuPercent: 1.2, usedMb: 210, kind: "应用" },
    { name: "Steam", imageName: "Steam.exe", pid: 4511, pids: [4511], cpuPercent: 0.8, usedMb: 180, kind: "应用" },
    { name: "WeChat", imageName: "WeChat.exe", pid: 3301, pids: [3301], cpuPercent: 1.5, usedMb: 256, kind: "应用" },
    { name: "dwm", imageName: "dwm.exe", pid: 980, pids: [980], cpuPercent: 0.6, usedMb: 140, kind: "系统" },
    { name: "MiniMax", imageName: "MiniMax.exe", pid: 15002, pids: [15002], cpuPercent: 6.8, usedMb: 548, kind: "应用" },
    { name: "System", imageName: "System", pid: 4, pids: [4], cpuPercent: 0.3, usedMb: 12, kind: "系统" },
  ];
  return {
    mock: true,
    timestamp: Date.now(),
    clock: formatClock(),
    processes: samples,
  };
}
