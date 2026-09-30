export type AppSource = "start-menu" | "desktop" | "recent" | "registry";

export type InstalledApp = {
  /** Stable key: lowercased target path or name */
  id: string;
  name: string;
  /** Absolute .exe / .lnk path on the monitored PC */
  target: string;
  source: AppSource;
  /** Short source label for UI */
  sourceLabel: string;
  /** data:image/png;base64,… or null → letter fallback */
  iconDataUrl: string | null;
};

export type InstalledAppsPayload = {
  apps: InstalledApp[];
  scannedAt: number;
  mock: boolean;
};
