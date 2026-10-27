@echo off
title lol-draft-bridge
cd /d "%~dp0"

echo Starting LoL Draft Bridge...

if not exist "dist\index.js" (
    echo Building TypeScript project first...
    call npm.cmd run build
)

:: Ensure lol-draft-bridge.exe launcher exists for easy identification in Task Manager
if not exist "lol-draft-bridge.exe" (
    node scripts\ensure-exe.cjs >nul 2>&1
)

if not exist "lol-draft-bridge.exe" (
    for /f "delims=" %%I in ('where node.exe 2^>nul') do (
        if not exist "lol-draft-bridge.exe" (
            mklink /H "lol-draft-bridge.exe" "%%I" >nul 2>&1
            if errorlevel 1 (
                copy /y "%%I" "lol-draft-bridge.exe" >nul 2>&1
            )
        )
    )
)

if exist "lol-draft-bridge.exe" (
    call lol-draft-bridge.exe dist\index.js %*
) else (
    call node.exe dist\index.js %*
)

pause
