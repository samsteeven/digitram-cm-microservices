# DIGITRANS-CM — Script de configuration initiale
# Copie .env.example → .env pour chaque service Node.js

$services = @("auth-gateway", "erp-service", "crm-service", "supply-chain-service")
$root = Split-Path -Parent $PSScriptRoot

foreach ($svc in $services) {
    $example = Join-Path $root "$svc\.env.example"
    $target = Join-Path $root "$svc\.env"

    if (Test-Path $example) {
        if (-not (Test-Path $target)) {
            Copy-Item $example $target
            Write-Host "✓ $svc\.env créé depuis .env.example"
        } else {
            Write-Host "• $svc\.env existe déjà, ignoré"
        }
    } else {
        Write-Warning "⚠ $svc\.env.example introuvable"
    }
}

# Installer les dépendances npm si pas déjà fait
if (-not (Test-Path (Join-Path $root "node_modules"))) {
    Write-Host "Installation des dépendances npm..."
    & "npm" "install"
}

Write-Host "`n✅ Configuration terminée."
