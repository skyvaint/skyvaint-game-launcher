@echo off
rem Builds the launcher (Release) and starts it. Output goes to build.log next to this file.
cd /d "%~dp0"
tasklist /FI "IMAGENAME eq SkyvaintGameLauncher.exe" 2>NUL | find /I "SkyvaintGameLauncher.exe" >NUL && (echo The launcher is still running. Quit it from the tray first. & pause & exit /b 1)
echo Building... (log: build.log)
dotnet build -c Release > build.log 2>&1
if errorlevel 1 (echo BUILD FAILED - see build.log & findstr /I /C:" error " build.log & pause & exit /b 1)
echo Build OK, starting the launcher.
start "" "%~dp0bin\Release\net9.0-windows\SkyvaintGameLauncher.exe"
timeout /t 3 >NUL
