"use client";

import { useEffect, useState, useTransition } from "react";
import { Glass } from "@/components/ui";
import {
  addShortcut,
  launchShortcut,
  listShortcuts,
  removeShortcut,
  type QuickShortcut,
} from "@/actions/shortcuts";
import { MAX_SHORTCUTS } from "@/lib/shortcut-types";

function QuickAddTile({ onClick, disabled }: { onClick: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      className="quick-add"
      onClick={onClick}
      disabled={disabled}
      aria-label="添加快捷"
    >
      <span className="quick-add-plus">+</span>
      <span className="quick-add-caption">添加快捷</span>
    </button>
  );
}

function QuickItemTile({
  item,
  busy,
  onLaunch,
  onRemove,
}: {
  item: QuickShortcut;
  busy: boolean;
  onLaunch: () => void;
  onRemove: () => void;
}) {
  return (
    <button
      type="button"
      className="quick-item"
      disabled={busy}
      title={`${item.label}\n${item.target}\n右键移除`}
      onClick={onLaunch}
      onContextMenu={(e) => {
        e.preventDefault();
        onRemove();
      }}
    >
      <span className="quick-item-icon" style={{ background: item.color }} />
      <span className="quick-item-label truncate max-w-full">{item.label}</span>
    </button>
  );
}

export function QuickLaunchCard() {
  const [items, setItems] = useState<QuickShortcut[]>([]);
  const [open, setOpen] = useState(false);
  const [label, setLabel] = useState("");
  const [target, setTarget] = useState("");
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const [pending, startTransition] = useTransition();

  const refresh = () => {
    startTransition(() => {
      void (async () => {
        try {
          const next = await listShortcuts();
          setItems(next);
        } catch (e) {
          setMsg({
            text: e instanceof Error ? e.message : "读取快捷失败",
            ok: false,
          });
        }
      })();
    });
  };

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount once
  }, []);

  const flash = (text: string, ok: boolean) => {
    setMsg({ text, ok });
    window.setTimeout(() => setMsg(null), 2400);
  };

  const submitAdd = () => {
    startTransition(() => {
      void (async () => {
        const res = await addShortcut({ label, target });
        flash(res.message, res.ok);
        if (res.ok) {
          setOpen(false);
          setLabel("");
          setTarget("");
          refresh();
        }
      })();
    });
  };

  const canAdd = items.length < MAX_SHORTCUTS;

  return (
    <Glass className="card-pad flex min-h-0 min-w-0 flex-col overflow-hidden">
      <div className="mb-[clamp(0.3rem,0.8vh,0.5rem)] flex shrink-0 items-center justify-between gap-2 overflow-hidden">
        <h2 className="truncate text-[#5C4A6E]" style={{ fontSize: "var(--fs-sm)" }}>
          快捷启动
        </h2>
        {msg ? (
          <span
            className={`shrink-0 truncate ${msg.ok ? "text-[#2EE6A6]" : "text-[#FF4D6D]"}`}
            style={{ fontSize: "var(--fs-xs)" }}
          >
            {msg.text}
          </span>
        ) : null}
      </div>

      <div className="quick-launch-grid">
        {items.map((item) => (
          <QuickItemTile
            key={item.id}
            item={item}
            busy={pending}
            onLaunch={() => {
              startTransition(() => {
                void (async () => {
                  const res = await launchShortcut(item.id);
                  flash(res.message, res.ok);
                })();
              });
            }}
            onRemove={() => {
              if (!window.confirm(`移除快捷「${item.label}」？`)) return;
              startTransition(() => {
                void (async () => {
                  const res = await removeShortcut(item.id);
                  flash(res.message, res.ok);
                  if (res.ok) refresh();
                })();
              });
            }}
          />
        ))}
        {canAdd ? <QuickAddTile onClick={() => setOpen(true)} disabled={pending} /> : null}
      </div>

      {open ? (
        <div className="quick-add-modal" role="dialog" aria-modal="true" aria-label="添加快捷">
          <div className="quick-add-sheet">
            <h3 className="quick-add-title">添加快捷</h3>
            <p className="quick-add-hint">路径相对于被监控的 Windows 本机（可用绝对路径或网址）</p>
            <label className="quick-add-field">
              <span>名称</span>
              <input
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder="例如 终端"
                maxLength={24}
                autoFocus
              />
            </label>
            <label className="quick-add-field">
              <span>目标</span>
              <input
                value={target}
                onChange={(e) => setTarget(e.target.value)}
                placeholder="C:\…\app.exe 或 https://…"
              />
            </label>
            <div className="quick-add-actions">
              <button type="button" className="quick-add-cancel" onClick={() => setOpen(false)}>
                取消
              </button>
              <button
                type="button"
                className="quick-add-submit"
                disabled={pending || !label.trim() || !target.trim()}
                onClick={submitAdd}
              >
                {pending ? "…" : "添加"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </Glass>
  );
}
