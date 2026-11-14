<#
.SYNOPSIS
  Copy every nightly database backup from GitHub to this PC and to Google Drive.

.DESCRIPTION
  The Backup workflow in the private repo JeffThomas360/horrorwriter-backups keeps each night's
  encrypted backup as a run artifact for 30 days. This script downloads any backup this PC does
  not have yet into -LocalDir, then copies any file Google Drive does not have yet into
  -DriveDir. It catches up on every backup GitHub still holds, so the PC does not have to be on
  at night: run it whenever (the scheduled task from install-backup-pull.ps1 runs it at sign-in
  and every 4 hours).

  Files are copied as they are: encrypted with the backup passphrase, so Google only ever holds
  locked files. Nothing is deleted; a backup is well under 1 MB.

  Needs: gh signed in as the repo owner. Google Drive for desktop running and signed in (if it is
  not, the local copy is still made and Drive catches up next time).

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File scripts\ops\pull-backups.ps1
#>
param(
  [string]$Repo = 'JeffThomas360/horrorwriter-backups',
  [string]$LocalDir = 'D:\Backups\horrorwriter',
  # Empty = find the "My Drive" folder of Google Drive for desktop on any drive letter.
  [string]$DriveDir = '',
  [string]$DriveSubfolder = 'horrorwriter-backups'
)

$ErrorActionPreference = 'Stop'
New-Item -ItemType Directory -Force $LocalDir | Out-Null
$log = Join-Path $LocalDir 'pull-backups.log'
function Log([string]$msg) {
  $line = '{0:yyyy-MM-dd HH:mm:ss} {1}' -f (Get-Date), $msg
  Add-Content -Path $log -Value $line
  Write-Host $line
}

try {
  # 1. Every successful run that still has its artifact.
  $runs = gh run list -R $Repo --workflow backup.yml --status success --limit 40 --json databaseId |
    ConvertFrom-Json
  $fetched = 0
  foreach ($run in $runs) {
    $artifacts = (gh api "repos/$Repo/actions/runs/$($run.databaseId)/artifacts" | ConvertFrom-Json).artifacts |
      Where-Object { -not $_.expired -and $_.name -like 'horrorwriter-*' }
    foreach ($a in $artifacts) {
      $file = Join-Path $LocalDir "$($a.name).tar.gz.gpg"
      if (Test-Path $file) { continue }
      $tmp = Join-Path ([IO.Path]::GetTempPath()) "hw-backup-$($a.id)"
      Remove-Item -Recurse -Force $tmp -ErrorAction SilentlyContinue
      gh run download $run.databaseId -R $Repo -n $a.name -D $tmp
      if ($LASTEXITCODE -ne 0) { throw "gh run download failed for $($a.name)" }
      $got = Get-ChildItem $tmp -Filter '*.tar.gz.gpg' | Select-Object -First 1
      if (-not $got -or $got.Length -eq 0) { throw "artifact $($a.name) held no backup file" }
      Move-Item $got.FullName $file
      Remove-Item -Recurse -Force $tmp
      $fetched++
      Log "saved $($a.name) ($([math]::Round((Get-Item $file).Length / 1KB)) KB)"
    }
  }

  $local = Get-ChildItem $LocalDir -Filter 'horrorwriter-*.tar.gz.gpg' | Sort-Object Name
  $newest = $local | Select-Object -Last 1
  Log "local: $($local.Count) backups, $fetched new, newest $($newest.Name)"

  # A backup older than two days means the nightly run is failing: say so loudly.
  if ($newest -and $newest.Name -match 'horrorwriter-(\d{4}-\d{2}-\d{2})') {
    $age = (Get-Date) - [datetime]::ParseExact($Matches[1], 'yyyy-MM-dd', $null)
    if ($age.TotalDays -gt 2) { Log "WARNING: newest backup is $([int]$age.TotalDays) days old. Check the Backup runs in $Repo." }
  } elseif (-not $newest) {
    Log "WARNING: no backups yet. Check the Backup runs in $Repo."
  }

  # 2. Mirror to Google Drive.
  if (-not $DriveDir) {
    $myDrive = Get-PSDrive -PSProvider FileSystem |
      ForEach-Object { Join-Path $_.Root 'My Drive' } |
      Where-Object { Test-Path $_ } | Select-Object -First 1
    if ($myDrive) { $DriveDir = Join-Path $myDrive $DriveSubfolder }
  }
  if (-not $DriveDir) {
    Log 'Google Drive not found (is Google Drive for desktop running and signed in?). Local copy only this time.'
  } else {
    New-Item -ItemType Directory -Force $DriveDir | Out-Null
    $copied = 0
    foreach ($f in $local) {
      $dest = Join-Path $DriveDir $f.Name
      if (-not (Test-Path $dest)) { Copy-Item $f.FullName $dest; $copied++ }
    }
    Log "drive: $copied copied to $DriveDir"
  }
} catch {
  Log "ERROR: $($_.Exception.Message)"
  exit 1
}
