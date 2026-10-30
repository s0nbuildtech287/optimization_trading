@echo off
echo ===================================================
echo Building Standalone ea_scanner.exe
echo ===================================================

cd /d "%~dp0\.."

if not exist backend\bin mkdir backend\bin

echo Checking Python dependencies...
python -m pip install --upgrade pip
python -m pip install pyinstaller psutil

echo Running PyInstaller...
pyinstaller --clean --onefile --distpath backend\bin --workpath build --name ea_scanner backend\bin\ea_scanner.py

if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] PyInstaller build failed!
    exit /b %ERRORLEVEL%
)

echo.
echo ===================================================
echo Build completed successfully!
echo Executable: backend\bin\ea_scanner.exe
echo ===================================================
