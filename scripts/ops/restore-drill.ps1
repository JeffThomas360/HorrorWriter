<#
.SYNOPSIS
  Restore drill, part 1: prove a backup opens with your passphrase and holds the data.

.DESCRIPTION
  Decrypts the newest backup in -LocalDir (or -File), unpacks it into a temporary folder,
  counts the rows of the main tables in data.sql, then deletes the unpacked copy (unless
  -Keep). Nothing touches any database.

  Asks for the backup passphrase once. It is held in memory only and handed to gpg on stdin;
  it is never shown, logged or written to disk.

  Compare the counts with Admin → Overview → Site stats, or ask Claude to compare them with
  the live database. Close enough = the backup is good (the live site may have moved on since
  the backup was taken).

  Run it in a normal PowerShell window if the passphrase prompt won't take a paste.

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File scripts\ops\restore-drill.ps1
#>
param(
  [string]$LocalDir = 'D:\Backups\horrorwriter',
  [string]$File = '',
  [switch]$Keep,
  # Read the passphrase from piped input instead of prompting (for a password manager's CLI,
  # e.g. `bw get password … | powershell -File restore-drill.ps1 -PassphraseFromStdin`).
  [switch]$PassphraseFromStdin
)

$ErrorActionPreference = 'Stop'
$gpg = (Get-Command gpg -ErrorAction SilentlyContinue).Source
if (-not $gpg) { $gpg = 'C:\Program Files\Git\usr\bin\gpg.exe' }
if (-not (Test-Path $gpg)) { throw 'gpg not found. It comes with Git for Windows.' }

if (-not $File) {
  $newest = Get-ChildItem $LocalDir -Filter 'horrorwriter-*.tar.gz.gpg' | Sort-Object Name | Select-Object -Last 1
  if (-not $newest) { throw "No backups in $LocalDir yet." }
  $File = $newest.FullName
}
Write-Host "Backup: $File"

$work = Join-Path ([IO.Path]::GetTempPath()) ('hw-restore-drill-' + [guid]::NewGuid().ToString('N').Substring(0, 8))
New-Item -ItemType Directory $work | Out-Null
$tarball = Join-Path $work 'backup.tar.gz'

try {
  if ($PassphraseFromStdin) {
    $plain = [Console]::In.ReadLine()
  } else {
    $secure = Read-Host 'Backup passphrase (nothing shows as you type or paste)' -AsSecureString
    $plain = [Runtime.InteropServices.Marshal]::PtrToStringBSTR([Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure))
  }
  if (-not $plain) { throw 'No passphrase entered.' }

  # Hand gpg the passphrase as exact UTF-8 bytes plus "\n". Piping a string from PowerShell would
  # add "\r\n", and gpg would take the "\r" as part of the passphrase.
  $psi = New-Object Diagnostics.ProcessStartInfo
  $psi.FileName = $gpg
  $psi.Arguments = "--batch --yes --quiet --pinentry-mode loopback --passphrase-fd 0 --output `"$tarball`" --decrypt `"$File`""
  $psi.UseShellExecute = $false
  $psi.RedirectStandardInput = $true
  $psi.RedirectStandardError = $true
  # Windows PowerShell 5.1 opens the child's stdin with the console's input encoding, which can
  # write a UTF-8 byte-order mark first; gpg would read it as part of the passphrase. A UTF-8
  # encoding without one avoids that.
  $savedInputEncoding = $null
  try { $savedInputEncoding = [Console]::InputEncoding; [Console]::InputEncoding = New-Object Text.UTF8Encoding($false) } catch { }
  try { $proc = [Diagnostics.Process]::Start($psi) }
  finally { if ($savedInputEncoding) { try { [Console]::InputEncoding = $savedInputEncoding } catch { } } }
  $bytes = [Text.Encoding]::UTF8.GetBytes($plain + "`n")
  $proc.StandardInput.BaseStream.Write($bytes, 0, $bytes.Length)
  $proc.StandardInput.Close()
  [Array]::Clear($bytes, 0, $bytes.Length)
  $plain = $null
  $errText = $proc.StandardError.ReadToEnd()
  $proc.WaitForExit()
  $gpgExit = $proc.ExitCode
  $errText -split "`r?`n" | Where-Object { $_ -and $_ -notmatch 'AES256|encrypted with 1 passphrase' } |
    ForEach-Object { Write-Host "  $_" }
  if ($gpgExit -ne 0 -or -not (Test-Path $tarball) -or (Get-Item $tarball).Length -eq 0) {
    throw 'Could not decrypt. The passphrase does not match the one saved in GitHub (BACKUP_PASSPHRASE).'
  }
  Write-Host 'PASS: the passphrase opens the backup.' -ForegroundColor Green

  tar -xzf $tarball -C $work
  $data = Join-Path $work 'dump\data.sql'
  foreach ($f in 'roles', 'schema', 'data') {
    $p = Join-Path $work "dump\$f.sql"
    if (-not (Test-Path $p)) { throw "dump\$f.sql is missing from the backup." }
    Write-Host ("  {0,-11} {1,10:N0} bytes" -f "$f.sql", (Get-Item $p).Length)
  }

  # Count the rows in each COPY block: from 'COPY "schema"."table" ... FROM stdin;' to '\.'.
  $want = @('auth.users', 'public.profiles', 'public.books', 'public.book_comments', 'public.threads',
            'public.posts', 'public.series', 'public.series_books', 'public.ritual_prompts')
  $counts = [ordered]@{}
  foreach ($t in $want) { $counts[$t] = $null }
  $current = $null
  foreach ($line in [IO.File]::ReadLines($data)) {
    if ($null -eq $current) {
      if ($line -match '^COPY "([^"]+)"\."([^"]+)"') {
        $name = "$($Matches[1]).$($Matches[2])"
        if ($counts.Contains($name)) { $current = $name; $counts[$name] = 0 }
      }
    } elseif ($line -eq '\.') {
      $current = $null
    } else {
      $counts[$current]++
    }
  }
  Write-Host ''
  Write-Host 'Rows in the backup:'
  foreach ($k in $counts.Keys) {
    $v = if ($null -eq $counts[$k]) { 'not in dump' } else { $counts[$k] }
    Write-Host ("  {0,-22} {1}" -f $k, $v)
  }
  if (-not $counts['public.profiles'] -or -not $counts['public.books']) {
    throw 'The backup has no profiles or no stories. It is not usable.'
  }
  Write-Host ''
  Write-Host 'PASS: the backup holds members, stories and posts.' -ForegroundColor Green
} finally {
  if ($Keep) {
    Write-Host "Unpacked copy kept in $work. It is NOT encrypted: delete it when done."
  } else {
    Remove-Item -Recurse -Force $work -ErrorAction SilentlyContinue
    Write-Host 'Unpacked copy deleted; only the encrypted backup remains.'
  }
}
