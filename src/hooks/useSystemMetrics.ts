"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getSystemMetrics } from "@/actions/metrics";
import { emptyMetrics } from "@/lib/empty";
import type { MetricsPayload } from "@/lib/types";

const DEFAULT_POLL_MS = 1500;

export function useSystemMetrics(pollMs = DEFAULT_POLL_MS) {
  const [data, setData] = useState<MetricsPayload>(() => emptyMetrics());
  const [ready, setReady] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const inflightRef = useRef(false);

  const refresh = useCallback(async () => {
    if (inflightRef.current) return;
    inflightRef.current = true;
    try {
      const next = await getSystemMetrics();
      setData(next);
      setReady(true);
      setErr(null);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "采集失败");
    } finally {
      inflightRef.current = false;
    }
  }, []);

  useEffect(() => {
    void refresh();
    const id = window.setInterval(() => void refresh(), pollMs);
    return () => window.clearInterval(id);
  }, [refresh, pollMs]);

  return { data, ready, err, refresh };
}
