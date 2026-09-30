"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { pinyin } from "pinyin-pro";
import {
  checkManualAppPath,
  getInstalledApps,
  type AppSource,
  type InstalledApp,
} from "@/actions/apps";
import { addShortcuts, listShortcuts, type QuickShortcut } from "@/actions/shortcuts";
import { MAX_SHORTCUTS } from "@/lib/shortcut-types";

type Segment = "全部" | "最近使用" | "开始菜单" | "桌面";

const SEGMENTS: Segment[] = ["全部", "最近使用", "开始菜单", "桌面"];

const SEGMENT_SOURCE: Record<Exclude<Segment, "全部">, AppSource> = {
  最近使用: "recent",
  开始菜单: "start-menu",
  桌面: "desktop",
};

const LETTER_COLORS = ["#FF2BD6", "#A855FF", "#2EE6A6", "#FFB020"] as const;

function matchQuery(app: InstalledApp, q: string): boolean {
  if (!q) return true;
  const name = app.name.toLowerCase();
  if (name.includes(q)) return true;
  try {
    const initials = pinyin(app.name, { pattern: "first", toneType: "none", type: "array" })
      .join("")
      .toLowerCase()
      .replace(/\s+/g, "");
    if (initials.includes(q.replace(/\s+/g, ""))) return true;
  } catch {
    /* ignore */
  }
  return false;
}

function pathSummary(target: string): string {
  const parts = target.replace(/\//g, "\\").split("\\").filter(Boolean);
  if (parts.length <= 2) return target;
  return `…\\${parts.slice(-2).join("\\")}`;
}

function AppIcon({
  app,
  muted,
}: {
  app: InstalledApp;
  muted?: boolean;
}) {
  if (app.iconDataUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- dynamic base64 from local exe
      <img
        src={app.iconDataUrl}
        alt=""
        className={`app-tile-icon-img${muted ? " is-muted" : ""}`}
        draggable={false}
      />
    );
  }
  const ch = (app.name.trim()[0] || "?").toUpperCase();
  const color = LETTER_COLORS[Math.abs(app.name.charCodeAt(0)) % LETTER_COLORS.length];
  return (
    <span
      className={`app-tile-icon-letter${muted ? " is-muted" : ""}`}
      style={{ background: `${color}38`, color }}
    >
      {ch}
    </span>
  );
}

function AppTile({
  app,
  state,
  onToggle,
}: {
  app: InstalledApp;
  state: "default" | "selected" | "added" | "disabled";
  onToggle: () => void;
}) {
  const muted = state === "disabled" || state === "added";
  const sub =
    state === "added" ? "已添加" : app.sourceLabel || pathSummary(app.target);

  return (
    <button
      type="button"
      className={`app-tile app-tile--${state}`}
      disabled={state === "added" || state === "disabled"}
      onClick={onToggle}
      title={`${app.name}\n${app.target}`}
    >
      {state === "selected" ? <span className="app-tile-check" aria-hidden>✓</span> : null}
      <AppIcon app={app} muted={muted} />
      <span className="app-tile-name">{app.name}</span>
      <span className={`app-tile-source${state === "added" ? " is-added" : ""}`}>{sub}</span>
    </button>
  );
}

function SkeletonTile() {
  return (
    <div className="app-tile app-tile--skeleton" aria-hidden>
      <span className="app-skel-icon" />
      <span className="app-skel-name" />
      <span className="app-skel-source" />
    </div>
  );
}

