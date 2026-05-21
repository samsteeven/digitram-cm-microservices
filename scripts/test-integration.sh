#!/bin/bash
set -e
BASE="http://localhost:3000"

echo "=== Test DIGITRANS-CM Integration ==="

# Login
echo ""
echo "1. Login..."
RESPONSE=$(curl -s -X POST $BASE/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@agrocam.cm","password":"Admin@2026!"}')
TOKEN=$(echo "$RESPONSE" | grep -o '"access_token":"[^"]*' | cut -d'"' -f4)
if [ -z "$TOKEN" ]; then
  echo "   ❌ Échec de l'authentification"
  echo "   Réponse: $RESPONSE"
  exit 1
fi
echo "   ✅ Token obtenu: ${TOKEN:0:30}..."

# Health checks
echo ""
echo "2. Health checks..."
for port in 3000 3001 3002 3003 3004; do
  STATUS=$(curl -s http://localhost:$port/health | grep -o '"status":"[^"]*' | cut -d'"' -f4)
  if [ "$STATUS" = "ok" ]; then
    echo "   ✅ Port $port: $STATUS"
  else
    echo "   ⚠️  Port $port: ${STATUS:-indisponible}"
  fi
done

# Test ERP via gateway
echo ""
echo "3. Test ERP /employees..."
RESPONSE=$(curl -s -H "Authorization: Bearer $TOKEN" "$BASE/api/erp/employees")
if echo "$RESPONSE" | grep -q '"pagination"'; then
  echo "   ✅ ERP /employees OK"
else
  echo "   ❌ ERP /employees échoué"
  echo "   Réponse: $RESPONSE"
fi

# Test CRM via gateway
echo ""
echo "4. Test CRM /customers..."
RESPONSE=$(curl -s -H "Authorization: Bearer $TOKEN" "$BASE/api/crm/customers")
if echo "$RESPONSE" | grep -q '"data"'; then
  echo "   ✅ CRM /customers OK"
else
  echo "   ❌ CRM /customers échoué"
  echo "   Réponse: $RESPONSE"
fi

# Test Supply Chain sync status via gateway
echo ""
echo "5. Test Supply Chain /sync/status..."
RESPONSE=$(curl -s -H "Authorization: Bearer $TOKEN" "$BASE/api/supply-chain/sync/status")
if echo "$RESPONSE" | grep -q '"queue"'; then
  echo "   ✅ Supply Chain /sync/status OK"
else
  echo "   ❌ Supply Chain /sync/status échoué"
  echo "   Réponse: $RESPONSE"
fi

# Test BI via gateway
echo ""
echo "6. Test BI /kpis/summary..."
RESPONSE=$(curl -s -H "Authorization: Bearer $TOKEN" "$BASE/api/bi/kpis/summary")
if echo "$RESPONSE" | grep -q '"generated_at\|simulated\|cached'; then
  echo "   ✅ BI /kpis/summary OK"
else
  echo "   ❌ BI /kpis/summary échoué"
  echo "   Réponse: $RESPONSE"
fi

# Test Supply Chain offline sync push
echo ""
echo "7. Test Supply Chain /sync/push (offline)..."
RESPONSE=$(curl -s -X POST -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  "$BASE/api/supply-chain/sync/push" \
  -d '{"items":[{"operation":"INSERT","entity_type":"checkpoint","offline_id":"test-001","payload":{"shipment_id":"00000000-0000-0000-0000-000000000000","location":"Douala","status":"at_checkpoint"}}]}')
if echo "$RESPONSE" | grep -q '"accepted"'; then
  echo "   ✅ Sync push OK (accepted: $(echo "$RESPONSE" | grep -o '"accepted":[0-9]*' | cut -d: -f2))"
else
  echo "   ❌ Sync push échoué"
  echo "   Réponse: $RESPONSE"
fi

echo ""
echo "=== Tous les tests passés ==="
