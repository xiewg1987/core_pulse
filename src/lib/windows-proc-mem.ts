import "server-only";

import { execFile } from "child_process";
import { promisify } from "util";

const execFileAsync = promisify(execFile);

export type ProcMemSnap = {
  pid: number;
  name: string;
  parentPid: number;
  /** Working Set - Private, bytes (Task Manager "Memory" column). */
  privateBytes: number;
};

/**
 * Windows process private working sets via CIM.
 * Matches Task Manager Apps memory much better than raw Working Set (memRss).
 */
export async function windowsProcessPrivateMem(): Promise<ProcMemSnap[] | null> {
  if (process.platform !== "win32") return null;

  try {
    const script = [
      "$perf = @{}",
      "Get-CimInstance Win32_PerfFormattedData_PerfProc_Process -ErrorAction Stop | ForEach-Object {",
      "  if ($null -ne $_.IDProcess) { $perf[[int]$_.IDProcess] = [int64]$_.WorkingSetPrivate }",
      "}",
      "Get-CimInstance Win32_Process -ErrorAction Stop | ForEach-Object {",
      "  $wsp = $perf[[int]$_.ProcessId]",
      "  if ($null -eq $wsp) { $wsp = [int64]0 }",
      "  '{0}|{1}|{2}|{3}' -f $_.ProcessId, $_.Name, $_.ParentProcessId, $wsp",
      "}",
    ].join("; ");

    const { stdout } = await execFileAsync(
      "powershell.exe",
      ["-NoProfile", "-Command", script],
      { windowsHide: true, timeout: 8000, encoding: "utf8", maxBuffer: 20 * 1024 * 1024 },
    );

    const rows: ProcMemSnap[] = [];
    for (const line of String(stdout).split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      const [pidS, name, ppidS, bytesS] = trimmed.split("|");
      const pid = Number(pidS);
      const parentPid = Number(ppidS);
      const privateBytes = Number(bytesS);
      if (!name || !Number.isFinite(pid) || pid <= 0) continue;
      if (!Number.isFinite(privateBytes) || privateBytes < 0) continue;
      rows.push({
        pid,
        name,
        parentPid: Number.isFinite(parentPid) ? parentPid : 0,
        privateBytes,
      });
    }
    return rows.length ? rows : null;
  } catch {
    /* unavailable */
  }
  return null;
}
