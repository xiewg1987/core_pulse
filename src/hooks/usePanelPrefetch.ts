"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getProcessList } from "@/actions/metrics";
import { getInstalledApps } from "@/actions/apps";
import { listShortcuts, type QuickShortcut } from "@/actions/shortcuts";
import type { InstalledApp } from "@/lib/installed-apps-types";
import type { ProcessListPayload } from "@/lib/types";

export type PrefetchedPanels = {
  processes: ProcessListPayload | null;
  apps: InstalledApp[];
  shortcuts: QuickShortcut[];
  appsReady: boolean;
  processesReady: boolean;
  refreshProcesses: () => Promise<void>;
  refreshApps: (force?: boolean) => Promise<void>;
  refreshShortcuts: () => Promise<void>;
};

/**
 * Prefetch 全部进程 + 已装软件 while the loading gate is still on screen,
 * so opening either overlay never starts from an empty shell.
 */
export function usePanelPrefetch(): PrefetchedPanels {
  const [processes, setProcesses] = useState<ProcessListPayload | null>(null);
  const [apps, setApps] = useState<InstalledApp[]>([]);
  const [shortcuts, setShortcuts] = useState<QuickShortcut[]>([]);
  const [appsReady, setAppsReady] = useState(false);
  const [processesReady, setProcessesReady] = useState(false);
  const started = useRef(false);

  const refreshProcesses = useCallback(async () => {
    try {
      const next = await getProcessList();
      setProcesses(next);
      setProcessesReady(true);
    } catch {
      /* keep last good */
    }
  }, []);

  const refreshApps = useCallback(async (force = false) => {
    try {
      const [payload, sc] = await Promise.all([
        getInstalledApps(force),
        listShortcuts(),
      ]);
      setApps(payload.apps);
      setShortcuts(sc);
      setAppsReady(true);
    } catch {
      /* keep last good */
    }
  }, []);

  const refreshShortcuts = useCallback(async () => {
    try {
      const sc = await listShortcuts();
      setShortcuts(sc);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void Promise.all([refreshProcesses(), refreshApps(false)]);
  }, [refreshProcesses, refreshApps]);

  return {
    processes,
    apps,
    shortcuts,
    appsReady,
    processesReady,
    refreshProcesses,
    refreshApps,
    refreshShortcuts,
  };
}
