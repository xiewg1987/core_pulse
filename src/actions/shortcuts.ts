"use server";

import {
  addShortcut as addShortcutLib,
  launchShortcut as launchShortcutLib,
  listShortcuts as listShortcutsLib,
  removeShortcut as removeShortcutLib,
} from "@/lib/shortcuts";
import { mockAllowed } from "@/lib/metrics";
import type { QuickShortcut } from "@/lib/shortcut-types";

export type { QuickShortcut };

export async function listShortcuts(): Promise<QuickShortcut[]> {
  return listShortcutsLib();
}

export async function addShortcut(input: {
  label: string;
  target: string;
}): Promise<{ ok: boolean; message: string; item?: QuickShortcut }> {
  if (mockAllowed()) {
    return { ok: false, message: "模拟模式下无法添加快捷" };
  }
  return addShortcutLib(input);
}

export async function removeShortcut(id: string): Promise<{ ok: boolean; message: string }> {
  if (mockAllowed()) {
    return { ok: false, message: "模拟模式下无法移除快捷" };
  }
  return removeShortcutLib(id);
}

export async function launchShortcut(id: string): Promise<{ ok: boolean; message: string }> {
  if (mockAllowed()) {
    return { ok: false, message: "模拟模式下无法启动" };
  }
  return launchShortcutLib(id);
}
