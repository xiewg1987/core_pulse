"use client";

import { useEffect, useState } from "react";
import { LoadingScreen, type LoadingPhase } from "@/components/LoadingScreen";
import { MonitorDashboard } from "@/components/MonitorDashboard";
import { PageTransition } from "@/components/PageTransition";
import { ProcessesClient } from "@/components/ProcessesClient";
import { useSystemMetrics } from "@/hooks/useSystemMetrics";

const POLL_MS = 1500;
/** Keep the brand opening visible even when metrics return instantly. */
const MIN_LOADING_MS = 1800;
const READY_HOLD_MS = 750;

export function HomeClient() {
  const metrics = useSystemMetrics(POLL_MS);
  const [phase, setPhase] = useState<LoadingPhase | "monitor">("loading");
  const [bootAt] = useState(() => Date.now());

  useEffect(() => {
    if (!metrics.ready || phase !== "loading") return;

    const wait = Math.max(0, MIN_LOADING_MS - (Date.now() - bootAt));
    const toReady = window.setTimeout(() => {
      setPhase("ready");
    }, wait);
    return () => window.clearTimeout(toReady);
  }, [metrics.ready, phase, bootAt]);

  useEffect(() => {
    if (phase !== "ready") return;
    const toMonitor = window.setTimeout(() => {
      setPhase("monitor");
    }, READY_HOLD_MS);
    return () => window.clearTimeout(toMonitor);
  }, [phase]);

  if (phase !== "monitor") {
    return <LoadingScreen phase={phase} />;
  }

  return (
    <div className="monitor-enter">
      <PageTransition
        monitor={({ openProcesses }) => (
          <MonitorDashboard
            data={metrics.data}
            ready={metrics.ready}
            err={metrics.err}
            refresh={metrics.refresh}
            onOpenProcesses={openProcesses}
          />
        )}
        processes={({ backToMonitor }) => (
          <ProcessesClient onBack={backToMonitor} />
        )}
      />
    </div>
  );
}
