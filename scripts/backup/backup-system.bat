@echo off
REM FlagWars Backup System
REM Usage: backup-system.bat [critical|full|status]

set ACTION=%1
if "%ACTION%"=="" set ACTION=status

cd /d "%~dp0\..\.."

if "%ACTION%"=="critical" (
    echo === Critical Backup ===
    echo Adding critical files...
    git add components/ConnectAndLogin.tsx
    git add app/market/page.tsx
    git add app/attack/page.tsx
    git add lib/core.ts
    git add lib/contracts.ts
    git add lib/tx.ts
    git add lib/jwt.ts
    git add lib/redis.ts
    git add lib/error-handler.ts
    git add app/api/trade/buy/route.ts
    git add app/api/trade/sell/route.ts
    git add app/api/trade/attack/route.ts
    git add app/api/auth/verify/route.ts
    git add app/api/auth/nonce/route.ts
    git add middleware.ts
    git add package.json
    git add tsconfig.json
    git commit -m "Critical backup - %date% %time%"
    echo Critical backup completed
    goto :show_status
)

if "%ACTION%"=="full" (
    echo === Full Backup ===
    git add .
    git commit -m "Full backup - %date% %time%"
    echo Full backup completed
    goto :show_status
)

if "%ACTION%"=="status" (
    echo === Backup Status ===
    echo Recent commits:
    git log --oneline -5
    echo.
    echo Repository size:
    for /f %%i in ('git count-objects -vH ^| findstr "size-pack"') do echo %%i
    echo.
    echo Current status:
    git status --short
    goto :end
)

echo Invalid action: %ACTION%
echo Usage: backup-system.bat [critical^|full^|status]
goto :end

:show_status
echo.
echo Latest commit:
git log -1 --oneline
echo.
echo Current status:
git status --short

:end
