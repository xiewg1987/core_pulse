import "server-only";

import { execFile } from "child_process";
import { promises as fs } from "fs";
import path from "path";
import { promisify } from "util";
import type {
  AppSource,
  InstalledApp,
  InstalledAppsPayload,
} from "@/lib/installed-apps-types";
import { mockAllowed } from "@/lib/metrics";

const execFileAsync = promisify(execFile);

const iconCache = new Map<string, string | null>();
let appsCache: { at: number; payload: InstalledAppsPayload } | null = null;
const APPS_TTL_MS = 60_000;

const FILTER_RE =
  /uninstall|卸载|help|readme|update|更新|setup|安装程序|移除/i;

const SOURCE_LABEL: Record<AppSource, string> = {
  "start-menu": "开始菜单",
  desktop: "桌面",
  recent: "最近使用",
  registry: "已安装",
};

function mockApps(): InstalledAppsPayload {
  const names = [
    ["Chrome", "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe", "start-menu"],
    ["VS Code", "C:\\Users\\Demo\\AppData\\Local\\Programs\\Microsoft VS Code\\Code.exe", "desktop"],
    ["Steam", "C:\\Program Files (x86)\\Steam\\steam.exe", "start-menu"],
    ["Notion", "C:\\Users\\Demo\\AppData\\Local\\Programs\\Notion\\Notion.exe", "start-menu"],
    ["Discord", "C:\\Users\\Demo\\AppData\\Local\\Discord\\Update.exe", "start-menu"],
    ["Edge", "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe", "start-menu"],
    ["微信", "C:\\Program Files\\Tencent\\WeChat\\WeChat.exe", "desktop"],
    ["Cursor", "C:\\Users\\Demo\\AppData\\Local\\Programs\\cursor\\Cursor.exe", "start-menu"],
  ] as const;
  return {
    mock: true,
    scannedAt: Date.now(),
    apps: names.map(([name, target, source], i) => ({
      id: `mock-${i}-${name}`,
      name,
      target,
      source: source as AppSource,
      sourceLabel: SOURCE_LABEL[source as AppSource],
      iconDataUrl: null,
    })),
  };
}

function shouldKeepName(name: string): boolean {
  const n = name.trim();
  if (!n || n.length < 2) return false;
  if (FILTER_RE.test(n)) return false;
  return true;
}

