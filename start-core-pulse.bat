@echo off
setlocal EnableExtensions
cd /d "%~dp0"

title Core Pulse
set "PORT=47821"
set "HOST=0.0.0.0"

where npm >nul 2>&1
if errorlevel 1 (
  echo [Core Pulse] 未找到 npm，请先安装 Node.js 并确保已加入 PATH。
  pause
  exit /b 1
)

if not exist "node_modules\" (
  echo [Core Pulse] 缺少依赖，正在 npm install ...
  call npm install
  if errorlevel 1 (
    echo [Core Pulse] npm install 失败。
    pause
    exit /b 1
  )
)

if not exist ".next\" (
  echo [Core Pulse] 未检测到生产构建，正在 npm run build ...
  call npm run build
  if errorlevel 1 (
    echo [Core Pulse] 构建失败。
    pause
    exit /b 1
  )
)

echo [Core Pulse] 启动中...
echo [Core Pulse] 本机:     http://localhost:%PORT%
echo [Core Pulse] 局域网:   http://^<本机IP^>:%PORT%
echo [Core Pulse] 工作目录: %CD%
echo.

call npm run start
set "EXITCODE=%ERRORLEVEL%"

if not "%EXITCODE%"=="0" (
  echo.
  echo [Core Pulse] 进程已退出，代码 %EXITCODE%。
  pause
)

exit /b %EXITCODE%
