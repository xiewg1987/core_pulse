"use client";

import { useEffect, useState, useTransition } from "react";
import { Glass } from "@/components/ui";
import {
  launchShortcut,
  listShortcuts,
  removeShortcut,
  type QuickShortcut,
} from "@/actions/shortcuts";
import { MAX_SHORTCUTS } from "@/lib/shortcut-types";

function QuickAddTile({
  onClick,
  disabled,
}: {
  onClick: (el: HTMLElement) => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      className="quick-add"
      onClick={(e) => onClick(e.currentTarget)}
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

export function QuickLaunchCard({
  onOpenPicker,
  refreshToken = 0,
}: {
  onOpenPicker?: (originEl?: HTMLElement | null) => void;
  /** Bump after picker adds items to refresh the list */
  refreshToken?: number;
}) {
  const [items, setItems] = useState<QuickShortcut[]>([]);
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
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount / token
  }, [refreshToken]);

  const flash = (text: string, ok: boolean) => {
    setMsg({ text, ok });
    window.setTimeout(() => setMsg(null), 2400);
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
        {canAdd ? (
          <QuickAddTile
            onClick={(el) => onOpenPicker?.(el)}
            disabled={pending || !onOpenPicker}
          />
        ) : null}
      </div>
    </Glass>
  );
}