function normKey(target: string, name: string): string {
  const t = target.trim().toLowerCase().replace(/\//g, "\\");
  if (t) return t;
  return `name:${name.trim().toLowerCase()}`;
}

type RawRow = {
  name?: string;
  target?: string;
  source?: string;
  icon?: string | null;
};

async function runScanScript(): Promise<RawRow[]> {
  const script = `
$ErrorActionPreference = 'SilentlyContinue'
Add-Type -AssemblyName System.Drawing | Out-Null

function Get-IconB64([string]$p) {
  if (-not $p -or -not (Test-Path -LiteralPath $p)) { return $null }
  try {
    $ico = [System.Drawing.Icon]::ExtractAssociatedIcon($p)
    if (-not $ico) { return $null }
    $bmp = $ico.ToBitmap()
    $ms = New-Object System.IO.MemoryStream
    $bmp.Save($ms, [System.Drawing.Imaging.ImageFormat]::Png)
    $b64 = [Convert]::ToBase64String($ms.ToArray())
    $ms.Dispose(); $bmp.Dispose(); $ico.Dispose()
    return $b64
  } catch { return $null }
}

$shell = New-Object -ComObject WScript.Shell
$rows = New-Object System.Collections.Generic.List[object]

function Add-LnkDir([string]$dir, [string]$source, [bool]$withIcon = $true, [int]$limit = 0) {
  if (-not $dir -or -not (Test-Path -LiteralPath $dir)) { return }
  $count = 0
  Get-ChildItem -LiteralPath $dir -Filter *.lnk -Recurse -File -ErrorAction SilentlyContinue |
    ForEach-Object {
      if ($limit -gt 0 -and $count -ge $limit) { return }
      try {
        $sc = $shell.CreateShortcut($_.FullName)
        $target = [string]$sc.TargetPath
        $name = [System.IO.Path]::GetFileNameWithoutExtension($_.Name)
        if (-not $target) { return }
        $ext = [System.IO.Path]::GetExtension($target).ToLowerInvariant()
        if ($ext -and $ext -notin @('.exe','.bat','.cmd','.msc')) { return }
        $b64 = $null
        if ($withIcon) {
          $iconPath = if ($ext -eq '.exe') { $target } else { $_.FullName }
          $b64 = Get-IconB64 $iconPath
        }
        $rows.Add([pscustomobject]@{
          name = $name
          target = $target
          source = $source
          icon = $b64
        }) | Out-Null
        $count++
      } catch {}
    }
}

$startUser = Join-Path $env:APPDATA 'Microsoft\\Windows\\Start Menu\\Programs'
$startAll  = Join-Path $env:ProgramData 'Microsoft\\Windows\\Start Menu\\Programs'
$deskUser  = [Environment]::GetFolderPath('Desktop')
$deskPublic = Join-Path $env:PUBLIC 'Desktop'
$recent    = Join-Path $env:APPDATA 'Microsoft\\Windows\\Recent'

Add-LnkDir $startUser 'start-menu' $true
Add-LnkDir $startAll  'start-menu' $true
Add-LnkDir $deskUser  'desktop' $true
Add-LnkDir $deskPublic 'desktop' $true
Add-LnkDir $recent    'recent' $false 40

$uninstallRoots = @(
  'HKLM:\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall',
  'HKLM:\\Software\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall',
  'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall'
)
foreach ($root in $uninstallRoots) {
  if (-not (Test-Path -LiteralPath $root)) { continue }
  Get-ChildItem -LiteralPath $root -ErrorAction SilentlyContinue | ForEach-Object {
    try {
      $p = Get-ItemProperty -LiteralPath $_.PSPath -ErrorAction SilentlyContinue
      $name = [string]$p.DisplayName
      if (-not $name) { return }
      $iconRaw = [string]$p.DisplayIcon
      $target = $null
      if ($iconRaw) {
        $iconRaw = $iconRaw.Trim('"')
        if ($iconRaw -match '(?i)^(.+?\.exe)(?:,-?\d+)?$') { $target = $Matches[1] }
      }
      if (-not $target) { return }
      if (-not (Test-Path -LiteralPath $target)) { return }
      $rows.Add([pscustomobject]@{
        name = $name
        target = $target
        source = 'registry'
        icon = $null
      }) | Out-Null
    } catch {}
  }
}

$rows | ConvertTo-Json -Compress -Depth 3
`.trim();

  const { stdout } = await execFileAsync(
    "powershell.exe",
    ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", script],
    {
      windowsHide: true,
      timeout: 45_000,
      maxBuffer: 32 * 1024 * 1024,
      encoding: "utf8",
    },
  );

  const text = (stdout || "").trim();
  if (!text) return [];
  try {
    const parsed = JSON.parse(text) as RawRow | RawRow[];
    return Array.isArray(parsed) ? parsed : [parsed];
  } catch {
    return [];
  }
}

function toApp(row: RawRow): InstalledApp | null {
  const name = String(row.name || "").trim();
  const target = String(row.target || "").trim();
  if (!shouldKeepName(name)) return null;
  if (!target) return null;
  if (!/^[a-zA-Z]:[\\/]/.test(target) && !target.startsWith("\\\\")) return null;

  const sourceRaw = String(row.source || "start-menu");
  const source: AppSource =
    sourceRaw === "desktop" ||
    sourceRaw === "recent" ||
    sourceRaw === "registry" ||
    sourceRaw === "start-menu"
      ? sourceRaw
      : "start-menu";

  let iconDataUrl: string | null = null;
  const cacheKey = target.toLowerCase();
  if (iconCache.has(cacheKey)) {
    iconDataUrl = iconCache.get(cacheKey) ?? null;
  } else if (row.icon) {
    iconDataUrl = `data:image/png;base64,${row.icon}`;
    iconCache.set(cacheKey, iconDataUrl);
  } else {
    iconCache.set(cacheKey, null);
  }

  return {
    id: normKey(target, name),
    name: name.slice(0, 48),
    target,
    source,
    sourceLabel: SOURCE_LABEL[source],
    iconDataUrl,
  };
}

function dedupe(apps: InstalledApp[]): InstalledApp[] {
  const byName = new Map<string, InstalledApp>();
  const sourceRank: Record<AppSource, number> = {
    desktop: 0,
    "start-menu": 1,
    recent: 2,
    registry: 3,
  };

  for (const app of apps) {
    const key = app.name.toLowerCase();
    const prev = byName.get(key);
    if (!prev) {
      byName.set(key, app);
      continue;
    }
    const prefer =
      sourceRank[app.source] < sourceRank[prev.source] ||
      (Boolean(app.iconDataUrl) && !prev.iconDataUrl);
    if (prefer) byName.set(key, app);
  }

  return [...byName.values()].sort((a, b) =>
    a.name.localeCompare(b.name, "zh-CN", { sensitivity: "base" }),
  );
}

export async function listInstalledApps(opts?: {
  force?: boolean;
}): Promise<InstalledAppsPayload> {
  if (mockAllowed()) return mockApps();

  if (
    !opts?.force &&
    appsCache &&
    Date.now() - appsCache.at < APPS_TTL_MS
  ) {
    return appsCache.payload;
  }

  if (process.platform !== "win32") {
    const empty: InstalledAppsPayload = {
      apps: [],
      scannedAt: Date.now(),
      mock: false,
    };
    return empty;
  }

  try {
    const rows = await runScanScript();
    const apps = dedupe(rows.map(toApp).filter((a): a is InstalledApp => Boolean(a)));
    const payload: InstalledAppsPayload = {
      apps,
      scannedAt: Date.now(),
      mock: false,
    };
    appsCache = { at: Date.now(), payload };
    return payload;
  } catch (e) {
    if (appsCache) return appsCache.payload;
    throw e instanceof Error ? e : new Error("扫描已装软件失败");
  }
}

export async function validateManualPath(input: {
  label: string;
  target: string;
}): Promise<{ ok: boolean; message: string; label?: string; target?: string }> {
  const label = input.label.replace(/\s+/g, " ").trim().slice(0, 24);
  let target = input.target.trim().replace(/^["']|["']$/g, "");
  if (!label) return { ok: false, message: "请填写名称" };
  if (!target) return { ok: false, message: "请填写路径" };
  if (!/^[a-zA-Z]:[\\/]/.test(target) && !target.startsWith("\\\\")) {
    return { ok: false, message: "需为绝对路径" };
  }
  target = path.normalize(target);

  try {
    const st = await fs.stat(target);
    if (!st.isFile()) return { ok: false, message: "路径不是文件" };
  } catch {
    return { ok: false, message: "文件不存在" };
  }

  const ext = path.extname(target).toLowerCase();
  if (ext !== ".exe" && ext !== ".lnk") {
    return { ok: false, message: "仅支持 .exe 或 .lnk" };
  }

  // Resolve .lnk to exe when possible
  if (ext === ".lnk" && process.platform === "win32") {
    try {
      const { stdout } = await execFileAsync(
        "powershell.exe",
        [
          "-NoProfile",
          "-NonInteractive",
          "-ExecutionPolicy",
          "Bypass",
          "-Command",
          `$s=(New-Object -ComObject WScript.Shell).CreateShortcut('${target.replace(/'/g, "''")}'); Write-Output $s.TargetPath`,
        ],
        { windowsHide: true, timeout: 5000, encoding: "utf8" },
      );
      const resolved = (stdout || "").trim();
      if (resolved && /\.exe$/i.test(resolved)) {
        return { ok: true, message: "可用", label, target: resolved };
      }
    } catch {
      /* keep .lnk as target */
    }
  }

  return { ok: true, message: "可用", label, target };
}
