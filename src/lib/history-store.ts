import "server-only";

import { pushHistory } from "./format";

type HistKey = "cpu" | "mem" | "gpu" | "netDown" | "netUp" | "ioRead" | "ioWrite";

const store: Record<HistKey, number[]> = {
  cpu: [],
  mem: [],
  gpu: [],
  netDown: [],
  netUp: [],
  ioRead: [],
  ioWrite: [],
};

export function record(key: HistKey, value: number, max = 32): number[] {
  store[key] = pushHistory(store[key], value, max);
  return store[key];
}

export function get(key: HistKey): number[] {
  return store[key];
}

export function seriesStats(history: number[], current: number) {
  const vals = history.length ? history : [current];
  const peak = Math.round(Math.max(current, ...vals));
  const avg = Math.round(vals.reduce((a, b) => a + b, 0) / vals.length);
  return { peak, avg };
}
