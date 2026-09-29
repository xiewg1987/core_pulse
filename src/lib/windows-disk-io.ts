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
 * Windows PhysicalDisk rates via performance counters.
 * Instance names look like "2 c:" / "0 d: e:" — letters map to volumes.
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
          "  '\\PhysicalDisk(*)\\Disk Read Bytes/sec',",
          "  '\\PhysicalDisk(*)\\Disk Write Bytes/sec'",
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

      const instance = instanceRaw.toLowerCase();
      if (instance === "_total") {
        if (kind === "r") total = { ...total, readBps: value };
        else total = { ...total, writeBps: value };
        continue;
      }

      const letters = [...instance.matchAll(/\b([a-z]):/g)].map((m) => m[1].toUpperCase());
      if (!letters.length) continue;
      // Split bytes evenly across letters on the same physical disk.
      const share = value / letters.length;
      for (const letter of letters) {
        const cur = byLetter[letter] || { readBps: 0, writeBps: 0 };
        if (kind === "r") cur.readBps += share;
        else cur.writeBps += share;
        byLetter[letter] = cur;
      }
    }

    if (Object.keys(byLetter).length === 0 && total.readBps === 0 && total.writeBps === 0) {
      return null;
    }
    return { total, byLetter };
  } catch {
    /* unavailable */
  }
  return null;
}
