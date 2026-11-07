@echo off
rem Puts your save with the Nexus bars (and the Aizen/GIF pictures) into the launcher's REAL settings folder.
rem Everything that is there now is kept as *.real-before-restore.bak first.
cd /d "%~dp0"
set "REAL=%APPDATA%\SkyvaintGameLauncher"
set "VIRT=%LOCALAPPDATA%\Packages\Claude_pzs8sxrjxfjjc\LocalCache\Roaming\SkyvaintGameLauncher"
echo Closing the launcher...
taskkill /IM SkyvaintGameLauncher.exe >NUL 2>&1
timeout /t 3 /nobreak >NUL
taskkill /F /IM SkyvaintGameLauncher.exe >NUL 2>&1
timeout /t 1 /nobreak >NUL
copy /Y "%REAL%\config.json" "%REAL%\config.json.real-before-restore.bak" >NUL
copy /Y "%REAL%\state.json" "%REAL%\state.json.real-before-restore.bak" >NUL
echo Copying your pictures and GIFs...
robocopy "%VIRT%\media" "%REAL%\media" /E /XC /XN /XO /R:1 /W:1 /NFL /NDL /NJH /NJS /NP >NUL
echo Putting your save back...
copy /Y "_restore\config.json" "%REAL%\config.json" >NUL
copy /Y "_restore\state.json" "%REAL%\state.json" >NUL
echo Done. Starting the launcher.
start "" "%~dp0bin\Release\net9.0-windows\SkyvaintGameLauncher.exe"
timeout /t 3 >NUL