export function AppPicker({
  onBack,
  onAdded,
  initialApps,
  initialShortcuts,
  appsReady = false,
}: {
  onBack: () => void;
  onAdded?: () => void;
  initialApps?: InstalledApp[];
  initialShortcuts?: QuickShortcut[];
  /** True once homepage prefetch finished (even if empty). */
  appsReady?: boolean;
}) {
  const seeded = Boolean(initialApps && appsReady);
  const [apps, setApps] = useState<InstalledApp[]>(() => initialApps ?? []);
  const [shortcuts, setShortcuts] = useState<QuickShortcut[]>(
    () => initialShortcuts ?? [],
  );
  const [loading, setLoading] = useState(!seeded);
  const [err, setErr] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [segment, setSegment] = useState<Segment>("全部");
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [manualOpen, setManualOpen] = useState(false);
  const [manualLabel, setManualLabel] = useState("");
  const [manualTarget, setManualTarget] = useState("");
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    if (initialApps) setApps(initialApps);
    if (initialShortcuts) setShortcuts(initialShortcuts);
    if (appsReady) setLoading(false);
  }, [initialApps, initialShortcuts, appsReady]);

  const load = (force = false) => {
    if (!apps.length) setLoading(true);
    setErr(null);
    startTransition(() => {
      void (async () => {
        try {
          const [payload, sc] = await Promise.all([
            getInstalledApps(force),
            listShortcuts(),
          ]);
          setApps(payload.apps);
          setShortcuts(sc);
        } catch (e) {
          setErr(e instanceof Error ? e.message : "扫描失败");
        } finally {
          setLoading(false);
        }
      })();
    });
  };

  useEffect(() => {
    if (seeded) return;
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount once if not prefetched
  }, [seeded]);

  const addedTargets = useMemo(() => {
    const s = new Set<string>();
    for (const sc of shortcuts) s.add(sc.target.toLowerCase());
    return s;
  }, [shortcuts]);

  const room = Math.max(0, MAX_SHORTCUTS - shortcuts.length);
  const full = room <= 0;
  const selectedCount = selected.size;
  const canConfirm = selectedCount > 0 && !full && !pending;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return apps.filter((app) => {
      if (segment !== "全部") {
        const want = SEGMENT_SOURCE[segment];
        if (app.source !== want) {
          // registry apps show under 全部 / 开始菜单-ish — keep under 全部 only
          return false;
        }
      }
      return matchQuery(app, q);
    });
  }, [apps, query, segment]);

  const flash = (text: string, ok: boolean) => {
    setMsg({ text, ok });
    window.setTimeout(() => setMsg(null), 2400);
  };

  const toggle = (app: InstalledApp) => {
    if (full) return;
    if (addedTargets.has(app.target.toLowerCase())) return;
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(app.id)) {
        next.delete(app.id);
        return next;
      }
      if (next.size >= room) return prev;
      next.add(app.id);
      return next;
    });
  };

  const confirmAdd = () => {
    if (!canConfirm) return;
    const picks = apps.filter((a) => selected.has(a.id));
    startTransition(() => {
      void (async () => {
        const res = await addShortcuts(
          picks.map((a) => ({ label: a.name, target: a.target })),
        );
        flash(res.message, res.ok);
        if (res.ok) {
          onAdded?.();
          onBack();
        }
      })();
    });
  };

  const submitManual = () => {
    startTransition(() => {
      void (async () => {
        const checked = await checkManualAppPath({
          label: manualLabel,
          target: manualTarget,
        });
        if (!checked.ok || !checked.label || !checked.target) {
          flash(checked.message, false);
          return;
        }
        const res = await addShortcuts([
          { label: checked.label, target: checked.target },
        ]);
        flash(res.message, res.ok);
        if (res.ok) {
          setManualOpen(false);
          setManualLabel("");
          setManualTarget("");
          onAdded?.();
          onBack();
        }
      })();
    });
  };

  const subtitle = full
    ? `已满 ${MAX_SHORTCUTS} 个`
    : loading
      ? "加载中…"
      : `已选 ${selectedCount} / ${MAX_SHORTCUTS}`;

  return (
    <div className="picker-shell">
      <div className="picker-frame">
        <header className="picker-topbar">
          <div className="picker-left">
            <button type="button" className="picker-back" onClick={onBack}>
              ← 本机监控
            </button>
            <div className="picker-titles">
              <h1 className="picker-title">添加快捷</h1>
              <p className="picker-sub">{subtitle}</p>
            </div>
          </div>
          <div className="picker-actions">
            {msg ? (
              <span className={`picker-msg ${msg.ok ? "is-ok" : "is-err"}`}>{msg.text}</span>
            ) : null}
            {err ? <span className="picker-msg is-err">{err}</span> : null}
            <button type="button" className="picker-btn-ghost" onClick={onBack}>
              取消
            </button>
            <button
              type="button"
              className={`picker-btn-primary${canConfirm ? "" : " is-disabled"}`}
              disabled={!canConfirm}
              onClick={confirmAdd}
            >
              {pending ? "…" : `添加 ${selectedCount} 项`}
            </button>
          </div>
        </header>

        <div className="picker-toolbar">
          <label className="picker-search">
            <span className="sr-only">搜索</span>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="搜索已装软件…"
              autoComplete="off"
            />
          </label>
          <div className="picker-segments" role="tablist" aria-label="来源">
            {SEGMENTS.map((s) => (
              <button
                key={s}
                type="button"
                role="tab"
                aria-selected={segment === s}
                className={`picker-seg${segment === s ? " is-active" : ""}`}
                onClick={() => setSegment(s)}
              >
                {s}
              </button>
            ))}
          </div>
        </div>

        <section className="picker-panel">
          <div className="picker-grid">
            {loading ? (
              Array.from({ length: 14 }, (_, i) => <SkeletonTile key={i} />)
            ) : filtered.length === 0 ? (
              <div className="picker-empty">没有找到匹配的软件</div>
            ) : (
              filtered.map((app) => {
                const isAdded = addedTargets.has(app.target.toLowerCase());
                let state: "default" | "selected" | "added" | "disabled" = "default";
                if (isAdded) state = "added";
                else if (full) state = "disabled";
                else if (selected.has(app.id)) state = "selected";
                return (
                  <AppTile
                    key={app.id}
                    app={app}
                    state={state}
                    onToggle={() => toggle(app)}
                  />
                );
              })
            )}
          </div>
        </section>

        <div className="picker-manual-bar">
          <button
            type="button"
            className="picker-manual-link"
            onClick={() => setManualOpen(true)}
            disabled={full || pending}
          >
            找不到？手动添加路径
          </button>
        </div>
      </div>

      {manualOpen ? (
        <div className="picker-modal" role="dialog" aria-modal="true" aria-label="手动添加路径">
          <div className="picker-sheet">
            <h3 className="picker-sheet-title">手动添加路径</h3>
            <label className="picker-field">
              <span className="sr-only">名称</span>
              <input
                value={manualLabel}
                onChange={(e) => setManualLabel(e.target.value)}
                placeholder="名称"
                maxLength={24}
                autoFocus
              />
            </label>
            <label className="picker-field">
              <span className="sr-only">路径</span>
              <input
                value={manualTarget}
                onChange={(e) => setManualTarget(e.target.value)}
                placeholder="C:\…\app.exe 或 .lnk"
              />
            </label>
            <div className="picker-sheet-actions">
              <button
                type="button"
                className="picker-btn-ghost"
                onClick={() => setManualOpen(false)}
              >
                取消
              </button>
              <button
                type="button"
                className="picker-btn-primary"
                disabled={pending || !manualLabel.trim() || !manualTarget.trim()}
                onClick={submitManual}
              >
                {pending ? "…" : "确认添加"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
