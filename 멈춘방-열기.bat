@echo off
rem ============================================================
rem  Reopen stopped Claude Code rooms and attach Remote Control.
rem
rem  Just double-click this file.
rem   1) It lists only the folders that still have leftover work.
rem   2) It asks before opening anything.
rem   3) On yes, each folder opens in its own window, already
rem      attached to Remote Control (claude --continue --rc).
rem
rem  Everything you read on screen comes from tools/rc-open.js.
rem  NOTE: this .bat stays ASCII on purpose. Korean text inside a
rem  .bat is unreliable across cmd code pages, so the Korean is
rem  printed by node after chcp 65001 below.
rem
rem  Made 2026-09-07 for the request "아주쉽게 준비".
rem ============================================================

rem UTF-8 so the Korean that node prints is readable
chcp 65001 >nul

cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo [!] node was not found on this PC.
  echo     Install Node.js first: https://nodejs.org
  echo.
  pause
  exit /b 1
)

node tools\rc-open.js %*

echo.
pause
