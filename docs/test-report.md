# DIGITRANS-CM — Rapport de tests

**Date :** 21 Mai 2026  
**Node.js :** v25.0.0 · **npm :** 11.7.0 · **Python :** 3.14.2  
**Commande :** `npm test` (23 tests · 4 workspaces · 3 suites)

---

## 1. Auth Gateway — 8 tests ✅

| # | Test | Endpoint | Statut |
|---|------|----------|--------|
| 1 | Credentials valides → 200 + JWT | `POST /auth/login` | ✅ |
| 2 | Credentials invalides → 401 | `POST /auth/login` | ✅ |
| 3 | Données manquantes → 400 | `POST /auth/login` | ✅ |
| 4 | Token valide → 200 + profil | `GET /auth/me` | ✅ |
| 5 | Sans token → 401 | `GET /auth/me` | ✅ |
| 6 | Révoquer le token → 200 | `POST /auth/logout` | ✅ |
| 7 | Token révoqué → 401 | `GET /auth/me` | ✅ |
| 8 | Health check → 200 | `GET /health` | ✅ |

**Capture d'écran :**
```
PASS __tests__/auth.test.js
  Auth Gateway — POST /auth/login
    √ credentials valides → 200 + JWT (82 ms)
    √ credentials invalides → 401 (16 ms)
    √ données manquantes → 400 (14 ms)
  Auth Gateway — GET /auth/me
    √ avec token valide → 200 + profil (15 ms)
    √ sans token → 401 (12 ms)
  Auth Gateway — POST /auth/logout
    √ révoquer le token → 200 (13 ms)
  Auth Gateway — GET /auth/me avec token révoqué
    √ token révoqué → 401 (11 ms)
  Auth Gateway — GET /health
    √ GET /health → 200, status ok (17 ms)
```

---

## 2. ERP Service — 9 tests ✅

| # | Test | Endpoint | Statut |
|---|------|----------|--------|
| 1 | Sans `x-user-role` → 401 | `GET /employees` | ✅ |
| 2 | Rôle `agent_terrain` → 403 | `GET /employees` | ✅ |
| 3 | Rôle `manager` → 200 | `GET /employees` | ✅ |
| 4 | Employé existant → 200 | `GET /employees/:id` | ✅ |
| 5 | Employé inexistant → 404 | `GET /employees/:id` | ✅ |
| 6 | Création valide → 201 | `POST /employees` | ✅ |
| 7 | Données invalides (Joi) → 400 | `POST /employees` | ✅ |
| 8 | Mise à jour → 200 | `PATCH /employees/:id` | ✅ |
| 9 | Suppression → 200 | `DELETE /employees/:id` | ✅ |

**Capture d'écran :**
```
PASS __tests__/employee.test.js
  ERP Employees Tests
    GET /employees
      √ sans x-user-role → 401 (71 ms)
      √ avec x-user-role: agent_terrain → 403 (13 ms)
      √ avec x-user-role: manager → 200, data array (13 ms)
    GET /employees/:id
      √ existant avec x-user-role: manager → 200 (11 ms)
      √ inexistant → 404 (12 ms)
    POST /employees
      √ données valides avec x-user-role: admin → 201 (30 ms)
      √ données invalides (email manquant) → 400 (20 ms)
    PATCH /employees/:id
      √ avec x-user-role: manager → 200 (15 ms)
    DELETE /employees/:id
      √ avec x-user-role: admin → 200 (15 ms)
```

---

## 3. Supply Chain — 6 tests ✅

| # | Test | Fonction | Statut |
|---|------|----------|--------|
| 1 | INSERT checkpoint (nouveau) → BDD | `processQueueItem` | ✅ |
| 2 | INSERT checkpoint (doublon) → skipped | `processQueueItem` | ✅ |
| 3 | UPDATE shipment_status → SQL | `processQueueItem` | ✅ |
| 4 | Body valide (2 items) → 202 `accepted: 2` | `POST /sync/push` | ✅ |
| 5 | Body invalide → 202 `rejected: 1` | `POST /sync/push` | ✅ |
| 6 | Body vide → 400 | `POST /sync/push` | ✅ |

