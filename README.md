# Core Pulse · 本机监控

横屏「本机监控」：在 **被监控的 Windows 电脑本机** 运行 Next.js，用 `systeminformation` 读真实硬件/系统数据；同局域网的 iPad 只负责打开浏览器展示。

> 不要部署到 Vercel / 云主机再指望读到家里电脑——采集只发生在跑 Node 的那台机器上。

## 快速开始（Windows 台式机）

```bash
npm install
npm run dev
```

- 本机预览：`http://localhost:3000`
- iPad：`http://<这台电脑的局域网IP>:3000`（横屏）

生产：

```bash
npm run build
npm run start
```

`dev` / `start` 已绑定 `0.0.0.0:3000`，便于局域网访问。

### 查局域网 IP

```powershell
ipconfig
```

看「以太网」或「WLAN」的 IPv4，例如 `192.168.1.23`，iPad 打开 `http://192.168.1.23:3000`。

### 防火墙

若 iPad 打不开，放行 3000 端口（管理员 PowerShell）：

```powershell
New-NetFirewallRule -DisplayName "Core Pulse" -Direction Inbound -Protocol TCP -LocalPort 3000 -Action Allow
```

或在「允许应用通过防火墙」里勾选 Node.js。

## 数据从哪来

| 来源 | 说明 |
|------|------|
| Server Action `getSystemMetrics()` | `src/actions/metrics.ts`（`'use server'`），服务端调用 `systeminformation` |
| 前端 | `useSystemMetrics` hook 定时调用该 Action，**禁止** `fetch('/api/...')` |
| 缺失传感器 | 字段为 `null`，UI 显示「—」/「暂无」/「未知」，**不会用假温度、假网速冒充** |

### 显式 Mock（仅开发）

默认关闭。只有同时满足时才返回演示数据：

```powershell
$env:USE_MOCK="1"
npm run dev
```

（`NODE_ENV=development` 且 `USE_MOCK=1`）页面会出现 **MOCK** 标记。

## Windows 传感器说明

`systeminformation` 能稳定拿到的通常包括：主机名、系统、开机时长、CPU 型号/负载、内存、各盘容量、网卡累计字节与采样速率、部分磁盘读写。

界面已移除不可靠项：风扇、温度状态、SMART、整机功耗。GPU 占用/显存仍可通过 `nvidia-smi` 读取（NVIDIA）。

## 验收建议

1. 本机 `npm run dev`，打开页面后内存/CPU 百分比应随真实负载变化（再开几个大程序对比）。
2. 拷大文件或下载时，NETWORK / DISK IO 应明显跳动。
3. 未设 `USE_MOCK=1` 时，接口与页面不应出现固定演示假数据。

## 页面结构

顶栏（主机信息 + 状态芯片）· 电源与会话/进程 · CPU/内存/GPU/趋势 · 网络 · 本机描述 · 快捷启动 · 存储

暂不做：关机/重启控制、云端部署读本机。
