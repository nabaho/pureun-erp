@echo off
chcp 65001 >nul
cd /d "%~dp0"
title 근로복지기금 운영시스템

where python >nul 2>nul
if errorlevel 1 (
  echo.
  echo [오류] Python이 설치되어 있지 않습니다.
  echo   python.org 에서 Python 3.10 이상을 설치한 뒤 다시 실행하세요.
  echo   설치 시 "Add Python to PATH" 를 반드시 체크하세요.
  echo.
  pause
  exit /b
)

if not exist ".deps_ok" (
  echo 처음 실행: 필요한 구성요소를 설치합니다. 잠시만 기다려 주세요...
  python -m pip install -r requirements.txt
  if errorlevel 1 (
    echo [오류] 구성요소 설치 실패. 인터넷 연결을 확인하세요.
    pause
    exit /b
  )
  echo ok> .deps_ok
)

echo.
echo ============================================
echo   근로복지기금 운영시스템을 시작합니다.
echo   브라우저가 곧 자동으로 열립니다.
echo   * 이 검은 창은 프로그램이 켜져 있는 동안 닫지 마세요.
echo   * 종료하려면 이 창을 닫으면 됩니다.
echo ============================================
echo.

start "" /min cmd /c "timeout /t 3 >nul & start "" http://localhost:8777"
python -m uvicorn app:app --host 127.0.0.1 --port 8777
pause
