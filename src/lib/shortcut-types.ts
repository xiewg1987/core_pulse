export const MAX_SHORTCUTS = 8;

export type QuickShortcut = {
  id: string;
  label: string;
  /** Absolute path, UNC, or http(s) URL on the monitored PC. */
  target: string;
  /** Icon tile accent, e.g. rgba(255,43,214,0.35) */
  color: string;
};
