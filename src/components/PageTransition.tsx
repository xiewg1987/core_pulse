"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

const VIEW_MS = 480;
const VIEW_MS_REDUCED = 220;

export type PageView = "monitor" | "processes" | "apps";

function prefersReducedMotion() {
  return (
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

function motionMs() {
  return prefersReducedMotion() ? VIEW_MS_REDUCED : VIEW_MS;
}

type Overlay = "processes" | "apps";

type PageTransitionProps = {
  monitor: (api: {
    openProcesses: (originEl?: HTMLElement | null) => void;
    openAppPicker: (originEl?: HTMLElement | null) => void;
  }) => ReactNode;
  processes: (api: { backToMonitor: () => void }) => ReactNode;
  apps: (api: { backToMonitor: () => void }) => ReactNode;
};

/**
 * Stacked 100dvh layers: overlay expands from the origin control;
 * monitor recesses up-right.
 */
export function PageTransition({ monitor, processes, apps }: PageTransitionProps) {
  const stageRef = useRef<HTMLDivElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const timerRef = useRef<number | null>(null);

  const [view, setView] = useState<PageView>("monitor");
  const [overlay, setOverlay] = useState<Overlay | null>(null);
  const [overlayShown, setOverlayShown] = useState(false);
  const [monRecessed, setMonRecessed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [enterPending, setEnterPending] = useState(false);

  useEffect(() => {
    return () => {
      if (timerRef.current != null) window.clearTimeout(timerRef.current);
    };
  }, []);

  useEffect(() => {
    if (!enterPending || !overlay) return;
    const layer = overlayRef.current;
    if (!layer) return;

    const id = requestAnimationFrame(() => {
      void layer.getBoundingClientRect();
      setOverlayShown(true);
      setMonRecessed(true);
      setEnterPending(false);

      const ms = motionMs();
      if (timerRef.current != null) window.clearTimeout(timerRef.current);
      timerRef.current = window.setTimeout(() => {
        setView(overlay);
        setBusy(false);
        timerRef.current = null;
      }, ms);
    });
    return () => cancelAnimationFrame(id);
  }, [enterPending, overlay]);

  const setOriginFromEl = (el?: HTMLElement | null) => {
    const stage = stageRef.current;
    if (!stage) return;
    if (!el) {
      stage.style.setProperty("--view-ox", "50%");
      stage.style.setProperty("--view-oy", "70%");
      return;
    }
    const sr = stage.getBoundingClientRect();
    const br = el.getBoundingClientRect();
    const ox = ((br.left + br.width / 2 - sr.left) / Math.max(sr.width, 1)) * 100;
    const oy = ((br.top + br.height / 2 - sr.top) / Math.max(sr.height, 1)) * 100;
    stage.style.setProperty("--view-ox", `${ox.toFixed(2)}%`);
    stage.style.setProperty("--view-oy", `${oy.toFixed(2)}%`);
  };

  const openOverlay = (kind: Overlay, el?: HTMLElement | null) => {
    if (busy || view !== "monitor") return;
    setOriginFromEl(el);
    setBusy(true);
    setOverlayShown(false);
    setMonRecessed(false);
    setOverlay(kind);
    setEnterPending(true);
  };

  const backToMonitor = () => {
    if (busy || view === "monitor") return;
    const ms = motionMs();
    setBusy(true);
    setOverlayShown(false);
    setMonRecessed(false);
    if (timerRef.current != null) window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => {
      setView("monitor");
      setOverlay(null);
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

  const overlayClass = [
    "view-layer",
    "view-layer--overlay",
    overlayShown ? "is-shown" : "",
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
        {monitor({
          openProcesses: (el) => openOverlay("processes", el),
          openAppPicker: (el) => openOverlay("apps", el),
        })}
      </div>
      {overlay ? (
        <div
          ref={overlayRef}
          className={overlayClass}
          aria-hidden={!overlayShown || undefined}
        >
          {overlay === "processes"
            ? processes({ backToMonitor })
            : apps({ backToMonitor })}
        </div>
      ) : null}
    </div>
  );
}
