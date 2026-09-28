import "server-only";

import { execFile } from "child_process";
import { promisify } from "util";

const execFileAsync = promisify(execFile);

/**
 * Windows PhysicalDisk rates via performance counters.
 * systeminformation fsStats/disksIO often return null on consumer Windows.
 */
export async function windowsDiskByteRates(): Promise<{
  readBps: number;
  writeBps: number;
} | null> {
  if (process.platform !== "win32") return null;

  try {
    const { stdout } = await execFileAsync(
      "powershell.exe",
      [
        "-NoProfile",
        "-Command",
        "(Get-Counter -Counter @('\\PhysicalDisk(_Total)\\Disk Read Bytes/sec','\\PhysicalDisk(_Total)\\Disk Write Bytes/sec') -MaxSamples 1).CounterSamples.CookedValue -join ','",
      ],
      { windowsHide: true, timeout: 4000, encoding: "utf8" },
    );
    const parts = String(stdout)
      .trim()
      .split(",")
      .map((s) => Number(s.trim()));
    if (parts.length >= 2 && parts.every((n) => Number.isFinite(n) && n >= 0)) {
      return { readBps: parts[0], writeBps: parts[1] };
    }
  } catch {
    /* unavailable */
  }
  return null;
}
