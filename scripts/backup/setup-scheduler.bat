@echo off
REM Setup Windows Task Scheduler for automated backups
REM Run as Administrator

echo === FlagWars Automated Backup Setup ===
echo.

REM Check if running as administrator
net session >nul 2>&1
if %errorlevel% neq 0 (
    echo This script requires administrator privileges.
    echo Please run as Administrator.
    pause
    exit /b 1
)

cd /d "%~dp0\..\.."
set PROJECT_DIR=%CD%

echo Project Directory: %PROJECT_DIR%
echo.

REM Create critical backup task (every 1 hour)
echo Creating Critical Backup Task (every 1 hour)...
schtasks /create /tn "FlagWars-CriticalBackup" /tr "%PROJECT_DIR%\scripts\backup\backup-system.bat critical" /sc hourly /mo 1 /ru "%USERNAME%" /f
if %errorlevel% equ 0 (
    echo ✓ Critical backup task created successfully
) else (
    echo ✗ Failed to create critical backup task
)

echo.

REM Create full backup task (every 3 hours)
echo Creating Full Backup Task (every 3 hours)...
schtasks /create /tn "FlagWars-FullBackup" /tr "%PROJECT_DIR%\scripts\backup\backup-system.bat full" /sc hourly /mo 3 /ru "%USERNAME%" /f
if %errorlevel% equ 0 (
    echo ✓ Full backup task created successfully
) else (
    echo ✗ Failed to create full backup task
)

echo.
echo === Setup Complete! ===
echo.
echo Scheduled Tasks Created:
echo   • FlagWars-CriticalBackup (every 1 hour)
echo   • FlagWars-FullBackup (every 3 hours)
echo.
echo You can manage these tasks in:
echo   Task Scheduler → Task Scheduler Library → FlagWars-*
echo.
echo Manual backup commands:
echo   .\scripts\backup\backup-system.bat critical
echo   .\scripts\backup\backup-system.bat full
echo   .\scripts\backup\backup-system.bat status
echo.

pause
