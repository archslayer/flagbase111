New-Item -ItemType Directory -Path "C:\Users\altug\AppData\Local\Temp\script-832f5b33-ca44-4d56-b0c7-baf810651caf" -Force | Out-Null
$scriptPath = "C:\Users\altug\AppData\Local\Temp\script-832f5b33-ca44-4d56-b0c7-baf810651caf\script.ps1"
Set-Content -Path $scriptPath -Value @'
New-Item "C:\dev\YEDEK" -ItemType Directory -Force | Out-Null
Copy-Item -Path "C:\dev\flagwars2" -Destination "C:\dev\YEDEK\8KASIMFREE" -Recurse -Force | Out-Null
Write-Output "Backup completed to C:\dev\YEDEK\8KASIMFREE"
'@
& powershell -ExecutionPolicy Bypass -File $scriptPath
Remove-Item $scriptPath
Remove-Item "C:\Users\altug\AppData\Local\Temp\script-832f5b33-ca44-4d56-b0c7-baf810651caf" -Force -Recurse
New-Item -ItemType Directory -Path "C:\Users\altug\AppData\Local\Temp\script-832f5b33-ca44-4d56-b0c7-baf810651caf" -Force | Out-Null
$scriptPath = "C:\Users\altug\AppData\Local\Temp\script-832f5b33-ca44-4d56-b0c7-baf810651caf\script.ps1"
Set-Content -Path $scriptPath -Value @'
New-Item "C:\dev\YEDEK" -ItemType Directory -Force | Out-Null
Copy-Item -Path "C:\dev\flagwars2" -Destination "C:\dev\YEDEK\8KASIMFREE" -Recurse -Force | Out-Null
Write-Output "Backup completed to C:\dev\YEDEK\8KASIMFREE"
'@
& powershell -ExecutionPolicy Bypass -File $scriptPath
Remove-Item $scriptPath
Remove-Item "C:\Users\altug\AppData\Local\Temp\script-832f5b33-ca44-4d56-b0c7-baf810651caf" -Force -Recurse

