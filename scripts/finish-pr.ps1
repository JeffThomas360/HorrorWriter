# Finish a Claude-prepared PR: clean sandbox git litter, sync main, update the branch, test, merge.
# Usage: .\scripts\finish-pr.ps1 -Pr 26 -Branch seo/metadata-copy-audit
param([Parameter(Mandatory)][int]$Pr, [Parameter(Mandatory)][string]$Branch)
$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot\..

# $ErrorActionPreference does not stop on a failing native command (git, gh,
# npm), so every step that matters checks the exit code.
function Invoke-Step([string]$What, [scriptblock]$Cmd) {
  & $Cmd
  if ($LASTEXITCODE -ne 0) { throw "$What failed (exit $LASTEXITCODE) - stopping." }
}

# 1. Git litter the Linux sandbox can't delete
Remove-Item .git\HEAD.lock, .git\index.lock -Force -ErrorAction SilentlyContinue
Get-ChildItem .git\objects -Recurse -Filter 'tmp_obj_*' -ErrorAction SilentlyContinue | Remove-Item -Force
Remove-Item -Recurse -Force _to_delete -ErrorAction SilentlyContinue

# 2. Refuse to run over uncommitted work. This used to `git checkout -- .`,
#    which silently discarded any edits in the working tree.
$dirty = git status --porcelain --untracked-files=no
if ($dirty) {
  Write-Host "Uncommitted changes in tracked files:`n$dirty"
  throw "Commit or stash them first - not touching the working tree."
}

Invoke-Step 'checkout main' { git checkout main }
Invoke-Step 'pull main'     { git pull --ff-only }

# 3. Bring the branch up to date with main (GitHub requires it), push
Invoke-Step "checkout $Branch" { git checkout $Branch }
Invoke-Step 'merge main'       { git merge main --no-edit }
Invoke-Step 'push'             { git push }

# 4. Tests must pass locally before merge
Invoke-Step 'Unit tests' { npm run test:unit }

# 5. Merge and return to a fresh main
Invoke-Step 'gh pr merge' { gh pr merge $Pr --squash --delete-branch }
Invoke-Step 'checkout main' { git checkout main }
Invoke-Step 'pull main'     { git pull --ff-only }
Write-Host "`nPR #$Pr merged. main is at $(git rev-parse --short HEAD)."
