# Runs a behaviour test against the LINKED (production) project with a not-yet-merged
# migration spliced in right after the test's own `begin;`. The test ends in `rollback;`,
# so nothing is kept. Use before opening a PR that carries a migration.
#
#   powershell -File scripts/sql/rehearse.ps1 -Test scripts/sql/test-rituals.sql -Migration supabase/migrations/<file>.sql
param(
  [Parameter(Mandatory)] [string] $Test,
  [Parameter(Mandatory)] [string] $Migration
)
$ErrorActionPreference = 'Stop'
$testSql = Get-Content -Raw $Test
$migSql  = Get-Content -Raw $Migration
if ($testSql -notmatch '(?m)^begin;\r?$') { throw "$Test has no line 'begin;' to splice after" }
if ($testSql -notmatch '(?m)^rollback;\r?\s*$') { throw "$Test does not end in rollback; refusing to run" }
# A MatchEvaluator, not a replacement string: in a replacement string `$$` means a
# literal `$`, which would mangle every `as $$` body in the migration.
$splice = "begin;`n$migSql`n"
$combined = [regex]::new('(?m)^begin;\r?$').Replace($testSql, [Text.RegularExpressions.MatchEvaluator]{ param($m) $splice }, 1)
$tmp = Join-Path ([IO.Path]::GetTempPath()) ("rehearse-" + [guid]::NewGuid() + ".sql")
# UTF-8 without BOM on both Windows PowerShell 5.1 and PowerShell 7.
[IO.File]::WriteAllText($tmp, $combined, [Text.UTF8Encoding]::new($false))
try {
  cmd /c "npx supabase db query --linked -f `"$tmp`""
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
} finally { Remove-Item $tmp -ErrorAction SilentlyContinue }
