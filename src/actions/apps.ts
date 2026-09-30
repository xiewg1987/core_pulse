"use server";

import {
  listInstalledApps,
  validateManualPath,
} from "@/lib/installed-apps";
import type { InstalledAppsPayload } from "@/lib/installed-apps-types";
import { mockAllowed } from "@/lib/metrics";

export type { InstalledAppsPayload };
export type { InstalledApp, AppSource } from "@/lib/installed-apps-types";

export async function getInstalledApps(force = false): Promise<InstalledAppsPayload> {
  return listInstalledApps({ force });
}

export async function checkManualAppPath(input: {
  label: string;
  target: string;
}): Promise<{ ok: boolean; message: string; label?: string; target?: string }> {
  if (mockAllowed()) {
    const label = input.label.trim().slice(0, 24);
    const target = input.target.trim();
    if (!label || !target) return { ok: false, message: "请填写名称与路径" };
    return { ok: true, message: "可用（模拟）", label, target };
  }
  return validateManualPath(input);
}
