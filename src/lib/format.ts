export function pad2(n: number): string {
  return n.toString().padStart(2, "0");
}

export function formatClock(date = new Date()): string {
  return `${pad2(date.getHours())}:${pad2(date.getMinutes())}:${pad2(date.getSeconds())}`;
}

export function formatUptime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return `${h}h ${pad2(m)}m`;
}

/** Windows / Task Manager style (1024-based). */
export function bytesToGiB(bytes: number): number {
  return bytes / 1024 ** 3;
}

export function formatGiB(bytes: number, digits = 1): number {
  return Number(bytesToGiB(bytes).toFixed(digits));
}

export function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

/** Network: bits per second → Mbps (decimal megabits). */
export function toMbps(bytesPerSec: number): number {
  return (bytesPerSec * 8) / 1_000_000;
}

/** Disk: bytes/sec → MiB/s (matches Windows Resource Monitor). */
export function toMiBps(bytesPerSec: number): number {
  return bytesPerSec / 1024 ** 2;
}

export function pushHistory(history: number[], value: number, max = 32): number[] {
  const next = [...history, value];
  if (next.length > max) next.splice(0, next.length - max);
  return next;
}
