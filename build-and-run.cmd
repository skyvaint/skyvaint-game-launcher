@echo off
rem Closes the launcher, builds it (Release) and starts the new one. Everything is logged to build.log.
cd /d "%~dp0"
echo [%date% %time%] build-and-run started > build.log
tasklist /FI "IMAGENAME eq SkyvaintGameLauncher.exe" 2>NUL | find /I "SkyvaintGameLauncher.exe" >NUL
if not errorlevel 1 (
  echo Closing the running launcher...
  echo Closing the running launcher >> build.log
  taskkill /IM SkyvaintGameLauncher.exe >NUL 2>&1
  timeout /t 3 /nobreak >NUL
  taskkill /F /IM SkyvaintGameLauncher.exe >NUL 2>&1
  timeout /t 1 /nobreak >NUL
)
echo Building... (this takes a minute)
dotnet build -c Release >> build.log 2>&1
if errorlevel 1 (
  echo BUILD FAILED >> build.log
  echo.
  echo BUILD FAILED - tell Claude, the details are in build.log
  findstr /I /C:" error " build.log
  pause
  exit /b 1
)
echo BUILD OK >> build.log
echo Build OK, starting the launcher.
start "" "%~dp0bin\Release\net9.0-windows\SkyvaintGameLauncher.exe"
timeout /t 3 >NUL
