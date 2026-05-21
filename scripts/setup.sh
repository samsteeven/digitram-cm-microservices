#!/usr/bin/env bash
# DIGITRANS-CM — Script de configuration initiale (Linux/Mac)
set -euo pipefail

SERVICES=("auth-gateway" "erp-service" "crm-service" "supply-chain-service")
ROOT="$(cd "$(dirname "$0")/.." && pwd)"

for svc in "${SERVICES[@]}"; do
    EXAMPLE="$ROOT/$svc/.env.example"
    TARGET="$ROOT/$svc/.env"
    if [ -f "$EXAMPLE" ] && [ ! -f "$TARGET" ]; then
        cp "$EXAMPLE" "$TARGET"
        echo "✓ $svc/.env créé depuis .env.example"
    elif [ -f "$TARGET" ]; then
        echo "• $svc/.env existe déjà, ignoré"
    else
        echo "⚠ $svc/.env.example introuvable"
    fi
done

if [ ! -d "$ROOT/node_modules" ]; then
    echo "Installation des dépendances npm..."
    npm install
fi

echo "✅ Configuration terminée."
