"use client";

import { useEffect, useState } from "react";

const HINTS = ["读取系统指标", "校准仪表", "即将就绪"] as const;
const STEPS = ["连接", "采集", "就绪"] as const;

export type LoadingPhase = "loading" | "ready";

export function LoadingScreen({ phase }: { phase: LoadingPhase }) {
  const ready = phase === "ready";
  const [hintIndex, setHintIndex] = useState(0);
  const [progress, setProgress] = useState(0.18);

  useEffect(() => {
    if (ready) {
      setHintIndex(2);
      setProgress(1);
      return;
    }
    const hintId = window.setInterval(() => {
      setHintIndex((i) => (i + 1) % HINTS.length);
    }, 1400);
    const progId = window.setInterval(() => {
      setProgress((p) => Math.min(0.72, p + 0.035 + Math.random() * 0.03));
    }, 420);
    return () => {
      window.clearInterval(hintId);
      window.clearInterval(progId);
    };
  }, [ready]);

  const stepIndex = ready ? 2 : progress < 0.38 ? 0 : 1;
  const outerPct = ready ? 1 : 0.42 + progress * 0.38;
  const innerPct = ready ? 1 : 0.28 + progress * 0.42;

  return (
    <div className="loading-shell" aria-busy={!ready} aria-live="polite">
      <div className="loading-breath" aria-hidden />

      <div className="loading-stage">
        <div className={`loading-orb ${ready ? "is-ready" : ""}`}>
          <div className="loading-corners" aria-hidden>
            <span />
            <span />
            <span />
            <span />
          </div>
          <div className="loading-glass" />
          <svg className="loading-rings" viewBox="0 0 280 280" aria-hidden>
            <circle
              cx="140"
              cy="140"
              r="126"
              fill="none"
              stroke="rgba(255,255,255,0.08)"
              strokeWidth="10"
            />
            <circle
              className="loading-ring loading-ring--outer"
              cx="140"
              cy="140"
              r="126"
              fill="none"
              stroke="url(#loading-outer)"
              strokeWidth="10"
              strokeLinecap="round"
              strokeDasharray={`${2 * Math.PI * 126 * outerPct} ${2 * Math.PI * 126}`}
              transform="rotate(-90 140 140)"
            />
            <circle
              cx="140"
              cy="140"
              r="90"
              fill="none"
              stroke="rgba(168,85,255,0.16)"
              strokeWidth="8"
            />
            <circle
              className="loading-ring loading-ring--inner"
              cx="140"
              cy="140"
              r="90"
              fill="none"
              stroke="url(#loading-inner)"
              strokeWidth="8"
              strokeLinecap="round"
              strokeDasharray={`${2 * Math.PI * 90 * innerPct} ${2 * Math.PI * 90}`}
              transform="rotate(180 140 140)"
            />
            <defs>
              <linearGradient id="loading-outer" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#FF2BD6" />
                <stop offset="100%" stopColor="#A855FF" />
              </linearGradient>
              <linearGradient id="loading-inner" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="#A855FF" />
                <stop offset="100%" stopColor="#FF2BD6" />
              </linearGradient>
            </defs>
          </svg>
          <div className="loading-mark">
            <span className="loading-mark-ring">
              <span className="loading-mark-core" />
            </span>
            <span className="loading-brand">本机监控</span>
          </div>
        </div>

        <h1 className="loading-title">{ready ? "就绪" : "正在连接本机…"}</h1>

        <p className="loading-hints">
          {HINTS.map((hint, i) => (
            <span key={hint} className="inline-flex items-center">
              {i > 0 ? <span className="loading-hint-sep">·</span> : null}
              <span
                className={
                  (ready ? i === 2 : i === hintIndex)
                    ? "loading-hint is-active"
                    : "loading-hint"
                }
              >
                {hint}
              </span>
            </span>
          ))}
        </p>

        <div className="loading-status glass">
          <div className="loading-track">
            <div
              className="loading-fill"
              style={{ width: `${Math.round(progress * 100)}%` }}
            />
          </div>
          <div className="loading-steps">
            {STEPS.map((label, i) => {
              const active = i === stepIndex;
              const done = i < stepIndex || ready;
              return (
                <div
                  key={label}
                  className={
                    active || done
                      ? "loading-step is-on"
                      : "loading-step"
                  }
                >
                  <span className="loading-step-dot" />
                  <span>{label}</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
