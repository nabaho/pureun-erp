@echo off
title PUREUNALL AUTO-UPLOAD
cd /d "%~dp0"

:menu
cls
echo ==============================================
echo        PUREUNALL AUTO-UPLOAD PROGRAM
echo ==============================================
echo.
echo   [1] START watching  (auto upload on change)
echo   [2] Windows start ON  (run at boot)
echo   [3] Windows start OFF
echo.
echo   (auto-starts [1] in 5 seconds)
echo ==============================================
choice /c 123 /t 5 /d 1 /m "  Select"
if errorlevel 3 goto auto_off
if errorlevel 2 goto auto_on

:watch
cls
echo ==============================================
echo   WATCHING FOLDER ... overwrite a file here
echo   and it uploads to GitHub automatically.
echo   Close this window to stop.
echo ==============================================
echo.
:loop
set CNT=0
for /f %%i in ('git status --porcelain ^| find /c /v ""') do set CNT=%%i
if "%CNT%"=="0" goto checkpush
timeout /t 3 /nobreak >nul
git add -A
git commit -m "auto update" >nul 2>&1
echo [%date% %time%] change detected, committed

:checkpush
set AHEAD=0
for /f %%i in ('git rev-list --count origin/main..HEAD 2^>nul') do set AHEAD=%%i
if "%AHEAD%"=="0" goto wait
git push origin main
if errorlevel 1 (
  echo [%date% %time%] PUSH FAILED - will retry...
) else (
  echo [%date% %time%] ===== UPLOADED =====
)

:wait
timeout /t 5 /nobreak >nul
goto loop

:auto_on
powershell -NoProfile -Command "$s=(New-Object -COM WScript.Shell).CreateShortcut([Environment]::GetFolderPath('Startup')+'\pureunall-watch.lnk');$s.TargetPath='%~f0';$s.WorkingDirectory='%~dp0';$s.Save()"
echo.
echo  Done. This program will start with Windows.
pause
goto menu

:auto_off
del "%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup\pureunall-watch.lnk" 2>nul
echo.
echo  Autostart removed.
pause
goto menu
