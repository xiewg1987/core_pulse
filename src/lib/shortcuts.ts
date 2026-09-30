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
  const res = await addShortcuts([{ label: input.label, target: input.target }]);
  return {
    ok: res.ok,
    message: res.message,
    item: res.items?.[0],
  };
}

export async function addShortcuts(
  inputs: { label: string; target: string }[],
): Promise<{ ok: boolean; message: string; items?: QuickShortcut[]; added: number }> {
  if (!inputs.length) return { ok: false, message: "未选择软件", added: 0 };

  const rows = await ensureStore();
  const room = MAX_SHORTCUTS - rows.length;
  if (room <= 0) {
    return { ok: false, message: `已满 ${MAX_SHORTCUTS} 个`, added: 0 };
  }

  const existing = new Set(rows.map((r) => r.target.toLowerCase()));
  const added: QuickShortcut[] = [];

  for (const input of inputs) {
    if (added.length >= room) break;
    const label = sanitizeLabel(input.label);
    const target = sanitizeTarget(input.target);
    if (!label || !target) continue;
    if (existing.has(target.toLowerCase())) continue;
    const item: QuickShortcut = {
      id: randomUUID(),
      label,
      target,
      color: ACCENTS[(rows.length + added.length) % ACCENTS.length],
    };
    added.push(item);
    existing.add(target.toLowerCase());
  }

  if (!added.length) {
    return { ok: false, message: "没有可添加的项（可能已存在）", added: 0 };
  }

  rows.push(...added);
  await writeStore(rows);
  return {
    ok: true,
    message: `已添加 ${added.length} 项`,
    items: added,
    added: added.length,
  };
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
