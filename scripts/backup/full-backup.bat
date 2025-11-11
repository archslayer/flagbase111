@echo off
REM Full Backup Batch Script (Every 3 hours)
REM Run this with Windows Task Scheduler

cd /d "%~dp0\..\.."
powershell.exe -ExecutionPolicy Bypass -File "scripts\backup\full-backup.ps1"

REM Log the execution
echo %date% %time% - Full backup executed >> scripts\backup\backup.log
