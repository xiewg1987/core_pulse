import "server-only";

import { execFile } from "child_process";
import { promisify } from "util";

const execFileAsync = promisify(execFile);

const BLOCKED = new Set([
  "system",
  "system idle process",
  "registry",
  "memory compression",
  "secure system",
  "csrss.exe",
  "wininit.exe",
  "winlogon.exe",
  "services.exe",
  "lsass.exe",
  "smss.exe",
  "svchost.exe",
]);

function normalizeImage(name: string): string {
  const raw = String(name || "").trim();
  if (!raw) return "";
  return /\.exe$/i.test(raw) ? raw : `${raw}.exe`;
}

export type KillResult = {
  ok: boolean;
  message: string;
};

/**
 * End a process group (Task Manager style).
 * Prefers PIDs; falls back to image name. Uses taskkill /T /F on Windows.
 */
export async function killProcessGroup(args: {
  imageName: string;
  pids?: number[];
}): Promise<KillResult> {
  const image = normalizeImage(args.imageName);
  if (!image) return { ok: false, message: "无效进程名" };
  if (BLOCKED.has(image.toLowerCase()) || BLOCKED.has(image.replace(/\.exe$/i, "").toLowerCase())) {
    return { ok: false, message: "系统进程不可结束" };
  }

  const pids = [...new Set((args.pids || []).filter((p) => Number.isFinite(p) && p > 0))];

  if (process.platform !== "win32") {
    return { ok: false, message: "当前仅支持 Windows 结束进程" };
  }

  try {
    if (pids.length) {
      const pidArgs = pids.flatMap((pid) => ["/PID", String(pid)]);
      const { stdout, stderr } = await execFileAsync("taskkill", ["/F", "/T", ...pidArgs], {
        windowsHide: true,
        timeout: 8000,
        encoding: "utf8",
      });
      const out = `${stdout || ""}\n${stderr || ""}`;
      if (/成功|SUCCESS/i.test(out) || !out.trim()) {
        return { ok: true, message: `已结束 ${image}` };
      }
      return { ok: true, message: `已结束 ${image}` };
    }

    await execFileAsync("taskkill", ["/F", "/T", "/IM", image], {
      windowsHide: true,
      timeout: 8000,
      encoding: "utf8",
    });
    return { ok: true, message: `已结束 ${image}` };
  } catch (err: unknown) {
    const anyErr = err as { message?: string; stdout?: string; stderr?: string };
    const detail = `${anyErr.stderr || ""}\n${anyErr.stdout || ""}\n${anyErr.message || ""}`;
    // Some PIDs already exited — still OK if at least one was killed
    if (/成功|SUCCESS/i.test(detail)) {
      return { ok: true, message: `已结束 ${image}` };
    }
    if (/not found|没有找到|没有运行|无法找到/i.test(detail)) {
      return { ok: true, message: "进程已不存在" };
    }
    if (/Access is denied|拒绝访问/i.test(detail)) {
      return { ok: false, message: "权限不足，无法结束" };
    }
    return { ok: false, message: (anyErr.message || "结束失败").slice(0, 160) };
  }
}
