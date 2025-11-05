@echo off
REM Critical Backup Batch Script (Every 1 hour)
REM Run this with Windows Task Scheduler

cd /d "%~dp0\..\.."
powershell.exe -ExecutionPolicy Bypass -File "scripts\backup\critical-backup.ps1"

REM Log the execution
echo %date% %time% - Critical backup executed >> scripts\backup\backup.log
