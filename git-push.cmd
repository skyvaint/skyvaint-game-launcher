@echo off
rem Commits the latest changes and pushes them to GitHub. Output goes to git-push.log.
cd /d "%~dp0"
(
echo [%date% %time%]
git status --short
git add -A
git commit -F _commitmsg.txt
git push -u origin HEAD
git log --oneline -3
git status -sb
) > git-push.log 2>&1
del _commitmsg.txt >NUL 2>&1
type git-push.log
timeout /t 5 >NUL
