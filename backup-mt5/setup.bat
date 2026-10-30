@echo off
setlocal EnableExtensions EnableDelayedExpansion

echo ==============================
echo Checking Node.js
echo ==============================

where node >nul 2>&1
if not errorlevel 1 (
    echo Node.js already installed.
    goto INSTALL_PM2
)

echo Node.js NOT found. Installing...

:: Download Node.js LTS
set NODE_URL=https://nodejs.org/dist/v20.11.1/node-v20.11.1-x64.msi
set NODE_MSI=%TEMP%\nodejs.msi

powershell -NoProfile -ExecutionPolicy Bypass ^
  -Command "Invoke-WebRequest '%NODE_URL%' -OutFile '%NODE_MSI%'"

if not exist "%NODE_MSI%" (
    echo ERROR: Cannot download Node.js
    pause
    exit /b 1
)

echo Installing Node.js...
msiexec /i "%NODE_MSI%" /qn /norestart

if errorlevel 1 (
    echo ERROR: Node.js installation failed
    pause
    exit /b 1
)

:: Reload PATH manually
set "PATH=%PATH%;C:\Program Files\nodejs"

echo Node.js installed successfully.

:INSTALL_PM2
echo ==============================
echo Installing PM2
echo ==============================

call npm install -g pm2
if errorlevel 1 (
    echo ERROR: PM2 installation failed
    pause
    exit /b 1
)

echo ==============================
echo Verifying
echo ==============================

call node -v
call npm -v
call pm2 -v

echo ==============================
echo Setup DONE
echo ==============================
pause
endlocal
