import "server-only";

import { execFile } from "child_process";
import { promisify } from "util";

const execFileAsync = promisify(execFile);

export type WindowsGpuSnap = {
  name: string | null;
  utilization: number | null;
  memoryTotalMb: number | null;
  memoryUsedMb: number | null;
  temperature: number | null;
  powerDraw: number | null;
};

/**
 * NVIDIA GPU snapshot via nvidia-smi (CSV).
 * systeminformation often omits utilizationGpu on Windows.
 */
export async function windowsNvidiaGpu(): Promise<WindowsGpuSnap | null> {
  if (process.platform !== "win32") return null;

  try {
    const { stdout } = await execFileAsync(
      "nvidia-smi",
      [
        "--query-gpu=name,utilization.gpu,memory.total,memory.used,temperature.gpu,power.draw",
        "--format=csv,noheader,nounits",
      ],
      { windowsHide: true, timeout: 2500, encoding: "utf8" },
    );

    const line = String(stdout)
      .split(/\r?\n/)
      .map((l) => l.trim())
      .find(Boolean);
    if (!line) return null;

    const parts = line.split(",").map((p) => p.trim());
    if (parts.length < 6) return null;

    const num = (raw: string) => {
      if (!raw || /^\[?n\/?a\]?$/i.test(raw)) return null;
      const n = Number(raw);
      return Number.isFinite(n) ? n : null;
    };

    return {
      name: parts[0] || null,
      utilization: num(parts[1]),
      memoryTotalMb: num(parts[2]),
      memoryUsedMb: num(parts[3]),
      temperature: num(parts[4]),
      powerDraw: num(parts[5]),
    };
  } catch {
    /* nvidia-smi missing or failed */
  }
  return null;
}
