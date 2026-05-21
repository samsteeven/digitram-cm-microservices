# INSTRUCTIONS AGENT — BLOC 02 : Compléter les microservices DIGITRANS-CM

> Ce fichier est destiné à l'agent de code (Claude Code ou autre).
> La structure de base est posée. Voici exactement ce qu'il reste à implémenter.

---

## CONTEXTE

Projet : DIGITRANS-CM — Architecture microservices pour AGROCAM S.A.
Stack : Node.js 20 + Express + PostgreSQL + Redis
Auth : JWT via Auth Gateway (port 3000), headers X-User-Id/X-User-Role injectés en aval

La structure de base est en place. Tu dois compléter chaque service.

---

## FICHIERS DÉJÀ CRÉÉS (ne pas réécrire)

- `docker-compose.yml` — stack complète
- `.env.dev`, `.env.test`, `.env.prod` — 3 environnements
- `scripts/init-db.sql` — schémas BDD complets
- `auth-gateway/` — 100% complet (index.js, routes auth + proxy, middleware JWT)
- `erp-service/src/routes/employee.routes.js` — complet
- `supply-chain-service/src/sync/sync.worker.js` — complet
- `supply-chain-service/src/routes/sync.routes.js` — complet
- `bi-service/src/routes/dashboard.routes.js` — complet
- `.github/workflows/ci-cd.yml` — pipeline complet
- `README.md` — documentation complète

---

## CE QUI RESTE À IMPLÉMENTER

### 1. FICHIERS MANQUANTS COMMUNS À TOUS LES SERVICES

Pour chaque service (`erp-service`, `crm-service`, `supply-chain-service`, `bi-service`) créer :

#### `config/db.js` (copier depuis erp-service/config/db.js — identique pour tous)
#### `config/redis.js`
```javascript
const { createClient } = require("redis");
let client = null;
async function connectRedis() {
  client = createClient({ url: process.env.REDIS_URL });
  client.on("error", err => console.error("Redis error:", err.message));
  await client.connect();
  return client;
}
function getRedis() {
  if (!client) throw new Error("Redis non initialisé");
  return client;
}
module.exports = { connectRedis, getRedis };
```

#### `src/middleware/error.middleware.js` (identique pour tous les services)
```javascript
function errorHandler(err, req, res, next) {
  const status = err.status || 500;
  console.error({ timestamp: new Date().toISOString(), error: err.message, path: req.path });
  return res.status(status).json({ error: process.env.NODE_ENV === "production" && status === 500 ? "Erreur interne." : err.message });
}
module.exports = { errorHandler };
```

#### `src/middleware/user.middleware.js` (copier depuis erp-service — identique pour tous)

---

### 2. ERP SERVICE — Routes manquantes

**Fichier : `erp-service/src/routes/accounting.routes.js`**

Implémenter les routes CRUD pour les écritures comptables :
- `GET /accounting` — liste paginée, filtres : `entry_type`, `fiscal_year`, `date_from`, `date_to`
- `GET /accounting/:id` — détail d'une écriture
- `POST /accounting` — créer une écriture (champs : `entry_ref`, `entry_type`, `amount`, `currency`, `description`, `entry_date`, `fiscal_year`)
- `GET /accounting/summary/:year` — total débits/crédits/solde pour un exercice fiscal
- Rôles autorisés : `admin`, `manager`, `comptable`
- Validation Joi sur tous les inputs
- Annotations Swagger `@swagger` sur chaque route

**Fichier : `erp-service/src/routes/purchase-order.routes.js`**

Routes CRUD pour les bons de commande :
- `GET /purchase-orders` — liste, filtres : `status`, `supplier_name`, `date_from`, `date_to`
- `GET /purchase-orders/:id` — détail
- `POST /purchase-orders` — créer (champs : `order_ref`, `supplier_name`, `total_amount`, `currency`, `order_date`, `delivery_date`)
- `PATCH /purchase-orders/:id/status` — changer le statut (`pending`→`approved`→`delivered`|`cancelled`)
- Rôles autorisés : `admin`, `manager`, `comptable`
- Swagger annoté

**Fichier : `erp-service/src/index.js`**
Déjà montré dans l'exemple ci-dessus. À créer identique.

**`erp-service/package.json`** — déjà créé ✅

---

### 3. CRM SERVICE — Tout à créer

