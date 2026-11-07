@echo off
rem Copies the launcher's real settings files into _realdata\ so Claude can read them. Changes nothing.
cd /d "%~dp0"
if not exist _realdata mkdir _realdata
copy /Y "%APPDATA%\SkyvaintGameLauncher\*.json" _realdata\ >NUL
copy /Y "%APPDATA%\SkyvaintGameLauncher\*.bak" _realdata\ >NUL 2>&1
dir /T:W "%APPDATA%\SkyvaintGameLauncher" > _realdata\listing.txt
dir /T:W /O:-D "%APPDATA%\SkyvaintGameLauncher\media" > _realdata\media-listing.txt
