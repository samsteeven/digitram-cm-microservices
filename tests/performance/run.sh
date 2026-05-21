#!/usr/bin/env bash
# DIGITRANS-CM — Exécution des tests de performance
# Usage: bash tests/performance/run.sh [url] [duration]
#   url: Base URL (default: http://localhost:3000)
#   duration: Durée du test (default: 10m)

set -euo pipefail

BASE_URL="${1:-http://localhost:3000}"
DURATION="${2:-10m}"
RESULTS_DIR="tests/performance/results"
TIMESTAMP=$(date +%Y%m%d-%H%M%S)

echo "═ DIGITRANS-CM — Tests de performance ═"
echo "URL cible : $BASE_URL"
echo "Durée      : $DURATION"
echo "Résultats  : $RESULTS_DIR/$TIMESTAMP"
echo ""

mkdir -p "$RESULTS_DIR/$TIMESTAMP"

# Vérifier que K6 est installé
if ! command -v k6 &> /dev/null; then
    echo "❌ K6 n'est pas installé."
    echo "   Installation :"
    echo "   macOS : brew install k6"
    echo "   Linux : https://k6.io/docs/getting-started/installation/"
    echo "   Windows : winget install k6"
    exit 1
fi

# Vérifier que les services sont joignables
echo "→ Vérification des health checks..."
for svc in auth-gateway erp-service crm-service supply-chain-service bi-service; do
    STATUS=$(curl -sf "$BASE_URL/health" 2>/dev/null && echo "ok" || echo "down")
    echo "  $svc : $STATUS"
done

echo ""
echo "═ Test 1 : Montée en charge progressive ═"
k6 run tests/performance/load-test.js \
    -e BASE_URL="$BASE_URL" \
    --out json="$RESULTS_DIR/$TIMESTAMP/load-test.json" \
    --summary-export="$RESULTS_DIR/$TIMESTAMP/load-test-summary.json"

echo ""
echo "═ Test 2 : Test de stress ═"
k6 run tests/performance/stress-test.js \
    -e BASE_URL="$BASE_URL" \
    --out json="$RESULTS_DIR/$TIMESTAMP/stress-test.json" \
    --summary-export="$RESULTS_DIR/$TIMESTAMP/stress-test-summary.json"

echo ""
echo "═ Résultats ═"
echo "Rapports : $RESULTS_DIR/$TIMESTAMP/"
echo ""
echo "Pour visualiser les résultats :"
echo "  k6 run --out dashboard tests/performance/load-test.js"
echo ""
echo "✅ Tests terminés."
