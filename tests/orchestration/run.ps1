param([string]$Database = ('orchestration_proof_' + (Get-Date -Format yyyyMMddHHmmss)))
$ErrorActionPreference = 'Stop'
$repo = (Resolve-Path (Join-Path $PSScriptRoot '../..')).Path
$psql = 'C:/Program Files/PostgreSQL/16/bin/psql.exe'
$createdb = 'C:/Program Files/PostgreSQL/16/bin/createdb.exe'
# Local disposable fixture database only. Never pass a production host or URL.
& $createdb -h 127.0.0.1 -p 57432 -U postgres $Database
if ($LASTEXITCODE -ne 0) { throw 'Local database creation failed' }
$proofArgs = @('-X','-h','127.0.0.1','-p','57432','-U','postgres','-d',$Database,'-v','ON_ERROR_STOP=1')
$files = @('tests/orchestration/bootstrap.sql','supabase/migrations/20261201000700_solo_orchestration_authority.sql','supabase/migrations/20261201000700_solo_orchestration_authority.sql','tests/orchestration/lifecycle.sql','tests/orchestration/authorization.sql','tests/orchestration/resilience.sql')
foreach ($relative in $files) {
 & $psql @proofArgs -f (Join-Path $repo $relative)
 if ($LASTEXITCODE -ne 0) { throw "Proof failed: $relative" }
}
& node (Join-Path $repo 'tests/orchestration/concurrency.mjs') $Database
if ($LASTEXITCODE -ne 0) { throw 'Concurrency proof failed' }
Write-Output "PASS: local schema replay and orchestration SQL contracts ($Database). Fixture auth and encryption are stand-ins; no provider proof."
