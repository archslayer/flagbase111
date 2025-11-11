@echo off
REM Simple Critical Backup Script

cd /d "%~dp0\..\.."

echo Starting critical backup...

REM Add critical files
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

REM Check for changes and commit
git status --porcelain > temp_status.txt
if %errorlevel% equ 0 (
    for /f %%i in ('find /c /v "" temp_status.txt') do set linecount=%%i
    if %linecount% gtr 0 (
        git commit -m "Critical backup - %date% %time%"
        echo Critical backup completed
    ) else (
        echo No changes detected for critical backup
    )
)

del temp_status.txt

echo.
echo Git Status:
git status --short
