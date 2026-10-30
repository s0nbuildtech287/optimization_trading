@echo off
echo ===================================================
echo Building Standalone system_monitor.exe
echo ===================================================

cd /d "%~dp0\.."

if not exist backend\bin mkdir backend\bin

echo Stopping any running mt5-system-monitor PM2 process...
call pm2 delete mt5-system-monitor >nul 2>&1
if %ERRORLEVEL% EQU 0 (
    echo PM2 process mt5-system-monitor stopped.
) else (
    echo PM2 process mt5-system-monitor not running or PM2 unavailable.
)

echo Stopping any lingering system_monitor.exe processes...
taskkill /F /IM system_monitor.exe /T >nul 2>&1
if %ERRORLEVEL% EQU 0 (
    echo Previous system_monitor.exe processes stopped.
) else (
    echo No running system_monitor.exe processes found.
)

timeout /t 2 /nobreak >nul

echo Checking Python dependencies...
python -m pip install --upgrade pip
python -m pip install pyinstaller psutil pythonnet

echo Running PyInstaller...
pyinstaller --clean --noconfirm --distpath backend\bin --workpath build system_monitor.spec

if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] PyInstaller build failed!
    exit /b %ERRORLEVEL%
)

echo.
echo ===================================================
echo Build completed successfully!
echo Executable: backend\bin\system_monitor.exe
echo ===================================================
