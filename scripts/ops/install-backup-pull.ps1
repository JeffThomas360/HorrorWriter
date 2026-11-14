<#
.SYNOPSIS
  Register a Windows scheduled task that runs pull-backups.ps1 at sign-in and every 4 hours.

.DESCRIPTION
  Runs as the signed-in user (so it can use gh's sign-in and Google Drive), only while that user
  is signed in, hidden. Run it again to update the task; unregister with:
    Unregister-ScheduledTask -TaskName 'HorrorWriter backup pull' -Confirm:$false
#>
param([string]$TaskName = 'HorrorWriter backup pull')

$script = Join-Path $PSScriptRoot 'pull-backups.ps1'
if (-not (Test-Path $script)) { throw "not found: $script" }

$action = New-ScheduledTaskAction -Execute 'powershell.exe' `
  -Argument "-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$script`""
$atLogOn = New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME
$every4h = New-ScheduledTaskTrigger -Once -At (Get-Date).Date `
  -RepetitionInterval (New-TimeSpan -Hours 4)
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -AllowStartIfOnBatteries `
  -DontStopIfGoingOnBatteries -ExecutionTimeLimit (New-TimeSpan -Minutes 30)

Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $atLogOn, $every4h `
  -Settings $settings -Description 'Copies horrorwriter.org database backups from GitHub to this PC and Google Drive.' `
  -Force | Out-Null

Write-Host "Registered '$TaskName'. Running it once now..."
Start-ScheduledTask -TaskName $TaskName
