"use client";

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import { endProcessGroup, getProcessList } from "@/actions/metrics";
import { Glass } from "@/components/ui";
import type { ProcessKind, ProcessListItem, ProcessListPayload } from "@/lib/types";

type SortKey = "cpu" | "mem" | "name";
type FilterKey = "全部" | "应用" | "后台";

function IconBtn({
  children,
  title,
  onClick,
}: {
  children: React.ReactNode;
  title: string;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className="flex shrink-0 items-center justify-center rounded-none border border-white/15 bg-white/5 text-white/70 transition hover:border-pink/40 hover:text-pink"
      style={{
        width: "clamp(1.6rem, 3.2vh, 2.1rem)",
        height: "clamp(1.6rem, 3.2vh, 2.1rem)",
      }}
    >
      {children}
    </button>
  );
}

function formatMem(mb: number): string {
  if (mb >= 100) return `${Math.round(mb)} MB`;
  if (mb >= 10) return `${mb.toFixed(0)} MB`;
  return `${mb.toFixed(1)} MB`;
}

function cpuClass(pct: number): string {
  return pct >= 10 ? "text-[#FF2BD6]" : "text-[#80738C]";
}

function memClass(mb: number): string {
  return mb >= 700 ? "text-[#FFB020]" : "text-[#80738C]";
}

