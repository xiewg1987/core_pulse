"use server";

import { collectMetrics, listAllProcesses, mockAllowed } from "@/lib/metrics";
import { killProcessGroup } from "@/lib/windows-kill";
import type { MetricsPayload, ProcessListPayload } from "@/lib/types";

/**
 * Server Action: read hardware metrics on the machine running Next.js.
 * Never call systeminformation from the browser.
 */
export async function getSystemMetrics(): Promise<MetricsPayload> {
  const data = await collectMetrics();
  // Ensure JSON-serializable plain object for the client
  return JSON.parse(JSON.stringify(data)) as MetricsPayload;
}

/** Full process table for 全部进程 page. */
export async function getProcessList(): Promise<ProcessListPayload> {
  const data = await listAllProcesses();
  return JSON.parse(JSON.stringify(data)) as ProcessListPayload;
}

/** Dev-only: whether USE_MOCK=1 is active on the server. */
export async function isMetricsMockEnabled(): Promise<boolean> {
  return mockAllowed();
}

/** End processes for an app group (by PIDs / image name). */
export async function endProcessGroup(input: {
  imageName: string;
  pids?: number[];
}): Promise<{ ok: boolean; message: string }> {
  if (mockAllowed()) {
    return { ok: false, message: "模拟模式下无法结束进程" };
  }
  return killProcessGroup({
    imageName: input.imageName,
    pids: input.pids,
  });
}
