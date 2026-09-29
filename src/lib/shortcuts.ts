import { randomUUID } from "crypto";
import { promises as fs } from "fs";
import path from "path";
import { execFile } from "child_process";
import { promisify } from "util";
import {
  MAX_SHORTCUTS,
  type QuickShortcut,
} from "@/lib/shortcut-types";

export type { QuickShortcut };
export { MAX_SHORTCUTS };

const execFileAsync = promisify(execFile);

const ACCENTS = [
  "rgba(255,43,214,0.35)",
  "rgba(168,85,255,0.35)",
  "rgba(46,230,166,0.35)",
  "rgba(255,176,32,0.35)",
] as const;

function storePath() {
  return path.join(process.cwd(), "data", "shortcuts.json");
}

async function ensureStore(): Promise<QuickShortcut[]> {
  const file = storePath();
  try {
    const raw = await fs.readFile(file, "utf8");
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (row): row is QuickShortcut =>
        Boolean(
          row &&
            typeof row === "object" &&
            typeof (row as QuickShortcut).id === "string" &&
            typeof (row as QuickShortcut).label === "string" &&
            typeof (row as QuickShortcut).target === "string",
        ),
    );
  } catch (e) {
    const err = e as NodeJS.ErrnoException;
    if (err.code === "ENOENT") return [];
    throw e;
  }
}

async function writeStore(rows: QuickShortcut[]) {
  const file = storePath();
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, JSON.stringify(rows, null, 2), "utf8");
}

export async function listShortcuts(): Promise<QuickShortcut[]> {
  return ensureStore();
}

function sanitizeLabel(label: string): string {
  return label.replace(/\s+/g, " ").trim().slice(0, 24);
}

function sanitizeTarget(target: string): string | null {
  const t = target.trim();
  if (!t || t.length > 512) return null;
  if (/[\r\n\0]/.test(t)) return null;
  if (/^https?:\/\//i.test(t)) return t;
  // Absolute Windows path or UNC
  if (/^[a-zA-Z]:[\\/]/.test(t) || t.startsWith("\\\\")) return t;
  return null;
}

export async function addShortcut(input: {
  label: string;
  target: string;
}): Promise<{ ok: boolean; message: string; item?: QuickShortcut }> {
  const label = sanitizeLabel(input.label);
  const target = sanitizeTarget(input.target);
  if (!label) return { ok: false, message: "请填写名称" };
  if (!target) return { ok: false, message: "路径需为绝对路径或 http(s) 链接" };

  const rows = await ensureStore();
  if (rows.length >= MAX_SHORTCUTS) {
    return { ok: false, message: `最多 ${MAX_SHORTCUTS} 个快捷` };
  }
  if (rows.some((r) => r.target.toLowerCase() === target.toLowerCase())) {
    return { ok: false, message: "该目标已存在" };
  }

  const item: QuickShortcut = {
    id: randomUUID(),
    label,
    target,
    color: ACCENTS[rows.length % ACCENTS.length],
  };
  rows.push(item);
  await writeStore(rows);
  return { ok: true, message: "已添加", item };
}

export async function removeShortcut(id: string): Promise<{ ok: boolean; message: string }> {
  const rows = await ensureStore();
  const next = rows.filter((r) => r.id !== id);
  if (next.length === rows.length) return { ok: false, message: "未找到该项" };
  await writeStore(next);
  return { ok: true, message: "已移除" };
}

export async function launchShortcut(id: string): Promise<{ ok: boolean; message: string }> {
  const rows = await ensureStore();
  const item = rows.find((r) => r.id === id);
  if (!item) return { ok: false, message: "未找到该项" };

  try {
    // Detached start so the Next process is not tied to the launched app.
    await execFileAsync("cmd.exe", ["/c", "start", "", item.target], {
      windowsHide: true,
      timeout: 8000,
    });
    return { ok: true, message: `已启动 ${item.label}` };
  } catch (e) {
    return {
      ok: false,
      message: e instanceof Error ? e.message : "启动失败",
    };
  }
}
