"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

const VIEW_MS = 480;
const VIEW_MS_REDUCED = 220;

export type PageView = "monitor" | "processes";

function prefersReducedMotion() {
  return (
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

function motionMs() {
  return prefersReducedMotion() ? VIEW_MS_REDUCED : VIEW_MS;
}

type PageTransitionProps = {
  monitor: (api: { openProcesses: (originEl?: HTMLElement | null) => void }) => ReactNode;
  processes: (api: { backToMonitor: () => void }) => ReactNode;
};

/**
 * Stacked 100dvh layers: processes expands from the「全部进程」button;
 * monitor recesses up-right. CSS transitions stay enabled (gated class was
 * causing same-frame jumps with no visible motion).
 */
export function PageTransition({ monitor, processes }: PageTransitionProps) {
  const stageRef = useRef<HTMLDivElement>(null);
  const procLayerRef = useRef<HTMLDivElement>(null);
  const timerRef = useRef<number | null>(null);

  const [view, setView] = useState<PageView>("monitor");
  const [mountProcesses, setMountProcesses] = useState(false);
  const [procShown, setProcShown] = useState(false);
  const [monRecessed, setMonRecessed] = useState(false);
  const [busy, setBusy] = useState(false);
  /** After processes layer mounts at prep transform, flip to shown on next layout. */
  const [enterPending, setEnterPending] = useState(false);

  useEffect(() => {
    return () => {
      if (timerRef.current != null) window.clearTimeout(timerRef.current);
    };
  }, []);

  useEffect(() => {
    if (!enterPending || !mountProcesses) return;
    const layer = procLayerRef.current;
    if (!layer) return;

    // Paint prep (scale 0.35 / opacity 0) first, then transition to full.
    const id = requestAnimationFrame(() => {
      void layer.getBoundingClientRect();
      setProcShown(true);
      setMonRecessed(true);
      setEnterPending(false);

      const ms = motionMs();
      if (timerRef.current != null) window.clearTimeout(timerRef.current);
      timerRef.current = window.setTimeout(() => {
        setView("processes");
        setBusy(false);
        timerRef.current = null;
      }, ms);
    });
    return () => cancelAnimationFrame(id);
  }, [enterPending, mountProcesses]);

  const setOriginFromEl = (el?: HTMLElement | null) => {
    const stage = stageRef.current;
    if (!stage) return;
    if (!el) {
      stage.style.setProperty("--view-ox", "16%");
      stage.style.setProperty("--view-oy", "52%");
      return;
    }
    const sr = stage.getBoundingClientRect();
    const br = el.getBoundingClientRect();
    const ox = ((br.left + br.width / 2 - sr.left) / Math.max(sr.width, 1)) * 100;
    const oy = ((br.top + br.height / 2 - sr.top) / Math.max(sr.height, 1)) * 100;
    stage.style.setProperty("--view-ox", `${ox.toFixed(2)}%`);
    stage.style.setProperty("--view-oy", `${oy.toFixed(2)}%`);
  };

  const openProcesses = (el?: HTMLElement | null) => {
    if (busy || view === "processes") return;
    setOriginFromEl(el);
    setBusy(true);
    setProcShown(false);
    setMonRecessed(false);
    setMountProcesses(true);
    setEnterPending(true);
  };

  const backToMonitor = () => {
    if (busy || view === "monitor") return;
    const ms = motionMs();
    setBusy(true);
    setProcShown(false);
    setMonRecessed(false);
    if (timerRef.current != null) window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => {
      setView("monitor");
      setMountProcesses(false);
      setBusy(false);
      timerRef.current = null;
    }, ms);
  };

  const monitorClass = [
    "view-layer",
    "view-layer--monitor",
    monRecessed ? "is-recessed" : "",
  ]
    .filter(Boolean)
    .join(" ");

  const processesClass = [
    "view-layer",
    "view-layer--processes",
    procShown ? "is-shown" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div
      ref={stageRef}
      className={`view-stage${busy ? " is-busy" : ""}`}
      aria-busy={busy || undefined}
    >
      <div className={monitorClass} aria-hidden={monRecessed || undefined}>
        {monitor({ openProcesses })}
      </div>
      {mountProcesses ? (
        <div
          ref={procLayerRef}
          className={processesClass}
          aria-hidden={!procShown || undefined}
        >
          {processes({ backToMonitor })}
        </div>
      ) : null}
    </div>
  );
}
