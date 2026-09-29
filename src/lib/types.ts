export type StatusTone = "ok" | "warn" | "crit" | "accent";

export interface StatusChip {
  label: string;
  tone: StatusTone;
}

export interface TempRow {
  id: string;
  label: string;
  celsius: number | null;
  max: number;
}

export interface StorageVolume {
  id: string;
  letter: string;
  /** Volume label, e.g. "990" */
  label: string | null;
  usedGb: number;
  totalGb: number;
  unit: "GB" | "TB";
  percent: number;
  readMBps: number;
  writeMBps: number;
  smart: "正常" | "注意" | "未知";
  smartTone: StatusTone;
  accent: "orange" | "purple";
}

export interface MetricSeries {
  percent: number;
  peak: number;
  avg: number;
  history: number[];
}

export interface ProcessRow {
  name: string;
  /** Executable image for taskkill, e.g. "Cursor.exe". */
  imageName: string;
  /** PIDs aggregated into this row (app group). */
  pids: number[];
  /** CPU% or memory working-set share of physical RAM. */
  percent: number;
  /** Aggregated working set, megabytes (memory list only). */
  usedMb?: number;
}

export type ProcessKind = "应用" | "系统" | "后台";

/** Full process table row (全部进程 page). */
export interface ProcessListItem {
  name: string;
  imageName: string;
  pid: number;
  pids: number[];
  cpuPercent: number;
  usedMb: number;
  kind: ProcessKind;
}

export interface ProcessListPayload {
  mock: boolean;
  timestamp: number;
  clock: string;
  processes: ProcessListItem[];
}

export interface MetricsPayload {
  mock: boolean;
  timestamp: number;
  host: {
    name: string;
    os: string;
    cpu: string;
    ram: string;
    gpu: string;
    uptime: string;
  };
  clock: string;
  status: StatusChip[];
  health: {
    score: number;
    load: number;
    temp: number | null;
  };
  cpu: MetricSeries & {
    speedGhz: number | null;
  };
  memory: MetricSeries & {
    usedGb: number;
    totalGb: number;
    availableGb: number;
  };
  disk: {
    percent: number;
    volumesSummary: string;
    cPercent: number;
    dPercent: number;
    readMBps: number;
    writeMBps: number;
  };
  gpu: MetricSeries & {
    vramUsedGb: number | null;
    vramTotalGb: number | null;
    temp: number | null;
    powerW: number | null;
  };
  power: {
    mode: "AC";
    plugged: boolean;
    drawW: number | null;
    ratedW: number | null;
  };
  network: {
    downMbps: number;
    upMbps: number;
    latencyMs: number | null;
    rxBytesToday: number | null;
    txBytesToday: number | null;
    historyDown: number[];
    historyUp: number[];
  };
  temps: TempRow[];
  diskIO: {
    readMBps: number;
    writeMBps: number;
    peak: number;
    historyRead: number[];
    historyWrite: number[];
  };
  storage: StorageVolume[];
  processesCpu: ProcessRow[];
  processesMem: ProcessRow[];
}
