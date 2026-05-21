# DIGITRANS-CM — Rapport technique

**Projet :** Optimisation du SI par le Cloud Computing  
**Étudiant :** [Nom de l'étudiant]  
**Date :** Mai 2026  
**Code module :** BC04 / EC04

---

## 1. Choix technologiques

### 1.1. Node.js + Express (ERP, CRM, Supply Chain, Auth Gateway)

| Critère | Justification |
|---------|---------------|
| **Performance** | Runtime non-bloquant (event loop) adapté aux APIs REST avec I/O intensive (BDD, Redis). |
| **Écosystème** | npm + Joi (validation), Swagger (doc), dotenv (config), helmet (sécurité). |
| **Coût cognitif** | Langage unique (JavaScript) pour le backend — courbe d'apprentissage réduite. |
| **Communauté** | Plus grand écosystème de packages, documentation abondante. |

**Alternatives écartées :** Java/Spring Boot (trop verbeux), Go (trop marginal pour l'examen).

### 1.2. Python + FastAPI (BI Service)

| Critère | Justification |
|---------|---------------|
| **Agrégation** | pandas/numpy pour les calculs statistiques et les séries temporelles (KPIs). |
| **Performance** | Async natif (uvicorn) pour les endpoints lourds (dashboards). |
| **Documentation** | OpenAPI générée automatiquement sans décorateurs `@swagger`. |
| **Pydantic** | Validation des schémas intégrée (équivalent Joi mais natif Python). |

**Alternatives écartées :** Node.js pour BI (moins adapté au calcul matriciel), Flask (sans async natif).

### 1.3. PostgreSQL

Choix d'une base relationnelle pour la cohérence transactionnelle forte (commandes, écritures comptables).

- **Multi-bases** : une base par domaine (erp_db, crm_db, supply_db, bi_db) pour l'isolation.
- **Transactions ACID** : utilisées dans les opérations multi-tables (ex : commande + items).
- **Soft delete** : `status = 'inactive' | 'cancelled'` — pas de `DELETE` SQL, traçabilité conservée.

### 1.4. Redis

- **Cache** : résultats BI mis en cache 5 minutes (TTL configurable).
- **Queue offline** : liste chaînée Redis pour le sync worker (rPush/lPop).
- **Sessions JWT** : tokens révoqués stockés en blacklist Redis (expiration automatique).
- **Dead-letter queue** : items en échec après 3 retries.

### 1.5. Hyperledger Fabric (Supply Chain)

- **Traçabilité** : enregistrement immutable des checkpoints et statuts d'expédition.
- **Mode degraded** : l'API répond même si Fabric est indisponible (offline-first).
- **SDK Fabric** : `fabric-client.js` encapsule toutes les opérations blockchain.

### 1.6. JWT + OAuth 2.0 (Auth Gateway)

- **JWT** : authentification stateless (Bearer token signé avec HMAC-SHA256).
- **RBAC** : rôles `admin`, `manager`, `comptable`, `agent_terrain`, `analyste` — vérifiés dans chaque service via `X-User-Role`.
- **OAuth 2.0** : préparation pour Azure AD (authorization code flow).
- **Proxy** : injection des headers `X-User-Id` et `X-User-Role` dans chaque requête proxyfiée.

---

## 2. Décisions d'architecture

### 2.1. API Gateway pattern

Tout le trafic passe par un unique point d'entrée (port 3000) qui :
1. Valide le JWT
2. Vérifie le rôle
3. Injecte les headers utilisateur
4. Proxyfie vers le service cible
5. Centralise les logs

**Avantage** : sécurité centralisée, pas de duplication du code d'authentification.

### 2.2. Offline-first (Supply Chain)

Le sync worker utilise une architecture **queue-based** :
- Les agents terrain poussent leurs données vers `POST /sync/push`
- Les items sont stockés dans une queue Redis
- Le worker dépile et traite chaque item toutes les 30s
- En cas d'échec : retry max 3 fois, puis dead-letter queue
- Dédoublonnage par `offline_id`

### 2.3. Cache stratégique (BI)

Les endpoints BI les plus lourds (`/kpis/snapshot`, `/kpis/summary`, `/dashboard/global`) sont mis en cache Redis avec TTL de 5 minutes. Le cache est invalidé sur `POST /kpis/snapshot`.

### 2.4. Monorepo vs Multirepo

**Monorepo** choisi pour :
- Simplicité de gestion (un seul dépôt)
- CI/CD unifié
- Partage des configurations ESLint, Jest
- Tag de version unique (`v0.1.0`)

**Contrainte** : le BI Service (Python) est exclu du npm workspace car il utilise un écosystème différent.

---

## 3. Sécurité

### 3.1. Authentification
- JWT signé avec secret ≥ 32 caractères
- `refresh_token` UUID v4 stocké en Redis
- Blacklist des tokens révoqués (logout explicite)
- Rate limiting via le proxy (à implémenter)

### 3.2. Autorisation (RBAC)
- `admin` : tout accès
- `manager` : ERP (lecture/écriture), CRM, Supply Chain
- `comptable` : ERP (écritures comptables uniquement)
- `agent_terrain` : CRM (clients), Supply Chain (checkpoints)
- `analyste` : BI (lecture uniquement)

### 3.3. Protection des données
- Soft delete partout (conformité RGPD/loi camerounaise)
- Pas de stockage de mots de passe en clair (bcrypt)
- Variables sensibles via variables d'environnement (pas dans le code)

---

## 4. Infrastructure Cloud

### 4.1. AWS (af-south-1 — Cape Town)
- **ECS Fargate** : orchestration serverless des conteneurs
- **RDS PostgreSQL** : Multi-AZ pour la haute disponibilité
- **ElastiCache Redis** : Cache + queue offline
- **ALB** : Terminaison HTTPS + répartition de charge
- **S3** : Stockage de documents et assets
- **ECR** : Registre d'images Docker privé

### 4.2. Azure (South Africa North)
- **Azure AD** : Identité et SSO pour les employés
- **Azure Monitor** : Centralisation des logs (Log Analytics)
- **Azure DevOps** : Pipeline CI/CD de backup

### 4.3. On-premise (Douala)
Données RH et financières hébergées localement (conformité loi n°2010/012 sur la protection des données personnelles).

---

## 5. Tests

| Service | Tests | Framework | Couverture |
|---------|-------|-----------|------------|
| Auth Gateway | 8 | Jest + Supertest | Login, me, logout, health, JWT invalide, données manquantes |
| ERP Service | 9 | Jest + Supertest | RBAC (3 rôles), CRUD employés, validation Joi |
| CRM Service | — | Jest | (à implémenter) |
| Supply Chain | 6 | Jest + Supertest | Sync worker, dédoublonnage, route push, body invalide |
| BI Service | — | pytest | (à implémenter) |

**Total : 23 tests unitaires** — tous passent (`npm test`).

---

## 6. CI/CD Pipeline

```yaml
Étapes :
1. lint          → ESLint (Node.js) + ruff (Python)
2. test          → Jest avec PostgreSQL + Redis en services
3. python-lint   → ruff sur bi-service
4. build-and-push→ Docker build + push ECR (matrice 5 services)
5. deploy-prod   → ECS update-service (cluster production)
6. deploy-staging→ ECS update-service (cluster staging)

Déclencheurs :
- push sur main ou develop
- pull request vers main
```

---

## 7. Améliorations prévues

| Priorité | Amélioration | Justification |
|----------|-------------|---------------|
| Haute | OAuth 2.0 / Azure AD | Authentification SSO pour les employés |
| Haute | Terraform | Infrastructure as Code complète |
| Moyenne | Kubernetes / EKS | Orchestration avancée (auto-scaling, rolling update) |
| Moyenne | Tests Python (pytest) | Couverture du BI Service |
| Faible | Dashboard BI avec Matplotlib | Visualisation embarquée |
| Faible | Rate limiting | Protection anti-brute-force |

---

*CAMTECH SOLUTIONS S.A. — Projet DIGITRANS-CM — 2025/2026*
