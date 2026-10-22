@echo off
title LoL Draft Bridge
cd /d "%~dp0"

echo Starting LoL Draft Bridge...
if not exist "dist\index.js" (
    echo Building TypeScript project first...
    call npm.cmd run build
)

call node.exe dist\index.js
pause
