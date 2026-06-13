@echo off
powershell -NoProfile -Command "$d=[Environment]::GetFolderPath('Desktop');$s=(New-Object -COM WScript.Shell).CreateShortcut($d+'\pureunall.lnk');$s.TargetPath='%~dp0';$s.Save()"
echo.
echo  Desktop icon created: pureunall
pause