**Capture d'écran :**
```
PASS __tests__/sync.test.js
  Sync Worker — processQueueItem
    √ INSERT checkpoint avec offline_id nouveau → insère en BDD (5 ms)
    √ INSERT checkpoint avec offline_id existant → retourne { skipped: true } (5 ms)
    √ UPDATE shipment_status → appelle UPDATE SQL (2 ms)
  Sync Route — POST /sync/push
    √ Body valide avec 2 items → 202, accepted: 2 (73 ms)
    √ Body avec 1 item invalide (entity_type absent) → 202, accepted: 0, rejected: 1 (15 ms)
    √ Body vide → 400 (11 ms)
```

---

## 4. CRM Service — pas de tests pour l'instant ⏳

Le CRM Service est fonctionnel mais ne dispose pas encore de tests automatisés. À implémenter en priorité.

---

## 5. BI Service (Python) — pas de tests pour l'instant ⏳

Le BI Service (Python/FastAPI) est fonctionnel. Les tests pytest seront ajoutés ultérieurement.

---

## 6. Lint — 0 erreurs ✅

```
npm run lint --workspaces --if-present
# Résultat : 0 erreurs, 0 warnings
# Config : ESLint 8 (eslint:recommended)
# Règles : no-console (sauf warn/error), no-unused-vars (sauf _args)
```

---

## 7. Résumé consolidé

```
Test Suites: 3 passed, 3 total
Tests:       23 passed, 23 total
Time:        4.5 s
```

| Métrique | Valeur |
|----------|--------|
| Suites de tests | 3 |
| Tests unitaires | 23 |
| Services couverts | Auth Gateway, ERP, Supply Chain |
| Temps d'exécution | ~4.5 secondes |
| Couverture ESLint | 4 services Node.js (0 erreurs) |
| Couverture ruff (Python) | 1 service (à intégrer) |

---

## 8. Tests fonctionnels manuels

### 8.1. Health checks

```bash
curl http://localhost:3000/health
# {"service":"auth-gateway","status":"ok","timestamp":"2026-05-21T10:00:00.000Z"}

curl http://localhost:3001/health
# {"service":"erp-service","status":"ok","timestamp":"..."}

curl http://localhost:3002/health
# {"service":"crm-service","status":"ok","timestamp":"..."}

curl http://localhost:3003/health
# {"service":"supply-chain-service","status":"ok","timestamp":"..."}

curl http://localhost:3004/health
# {"service":"bi-service","status":"ok","timestamp":"..."}
```

### 8.2. Cycle complet (login → appel protégé → logout)

```bash
# 1. Login
TOKEN=$(curl -s -X POST http://localhost:3000/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@agrocam.cm","password":"Admin@2026!"}' | jq -r '.access_token')

# 2. Appel protégé
curl -s http://localhost:3000/api/erp/employees \
  -H "Authorization: Bearer $TOKEN" | jq '.'
# → [{ "id": "...", "name": "...", ... }]

# 3. Logout
curl -s -X POST http://localhost:3000/auth/logout \
  -H "Authorization: Bearer $TOKEN"
# → { "message": "Déconnecté." }

# 4. Vérification (token révoqué)
curl -s http://localhost:3000/api/erp/employees \
  -H "Authorization: Bearer $TOKEN"
# → 401 Unauthorized
```

### 8.3. Offline sync

```bash
curl -X POST http://localhost:3000/api/supply-chain/sync/push \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"items":[
    {"operation":"INSERT","entity_type":"checkpoint",
     "offline_id":"uuid-test","payload":{"shipment_id":"...",
     "location":"Test","latitude":5.47,"longitude":10.41,
     "status":"at_checkpoint"}}
  ]}'
# → { "accepted": 1, "rejected": 0 }
```

---

*Rapport généré le 21 Mai 2026 — Projet DIGITRANS-CM*
