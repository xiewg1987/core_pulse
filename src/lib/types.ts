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
  usedGb: number;
  totalGb: number;
  unit: "GB" | "TB";
  percent: number;
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
  percent: number;
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
  processes: ProcessRow[];
}