export function ProcessesClient({ onBack }: { onBack?: () => void }) {
  const [data, setData] = useState<ProcessListPayload | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SortKey>("cpu");
  const [filter, setFilter] = useState<FilterKey>("全部");
  const [killingPid, setKillingPid] = useState<number | null>(null);
  const [killMsg, setKillMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const [pending, startTransition] = useTransition();

  const load = useCallback(() => {
    startTransition(() => {
      void (async () => {
        try {
          const next = await getProcessList();
          setData(next);
          setErr(null);
        } catch (e) {
          setErr(e instanceof Error ? e.message : "采集失败");
        }
      })();
    });
  }, []);

  useEffect(() => {
    load();
    const id = window.setInterval(load, 2500);
    return () => window.clearInterval(id);
  }, [load]);

  const rows = useMemo(() => {
    const list = data?.processes ?? [];
    const q = query.trim().toLowerCase();
    let next = list.filter((p) => {
      if (filter !== "全部" && p.kind !== (filter as ProcessKind)) return false;
      if (!q) return true;
      return (
        p.name.toLowerCase().includes(q) ||
        p.imageName.toLowerCase().includes(q) ||
        String(p.pid).includes(q)
      );
    });
    next = [...next].sort((a, b) => {
      if (sort === "cpu") return b.cpuPercent - a.cpuPercent;
      if (sort === "mem") return b.usedMb - a.usedMb;
      return a.name.localeCompare(b.name, "zh");
    });
    return next.slice(0, 15);
  }, [data, query, sort, filter]);

  const handleKill = (row: ProcessListItem) => {
    if (
      !window.confirm(
        `确认结束进程「${row.imageName}」(PID ${row.pid}${row.pids.length > 1 ? ` 等 ${row.pids.length} 个` : ""})？`,
      )
    ) {
      return;
    }
    setKillingPid(row.pid);
    setKillMsg(null);
    startTransition(() => {
      void (async () => {
        try {
          const res = await endProcessGroup({
            imageName: row.imageName,
            pids: row.pids,
          });
          setKillMsg({ text: res.message, ok: res.ok });
          if (res.ok) window.setTimeout(() => setKillMsg(null), 2500);
          load();
        } catch (e) {
          setKillMsg({
            text: e instanceof Error ? e.message : "结束失败",
            ok: false,
          });
        } finally {
          setKillingPid(null);
        }
      })();
    });
  };

  const clock = data?.clock ?? "—:—:—";
  const total = data?.processes.length ?? 0;

  return (
    <div className="monitor-shell">
      <div className="monitor-frame processes-frame">
        <header className="processes-topbar">
          <div className="processes-left">
            <button type="button" className="processes-back" onClick={onBack}>
              ← 本机监控
            </button>
            <div className="min-w-0 overflow-hidden">
              <h1
                className="truncate font-semibold tracking-wide text-[#F8F0FF]"
                style={{ fontSize: "var(--fs-lg)" }}
              >
                全部进程
              </h1>
              <p className="truncate text-[#5C4A6E]" style={{ fontSize: "var(--fs-sm)" }}>
                前 {rows.length} / {total} 个进程
                {data?.mock ? " · MOCK" : ""}
                {pending && !data ? " · 采集中…" : ""}
                {err ? ` · ${err}` : ""}
                {killMsg ? (
                  <span className={killMsg.ok ? " text-[#2EE6A6]" : " text-[#FF4D6D]"}>
                    {" "}
                    · {killMsg.text}
                  </span>
                ) : null}
              </p>
            </div>
          </div>

          <div className="glow-pink clock-num font-mono text-pink">{clock}</div>

          <div className="processes-actions">
            <IconBtn title="刷新" onClick={load}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 12a9 9 0 1 1-2.64-6.36" />
                <polyline points="21 3 21 9 15 9" />
              </svg>
            </IconBtn>
          </div>
        </header>

        <div className="processes-toolbar">
          <input
            type="search"
            className="processes-search"
            placeholder="搜索进程名…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="搜索进程名"
          />
          <div className="processes-seg">
            {(
              [
                ["cpu", "CPU"],
                ["mem", "内存"],
                ["name", "名称"],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                className={`processes-pill ${sort === key ? "processes-pill--active" : ""}`}
                onClick={() => setSort(key)}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="processes-seg processes-seg--filter">
            {(["全部", "应用", "后台"] as const).map((key) => (
              <button
                key={key}
                type="button"
                className={`processes-filter ${filter === key ? "processes-filter--active" : ""}`}
                onClick={() => setFilter(key)}
              >
                {key}
              </button>
            ))}
          </div>
        </div>

        <Glass className="corner-brackets processes-card flex min-h-0 min-w-0 flex-col overflow-hidden">
          <div className="processes-thead">
            <span className="processes-col-name">进程名</span>
            <span className="processes-col-pid">PID</span>
            <span className="processes-col-cpu">CPU%</span>
            <span className="processes-col-mem">内存</span>
            <span className="processes-col-act">操作</span>
          </div>
          <div className="processes-list">
            {rows.length === 0 ? (
              <p className="px-2 py-6 text-center text-[#5C4A6E]" style={{ fontSize: "var(--fs-sm)" }}>
                {data ? "无匹配进程" : "正在读取进程…"}
              </p>
            ) : (
              rows.map((row) => {
                const killing = killingPid === row.pid;
                return (
                  <div key={`${row.imageName}-${row.pid}`} className="processes-row">
                    <div className="processes-col-name processes-name">
                      <span className="truncate text-[#F2E5F5]">{row.imageName}</span>
                      <span className="processes-kind">{row.kind}</span>
                    </div>
                    <span className="processes-col-pid font-mono text-[#80738C]">{row.pid}</span>
                    <span className={`processes-col-cpu font-mono ${cpuClass(row.cpuPercent)}`}>
                      {row.cpuPercent.toFixed(1)}%
                    </span>
                    <span className={`processes-col-mem font-mono ${memClass(row.usedMb)}`}>
                      {formatMem(row.usedMb)}
                    </span>
                    <span className="processes-col-act">
                      <button
                        type="button"
                        className="processes-kill"
                        disabled={killing || row.kind === "系统"}
                        onClick={() => handleKill(row)}
                      >
                        {killing ? "…" : "结束"}
                      </button>
                    </span>
                  </div>
                );
              })
            )}
          </div>
          <p className="processes-hint">仅显示当前排序前 15 项</p>
        </Glass>

        <footer className="processes-status">已选 0 · 结束需确认</footer>
      </div>
    </div>
  );
}