**Fichier : `crm-service/src/index.js`** (même pattern qu'erp-service, PORT=3002)

**Fichier : `crm-service/package.json`**
```json
{
  "name": "crm-service",
  "dependencies": { ...même dépendances qu'erp-service... }
}
```

**Fichier : `crm-service/src/routes/customer.routes.js`**

Routes CRUD clients :
- `GET /customers` — liste paginée, filtres : `city`, `segment` (`vip`|`premium`|`standard`)
- `GET /customers/:id` — détail client avec ses dernières commandes (JOIN)
- `POST /customers` — créer (champs : `customer_ref`, `full_name`, `email`, `phone`, `city`, `segment`)
- `PATCH /customers/:id` — mise à jour partielle
- `GET /customers/:id/orders` — historique commandes d'un client
- `POST /customers/:id/loyalty` — ajouter des points de fidélité (`{ points: number }`)
- Rôles autorisés : `admin`, `manager`, `agent_terrain`
- Swagger annoté

**Fichier : `crm-service/src/routes/order.routes.js`**

Routes CRUD commandes SavoirManger :
- `GET /orders` — liste, filtres : `status`, `restaurant`, `order_type`, `date`
- `GET /orders/:id` — détail avec les items (JOIN order_items)
- `POST /orders` — créer commande avec ses items
  ```json
  {
    "customer_id": "uuid",
    "restaurant": "SavoirManger Bonanjo",
    "order_type": "dine-in",
    "items": [
      { "product_name": "Poulet DG", "quantity": 2, "unit_price": 3500 }
    ]
  }
  ```
  → Insérer dans `orders` + `order_items` dans une transaction
- `PATCH /orders/:id/status` — faire avancer le statut (`pending`→`confirmed`→`preparing`→`ready`→`delivered`)
- `GET /orders/stats/by-restaurant` — CA et nombre de commandes par restaurant (derniers 30 jours)
- Rôles autorisés : `admin`, `manager`, `agent_terrain`
- Swagger annoté

---

### 4. SUPPLY CHAIN SERVICE — Routes manquantes

**Fichier : `supply-chain-service/src/index.js`** — créer (déjà montré ci-dessus)

**Fichier : `supply-chain-service/package.json`**
Mêmes dépendances qu'erp-service.

**Fichier : `supply-chain-service/src/routes/shipment.routes.js`**

Routes CRUD expéditions :
- `GET /shipments` — liste, filtres : `status`, `origin`, `destination`, `synced`
- `GET /shipments/:id` — détail avec checkpoints (JOIN)
- `POST /shipments` — créer (champs : `shipment_ref`, `origin`, `destination`, `product_type`, `quantity`, `unit`, `carrier`, `departure_date`, `expected_arrival`)
- `PATCH /shipments/:id/status` — mettre à jour le statut
- `GET /shipments/pending-sync` — expéditions non synchronisées (pour le dashboard offline)
- Rôles autorisés : `admin`, `manager`, `agent_terrain`
- Swagger annoté

**Fichier : `supply-chain-service/src/routes/checkpoint.routes.js`**

Routes pour les points de contrôle :
- `GET /checkpoints?shipment_id=:id` — checkpoints d'une expédition
- `POST /checkpoints` — enregistrer un checkpoint (en ligne)
  - Champs : `shipment_id`, `location`, `latitude`, `longitude`, `status`, `notes`
  - Met à jour le statut de l'expédition parente si nécessaire
- Rôles autorisés : `admin`, `manager`, `agent_terrain`
- Swagger annoté

**Fichier : `supply-chain-service/config/redis.js`** — créer (pattern ci-dessus)

---

### 5. BI SERVICE — Routes manquantes

**Fichier : `bi-service/src/index.js`** — créer (déjà montré ci-dessus)

**Fichier : `bi-service/package.json`**
Mêmes dépendances + `axios` (pour appeler les autres services si besoin).

**Fichier : `bi-service/src/routes/kpi.routes.js`**

Routes KPIs :
- `GET /kpis/snapshot?date=YYYY-MM-DD` — snapshot KPIs pour une date donnée (depuis `kpi_snapshots`)
- `GET /kpis/trend?metric=:name&module=:module&days=30` — évolution d'un KPI sur N jours
- `POST /kpis/snapshot` — déclencher un snapshot manuel (admin uniquement)
  - Appeler les autres services via leurs URLs internes
  - Agréger et insérer dans `kpi_snapshots`
- `GET /kpis/summary` — résumé des KPIs clés du jour (uptime simulé, latence P95 simulée, error rate)
  - Résultats mis en cache Redis 5 minutes
- Rôles autorisés : `admin`, `manager`, `analyste`
- Swagger annoté

**Fichier : `bi-service/config/redis.js`** — créer

---

### 6. TESTS À ÉCRIRE

Pour chaque service, créer un fichier de test :

**`auth-gateway/__tests__/auth.test.js`**
```javascript
// Tester :
// POST /auth/login — credentials valides → 200 + JWT
// POST /auth/login — credentials invalides → 401
// POST /auth/login — données manquantes → 400
// GET /auth/me — avec token valide → 200 + profil
// GET /auth/me — sans token → 401
// POST /auth/logout — révoquer le token → 200
// GET /auth/me — avec token révoqué → 401
```

**`erp-service/__tests__/employee.test.js`**
```javascript
// Tester (mocker la BDD avec jest.mock) :
// GET /employees — sans auth → 401
// GET /employees — avec rôle agent_terrain → 403
// GET /employees — avec rôle manager → 200 + tableau
// POST /employees — données valides → 201
// POST /employees — données invalides → 400
// PATCH /employees/:id — mise à jour → 200
// DELETE /employees/:id — soft delete → 200
```

**`supply-chain-service/__tests__/sync.test.js`**
```javascript
// Tester :
// POST /sync/push — array valide → 202 + accepted count
// POST /sync/push — items invalides → 202 + rejected count
// GET /sync/status → 200 + queue lengths
// processQueueItem — checkpoint INSERT → insère en BDD
// processQueueItem — doublon offline_id → skipped: true
```

---

### 7. OPENAPI SPEC — Auth Gateway

**Fichier : `auth-gateway/docs/openapi.yaml`**

Créer la spec OpenAPI 3.0 complète pour le Gateway :
```yaml
openapi: "3.0.0"
info:
  title: DIGITRANS-CM Auth Gateway
  version: "1.0.0"
paths:
  /auth/login: { post: { ... } }
  /auth/refresh: { post: { ... } }
  /auth/logout: { post: { ... } }
  /auth/me: { get: { ... } }
  /health: { get: { ... } }
  /api/erp/{path}: { description: "Proxy vers ERP Service" }
  /api/crm/{path}: { description: "Proxy vers CRM Service" }
  /api/supply-chain/{path}: { description: "Proxy vers Supply Chain" }
  /api/bi/{path}: { description: "Proxy vers BI Service" }
components:
  securitySchemes:
    BearerAuth: { type: http, scheme: bearer, bearerFormat: JWT }
  schemas:
    LoginRequest: { ... }
    LoginResponse: { ... }
    ErrorResponse: { ... }
```

---

## RÈGLES IMPORTANTES À RESPECTER

1. **Toutes les routes** des services en aval lisent `req.user` depuis les headers injectés par le gateway (via `user.middleware.js`), jamais depuis un header Authorization direct.

2. **Validation Joi** sur TOUS les inputs POST/PATCH. Retourner 400 avec message clair si invalide.

3. **Transactions PostgreSQL** pour toute opération multi-tables (ex: créer commande + items CRM).

4. **Cache Redis** sur toutes les routes BI avec TTL 5 minutes. Clé : `bi:{route}:{params}:{date_heure}`.

5. **Annotations Swagger `@swagger`** sur chaque route (JSDoc). Le swagger-jsdoc les collecte automatiquement.

6. **Soft delete** partout (status `inactive`/`cancelled`) — jamais de DELETE SQL sauf si explicitement demandé.

7. **Gestion erreurs** : toujours `next(err)` dans les catch, jamais de `res.status(500)` direct.

8. **Logs structurés JSON** en production, pretty en dev (via `morgan` + `LOG_FORMAT` env).

9. **Pas de `console.log` "debug"** dans le code final — uniquement `console.error` et `console.warn` avec contexte.

---

## ORDRE D'IMPLÉMENTATION RECOMMANDÉ

```
1. Créer config/db.js et config/redis.js dans les 3 services manquants
2. Créer les middlewares error.middleware.js et user.middleware.js manquants
3. Créer package.json des services manquants (crm, supply-chain, bi)
4. Créer src/index.js des services manquants
5. Implémenter les routes ERP manquantes (accounting, purchase-orders)
6. Implémenter les routes CRM (customer, order)
7. Implémenter les routes Supply Chain (shipment, checkpoint)
8. Implémenter les routes BI (kpi)
9. Écrire les tests
10. Créer l'openapi.yaml du gateway
11. Vérifier que `docker compose up` démarre tout sans erreur
12. Vérifier tous les /health endpoints
```

---

## COMMANDES DE VÉRIFICATION FINALE

```bash
# Tout démarrer
docker compose --env-file .env.dev up -d

# Vérifier les 5 health checks
for port in 3000 3001 3002 3003 3004; do
  echo "Port $port: $(curl -s http://localhost:$port/health | jq .status)"
done

# Test login
TOKEN=$(curl -s -X POST http://localhost:3000/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@agrocam.cm","password":"Admin@2026!"}' | jq -r .access_token)

# Test appel ERP via gateway
curl -H "Authorization: Bearer $TOKEN" http://localhost:3000/api/erp/employees

# Test sync offline supply chain
curl -X POST -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  http://localhost:3000/api/supply-chain/sync/push \
  -d '{"items":[{"operation":"INSERT","entity_type":"checkpoint","offline_id":"test-001","payload":{"shipment_id":"uuid","location":"Test","status":"at_checkpoint"}}]}'
```

---

*Ce fichier est l'unique source de vérité pour l'agent. Tout ce qui n'est pas mentionné ici est déjà implémenté.*
