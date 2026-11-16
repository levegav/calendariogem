# Ejecuta la CLI de Supabase contra el proyecto REAL de calendariogem
# usando el token de ESTA cuenta, sin tocar la sesión global de la CLI
# (que sigue conectada a la cuenta de oficina/nacente).
#
# Uso:   npm run remoto -- db push --linked --dry-run
#        npm run remoto -- migration list --linked
#
# Requiere el archivo .env.supabase (no se sube a Git) con:
#   SUPABASE_ACCESS_TOKEN=sbp_...        (Supabase > Account > Access Tokens)
#   SUPABASE_DB_PASSWORD=...             (contraseña de la base de datos)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$envFile = Join-Path $root '.env.supabase'

if (-not (Test-Path $envFile)) {
  Write-Error "Falta $envFile. Créelo con SUPABASE_ACCESS_TOKEN y SUPABASE_DB_PASSWORD (ver README)."
}

foreach ($line in Get-Content $envFile) {
  if ($line -match '^\s*([A-Z_]+)\s*=\s*(.*)\s*$') {
    Set-Item -Path "Env:$($Matches[1])" -Value $Matches[2].Trim('"')
  }
}

if (-not $env:SUPABASE_ACCESS_TOKEN) { Write-Error 'Falta SUPABASE_ACCESS_TOKEN en .env.supabase.' }

Push-Location $root
try {
  npx supabase @args
  exit $LASTEXITCODE
} finally {
  Pop-Location
}
