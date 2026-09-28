"use server";

import { collectMetrics, mockAllowed } from "@/lib/metrics";
import type { MetricsPayload } from "@/lib/types";

/**
 * Server Action: read hardware metrics on the machine running Next.js.
 * Never call systeminformation from the browser.
 */
export async function getSystemMetrics(): Promise<MetricsPayload> {
  const data = await collectMetrics();
  // Ensure JSON-serializable plain object for the client
  return JSON.parse(JSON.stringify(data)) as MetricsPayload;
}

/** Dev-only: whether USE_MOCK=1 is active on the server. */
export async function isMetricsMockEnabled(): Promise<boolean> {
  return mockAllowed();
}
