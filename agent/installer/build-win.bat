@echo off
REM ─────────────────────────────────────────────────────────────────────────────
REM Screen Agent — Windows MSI + NSIS build script
REM Run from the agent/ directory on a Windows machine with Node.js installed.
REM ─────────────────────────────────────────────────────────────────────────────

echo.
echo ╔══════════════════════════════════════════╗
echo ║   Screen Agent — Windows Installer Build  ║
echo ╚══════════════════════════════════════════╝
echo.

REM Check Node.js
where node >nul 2>&1
if %errorlevel% neq 0 (
    echo ERROR: Node.js not found. Install from https://nodejs.org
    exit /b 1
)

REM Check that we're in the agent directory
if not exist "package.json" (
    echo ERROR: Run this script from the agent/ directory.
    exit /b 1
)

REM Check icon files
if not exist "assets\icon.ico" (
    echo WARNING: assets\icon.ico not found.
    echo          See assets\README-ICONS.md for instructions.
    echo          Build will use default Electron icon.
    echo.
)

REM Install dependencies
echo [1/3] Installing dependencies...
call npm install
if %errorlevel% neq 0 (
    echo ERROR: npm install failed.
    exit /b 1
)

REM Build MSI
echo.
echo [2/3] Building MSI installer...
call npm run build:win:msi
if %errorlevel% neq 0 (
    echo ERROR: MSI build failed.
    exit /b 1
)

REM Build NSIS (full setup.exe)
echo.
echo [3/3] Building NSIS installer...
call npm run build:win
if %errorlevel% neq 0 (
    echo ERROR: NSIS build failed.
    exit /b 1
)

echo.
echo ══════════════════════════════════════════════
echo BUILD COMPLETE. Installers in: dist\
echo.
dir /b dist\*.msi dist\*.exe 2>nul
echo ══════════════════════════════════════════════
echo.
echo Distribution:
echo   MSI  — silent install via GPO / SCCM:
echo          msiexec /i "Screen Agent-1.0.0.msi" /quiet /norestart
echo.
echo   NSIS — user-friendly installer with setup wizard:
echo          "Screen Agent Setup 1.0.0.exe"
echo.
