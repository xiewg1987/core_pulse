import "server-only";

import { execFile } from "child_process";
import { promisify } from "util";

const execFileAsync = promisify(execFile);

export type DiskByteRate = {
  readBps: number;
  writeBps: number;
};

export type WindowsDiskRates = {
  total: DiskByteRate;
  /** Drive letter → byte rates (e.g. "C"). */
  byLetter: Record<string, DiskByteRate>;
};

/**
 * Windows LogicalDisk rates via performance counters (per drive letter).
 * Instance names look like "C:" / "D:" / "_Total".
 */
export async function windowsDiskByteRates(): Promise<WindowsDiskRates | null> {
  if (process.platform !== "win32") return null;

  try {
    const { stdout } = await execFileAsync(
      "powershell.exe",
      [
        "-NoProfile",
        "-Command",
        [
          "$samples = (Get-Counter -Counter @(",
          "  '\\LogicalDisk(*)\\Disk Read Bytes/sec',",
          "  '\\LogicalDisk(*)\\Disk Write Bytes/sec'",
          ") -MaxSamples 1).CounterSamples;",
          "$samples | ForEach-Object {",
          "  $kind = if ($_.Path -match 'disk read bytes') { 'r' } else { 'w' };",
          "  '{0}|{1}|{2}' -f $_.InstanceName, $kind, ([double]$_.CookedValue)",
          "}",
        ].join(" "),
      ],
      { windowsHide: true, timeout: 5000, encoding: "utf8" },
    );

    const byLetter: Record<string, DiskByteRate> = {};
    let total: DiskByteRate = { readBps: 0, writeBps: 0 };

    for (const line of String(stdout).split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      const [instanceRaw, kind, valueRaw] = trimmed.split("|");
      if (!instanceRaw || !kind || valueRaw == null) continue;
      const value = Number(valueRaw);
      if (!Number.isFinite(value) || value < 0) continue;

      const instance = instanceRaw.trim();
      const lower = instance.toLowerCase();
      if (lower === "_total") {
        if (kind === "r") total = { ...total, readBps: value };
        else total = { ...total, writeBps: value };
        continue;
      }

      // Prefer "C:" style; skip HarddiskVolume* / mount-point instances.
      const letterMatch = instance.match(/^([A-Za-z]):$/);
      if (!letterMatch) continue;
      const letter = letterMatch[1].toUpperCase();
      const cur = byLetter[letter] || { readBps: 0, writeBps: 0 };
      if (kind === "r") cur.readBps = value;
      else cur.writeBps = value;
      byLetter[letter] = cur;
    }

    if (Object.keys(byLetter).length === 0 && total.readBps === 0 && total.writeBps === 0) {
      return null;
    }

    // If _Total is missing, sum letters.
    if (total.readBps === 0 && total.writeBps === 0) {
      for (const rate of Object.values(byLetter)) {
        total.readBps += rate.readBps;
        total.writeBps += rate.writeBps;
      }
    }

    return { total, byLetter };
  } catch {
    /* unavailable */
  }
  return null;
}
