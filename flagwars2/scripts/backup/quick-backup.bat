@echo off
cd /d "%~dp0\..\.."
echo Starting quick backup...
git add .
git commit -m "Quick backup - %date% %time%"
echo Backup completed
git log -1 --oneline
