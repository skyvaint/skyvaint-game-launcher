@echo off
rem Closes the launcher (like tray -> Quit, so it saves first), builds it (Release) and starts the new one.
rem Start it from File Explorer (double-click). Everything is logged to build.log.
cd /d "%~dp0"
echo [%date% %time%] build-and-run started > build.log
set "EXE=%~dp0bin\Release\net9.0-windows\SkyvaintGameLauncher.exe"
tasklist /FI "IMAGENAME eq SkyvaintGameLauncher.exe" 2>NUL | find /I "SkyvaintGameLauncher.exe" >NUL
if not errorlevel 1 (
  echo Closing the running launcher...
  echo Closing the running launcher >> build.log
  if exist "%EXE%" "%EXE%" --quit
  for /L %%i in (1,1,30) do (
    tasklist /FI "IMAGENAME eq SkyvaintGameLauncher.exe" 2>NUL | find /I "SkyvaintGameLauncher.exe" >NUL || goto closed
    timeout /t 1 /nobreak >NUL
  )
  echo The launcher didn't close. Quit it from the tray, then run this again.
  echo Did not close >> build.log
  pause
  exit /b 1
)
:closed
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
start "" "%EXE%"
timeout /t 3 >NUL
