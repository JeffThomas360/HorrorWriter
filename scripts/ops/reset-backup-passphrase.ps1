<#
.SYNOPSIS
  Set the backup passphrase from the clipboard, take a fresh backup with it, and prove it opens.

.DESCRIPTION
  Use when the restore drill says "Could not decrypt": the passphrase in the password manager is
  not the one GitHub encrypts with. In one go, with the same passphrase throughout:
    1. read it from the clipboard (one line; copy it from the password manager first),
    2. save it as BACKUP_PASSPHRASE on the backups repo,
    3. run the Backup workflow and wait for it,
    4. download that backup to -LocalDir,
    5. open it with the passphrase and count rows (restore-drill.ps1).
  The passphrase is never shown, logged or written to disk. Backups taken before the reset stay
  encrypted with the old passphrase.

.EXAMPLE
  pwsh -NoProfile -ExecutionPolicy Bypass -File D:\Backups\horrorwriter\reset-backup-passphrase.ps1
#>
param(
  [string]$Repo = 'JeffThomas360/horrorwriter-backups',
  [string]$LocalDir = 'D:\Backups\horrorwriter',
  # Testing only: skip steps 2-4 (GitHub untouched) and open this backup in step 5.
  [string]$TestBackupFile = ''
)
$ErrorActionPreference = 'Stop'
$here = $PSScriptRoot

# 1. The passphrase: exactly one non-empty line on the clipboard.
$clip = Get-Clipboard -Raw
$lines = @(($clip -split "`r?`n") | Where-Object { $_ -ne '' })
if ($lines.Count -ne 1) {
  throw "The clipboard holds $($lines.Count) lines of text, not one passphrase. Copy the backup passphrase from your password manager and run this again."
}
$pp = $lines[0]
$clip = $null; $lines = $null
if ($pp -ne $pp.Trim()) { throw 'The clipboard text starts or ends with a space. Copy just the passphrase and run this again.' }
if ($pp.Length -lt 12) { throw "The clipboard text is $($pp.Length) characters; a backup passphrase should be at least 12. Copy the passphrase and run this again." }
Write-Host "1. Passphrase read from the clipboard ($($pp.Length) characters)."

if ($TestBackupFile) {
  $newest = Get-Item $TestBackupFile
  Write-Host "   (test: GitHub untouched, opening $($newest.Name))"
} else {
# 2. Save it on GitHub.
gh secret set BACKUP_PASSPHRASE -R $Repo --body $pp | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'Could not save BACKUP_PASSPHRASE on GitHub (is gh signed in?).' }
Write-Host '2. Saved as BACKUP_PASSPHRASE on GitHub.'

# 3. A fresh backup with it.
$before = (Get-Date).ToUniversalTime().AddSeconds(-5)
gh workflow run backup.yml -R $Repo | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'Could not start the Backup workflow.' }
$run = $null
for ($i = 0; $i -lt 30 -and -not $run; $i++) {
  Start-Sleep -Seconds 3
  $run = gh run list -R $Repo --workflow backup.yml --event workflow_dispatch --limit 5 --json databaseId,createdAt |
    ConvertFrom-Json | Where-Object { ([datetime]$_.createdAt).ToUniversalTime() -ge $before } | Select-Object -First 1
}
if (-not $run) { throw 'The Backup run did not start within 90 seconds. Check the Actions tab.' }
Write-Host "3. Backup running (run $($run.databaseId)), about 1 minute..."
gh run watch $run.databaseId -R $Repo --exit-status *> $null
if ($LASTEXITCODE -ne 0) { throw "The Backup run failed: https://github.com/$Repo/actions/runs/$($run.databaseId)" }
Write-Host '   Backup run succeeded.'

# 4. Bring it to this PC.
& (Join-Path $here 'pull-backups.ps1') -Repo $Repo -LocalDir $LocalDir | Out-Null
$newest = Get-ChildItem $LocalDir -Filter 'horrorwriter-*.tar.gz.gpg' | Sort-Object Name | Select-Object -Last 1
Write-Host "4. Downloaded $($newest.Name)."
}

# 5. Open it with the same passphrase.
Write-Host '5. Opening it with the passphrase:'
$psi = New-Object Diagnostics.ProcessStartInfo
$psi.FileName = (Get-Command pwsh).Source
$psi.Arguments = "-NoProfile -ExecutionPolicy Bypass -File `"$(Join-Path $here 'restore-drill.ps1')`" -File `"$($newest.FullName)`" -PassphraseFromStdin"
$psi.UseShellExecute = $false
$psi.RedirectStandardInput = $true
$proc = [Diagnostics.Process]::Start($psi)
$bytes = [Text.Encoding]::UTF8.GetBytes($pp + "`n")
$proc.StandardInput.BaseStream.Write($bytes, 0, $bytes.Length)
$proc.StandardInput.Close()
[Array]::Clear($bytes, 0, $bytes.Length)
$pp = $null
$proc.WaitForExit()
if ($proc.ExitCode -ne 0) { throw 'The fresh backup did not open. Tell Claude; this should not happen.' }
Write-Host ''
Write-Host 'DONE: the passphrase in your password manager opens your backups.' -ForegroundColor Green
