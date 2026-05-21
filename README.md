# DIGITRANS-CM — Microservices AGROCAM S.A.

> **Projet d'examen EADL 4 — BC04/EC04 — Mai 2026**  
> Optimiser le SI par le Cloud Computing — CAMTECH SOLUTIONS S.A.

---

## Table des matières

1. [Architecture globale](#architecture-globale)
2. [Prérequis](#prérequis)
3. [Démarrage rapide (local)](#démarrage-rapide-local)
4. [Structure du projet](#structure-du-projet)
5. [Microservices](#microservices)
6. [Authentification JWT](#authentification-jwt)
7. [Offline-first (Supply Chain)](#offline-first-supply-chain)
8. [Variables d'environnement](#variables-denvironnement)
9. [Tests](#tests)
10. [CI/CD Pipeline](#cicd-pipeline)
11. [Déploiement AWS](#déploiement-aws)

---

## Architecture globale

```
Internet
    │ HTTPS
    ▼
Auth Gateway (Port 3000)         ← JWT + OAuth2 + Rate Limiting
    │ Reverse Proxy (vérification rôle)
    ├─── /api/erp          → ERP Service         (Port 3001)
    ├─── /api/crm          → CRM Service         (Port 3002)
    ├─── /api/supply-chain → Supply Chain Service (Port 3003)
    └─── /api/bi           → BI Service          (Port 3004)

Infrastructure :
    ├─── PostgreSQL (Port 5432) — 4 bases séparées
    └─── Redis      (Port 6379) — cache + offline queue
```

**Cloud hybride :**
- AWS `af-south-1` (Cape Town) → ECS, RDS PostgreSQL, S3, ALB
- Azure South Africa North → Azure AD, Azure Monitor, Azure DevOps
- On-premise Douala → données RH/financières (conformité loi n°2010/012)

---

## Prérequis

| Outil | Version minimale |
|-------|-----------------|
| Node.js | 20 LTS |
| Docker | 24+ |
| Docker Compose | 2.20+ |
| npm | 10+ |

---

## Démarrage rapide (local)

```bash
# 1. Cloner le dépôt
git clone https://github.com/camtech-solutions/digitrans-cm.git
cd digitrans-cm

# 2. Copier le fichier d'environnement de développement
cp .env.dev .env

# 3. Démarrer toute la stack (BDD + Redis + 5 services)
docker compose up -d

# 4. Vérifier que tous les services sont UP
docker compose ps
curl http://localhost:3000/health   # Auth Gateway
curl http://localhost:3001/health   # ERP Service
curl http://localhost:3002/health   # CRM Service
curl http://localhost:3003/health   # Supply Chain
curl http://localhost:3004/health   # BI Service

# 5. Accéder aux Swagger UI
open http://localhost:3000/api-docs  # Gateway
open http://localhost:3001/api-docs  # ERP
open http://localhost:3002/api-docs  # CRM
open http://localhost:3003/api-docs  # Supply Chain
open http://localhost:3004/api-docs  # BI
```

---

## Structure du projet

```
digitrans-cm/
├── auth-gateway/           # Gateway OAuth2/JWT + reverse proxy
│   ├── src/
│   │   ├── routes/         # auth.routes.js, proxy.routes.js
│   │   ├── middleware/     # auth.middleware.js, error.middleware.js
│   │   └── utils/          # redis.client.js
│   ├── Dockerfile
│   └── package.json
│
├── erp-service/            # RH, Comptabilité, Approvisionnements
│   ├── src/
│   │   ├── routes/         # employee.routes.js, accounting.routes.js, purchase-order.routes.js
│   │   ├── controllers/    # (à implémenter)
│   │   ├── models/         # (à implémenter)
│   │   └── middleware/     # user.middleware.js, error.middleware.js
│   ├── config/             # db.js
│   ├── Dockerfile
│   └── package.json
│
├── crm-service/            # Gestion clients SavoirManger
│   ├── src/
│   │   ├── routes/         # customer.routes.js, order.routes.js
│   │   └── middleware/
│   ├── config/
│   ├── Dockerfile
│   └── package.json
│
├── supply-chain-service/   # Suivi flux marchandises (offline-first)
│   ├── src/
│   │   ├── routes/         # shipment.routes.js, checkpoint.routes.js, sync.routes.js
│   │   ├── sync/           # sync.worker.js ← cœur offline-first
│   │   └── middleware/
│   ├── config/
│   ├── Dockerfile
│   └── package.json
│
├── bi-service/             # Agrégation + tableaux de bord
│   ├── src/
│   │   ├── routes/         # dashboard.routes.js, kpi.routes.js
│   │   └── aggregators/    # (à implémenter)
│   ├── config/
│   ├── Dockerfile
│   └── package.json
│
├── scripts/
│   └── init-db.sql         # Initialisation des schémas PostgreSQL
├── .github/workflows/
│   └── ci-cd.yml           # Pipeline GitHub Actions
├── docker-compose.yml      # Stack locale complète
├── .env.dev                # Variables développement
├── .env.test               # Variables CI/CD
└── .env.prod               # Template production (valeurs via Secrets Manager)
```

---

## Microservices

| Service | Port | Rôle | Base de données |
|---------|------|------|-----------------|
| `auth-gateway` | 3000 | Auth centralisée + proxy | Redis |
| `erp-service` | 3001 | RH, comptabilité, approvisionnements | `erp_db` |
| `crm-service` | 3002 | Clients SavoirManger, commandes | `crm_db` |
| `supply-chain-service` | 3003 | Flux marchandises, offline-first | `supply_db` |
| `bi-service` | 3004 | KPIs, tableaux de bord | `bi_db` + cache Redis |

---

## Authentification JWT

### Login

```bash
curl -X POST http://localhost:3000/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@agrocam.cm","password":"Admin@2026!"}'
```

Réponse :
```json
{
  "access_token": "eyJhbGciOiJIUzI1NiIs...",
  "refresh_token": "uuid-v4",
  "token_type": "Bearer",
  "expires_in": "8h"
}
```

### Appel authentifié

```bash
TOKEN="eyJhbGciOiJIUzI1NiIs..."
curl http://localhost:3000/api/erp/employees \
  -H "Authorization: Bearer $TOKEN"
```

### Rôles disponibles

| Rôle | Accès ERP | Accès CRM | Accès Supply Chain | Accès BI |
|------|-----------|-----------|-------------------|----------|
| `admin` | ✅ | ✅ | ✅ | ✅ |
| `manager` | ✅ | ✅ | ✅ | ✅ |
| `comptable` | ✅ | ❌ | ❌ | ❌ |
| `agent_terrain` | ❌ | ✅ | ✅ | ❌ |
| `analyste` | ❌ | ❌ | ❌ | ✅ |

---

## Offline-first (Supply Chain)

Pour les agents terrain en zone de faible connectivité :

```bash
# Pousser des données collectées hors ligne
curl -X POST http://localhost:3000/api/supply-chain/sync/push \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "items": [
      {
        "operation": "INSERT",
        "entity_type": "checkpoint",
        "offline_id": "local-uuid-généré-côté-client",
        "payload": {
          "shipment_id": "uuid-expédition",
          "location": "Checkpoint Bafoussam N1",
          "latitude": 5.4764,
          "longitude": 10.4176,
          "status": "at_checkpoint",
          "notes": "Contrôle qualité OK"
        }
      }
    ]
  }'
```

Le worker Redis traite la queue toutes les 30 secondes (configurable via `SYNC_INTERVAL_MS`).

---

## Variables d'environnement

| Variable | Description | Exemple |
|----------|-------------|---------|
| `NODE_ENV` | Environnement | `development` |
| `JWT_SECRET` | Clé de signature JWT (min 32 chars) | `super_secret_...` |
| `DB_HOST` | Hôte PostgreSQL | `localhost` |
| `REDIS_URL` | URL Redis complète | `redis://:pwd@localhost:6379` |
| `AWS_REGION` | Région AWS | `af-south-1` |
| `SYNC_INTERVAL_MS` | Intervalle sync offline (ms) | `30000` |

Voir `.env.dev` pour la liste complète.

---

## Tests

```bash
# Tous les tests
npm run test --workspaces

# Un service spécifique
cd erp-service && npm test

# Avec couverture
npm test -- --coverage
```

---

## CI/CD Pipeline

Le pipeline GitHub Actions (`.github/workflows/ci-cd.yml`) exécute :

1. **Lint** — vérification du code
2. **Tests** — avec PostgreSQL et Redis en services
3. **Build Docker** — images multi-stage pour chaque service
4. **Push ECR** — vers Amazon ECR `af-south-1`
5. **Deploy ECS** — mise à jour des services ECS
   - `main` → cluster production
   - `develop` → cluster staging

---

## Déploiement AWS

```bash
# Configurer les credentials AWS
aws configure --profile digitrans

# Déployer manuellement (hors CI/CD)
aws ecs update-service \
  --cluster digitrans-cluster \
  --service auth-gateway-service \
  --force-new-deployment \
  --region af-south-1
```

**Secrets requis dans GitHub :**
- `AWS_ACCOUNT_ID`
- `AWS_ACCESS_KEY_ID`
- `AWS_SECRET_ACCESS_KEY`

---

*CAMTECH SOLUTIONS S.A. — Projet DIGITRANS-CM — 2025/2026*
