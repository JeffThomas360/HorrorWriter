<#
.SYNOPSIS
  Register a Windows scheduled task that runs pull-backups.ps1 at sign-in and every 4 hours.

.DESCRIPTION
  Copies pull-backups.ps1 into the backup folder and schedules that copy, so the task keeps
  working whichever branch the repo checkout is on. Run this again after changing the script.

  Runs as the signed-in user (so it can use gh's sign-in and Google Drive), only while that user
  is signed in, hidden. Unregister with:
    Unregister-ScheduledTask -TaskName 'HorrorWriter backup pull' -Confirm:$false
#>
param(
  [string]$TaskName = 'HorrorWriter backup pull',
  [string]$LocalDir = 'D:\Backups\horrorwriter',
  # Google Drive folder to copy into; see pull-backups.ps1. Empty = local copy only.
  [string]$DriveDir = ''
)

$ErrorActionPreference = 'Stop'
$source = Join-Path $PSScriptRoot 'pull-backups.ps1'
if (-not (Test-Path $source)) { throw "not found: $source" }
New-Item -ItemType Directory -Force $LocalDir | Out-Null
$script = Join-Path $LocalDir 'pull-backups.ps1'
Copy-Item $source $script -Force
# The restore drill and the passphrase reset live beside the backups too, so they run whichever
# branch is checked out.
foreach ($f in 'restore-drill.ps1', 'reset-backup-passphrase.ps1') {
  Copy-Item (Join-Path $PSScriptRoot $f) (Join-Path $LocalDir $f) -Force
}

$action = New-ScheduledTaskAction -Execute 'powershell.exe' `
  -Argument ("-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$script`" -LocalDir `"$LocalDir`"" +
             $(if ($DriveDir) { " -DriveDir `"$DriveDir`"" } else { '' }))
$atLogOn = New-ScheduledTaskTrigger -AtLogOn -User "$env:USERDOMAIN\$env:USERNAME"
$every4h = New-ScheduledTaskTrigger -Once -At (Get-Date).Date `
  -RepetitionInterval (New-TimeSpan -Hours 4)
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -AllowStartIfOnBatteries `
  -DontStopIfGoingOnBatteries -ExecutionTimeLimit (New-TimeSpan -Minutes 30)

Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $atLogOn, $every4h `
  -Settings $settings -Description 'Copies horrorwriter.org database backups from GitHub to this PC and Google Drive.' `
  -Force | Out-Null

Write-Host "Registered '$TaskName' (runs $script). Running it once now..."
Start-ScheduledTask -TaskName $TaskName
