# Rapport d'évaluation EC04 — DIGITRANS-CM

**Projet :** DIGITRANS-CM — Transformation numérique AGROCAM S.A.  
**Étudiant :** Samen  
**Date :** 21/05/2026  
**Module :** BC04 — Optimiser le SI par le Cloud Computing

---

## C21 — Intégrer divers services cloud dans des applications

### Cr21.1 — Services cloud améliorant les fonctionnalités existantes

| Service AWS | Rôle | Preuve |
|-------------|------|--------|
| **RDS PostgreSQL** | Persistance transactionnelle (ERP, CRM, Supply, BI) | `terraform/modules/rds/main.tf` — `aws_db_instance.postgresql` |
| **ElastiCache Redis** | Cache BI (5 min) + queue offline-first | `terraform/modules/redis/main.tf` — `aws_elasticache_cluster.redis` |
| **ECS Fargate** | Exécution serverless des 5 microservices | `terraform/modules/ecs/main.tf` — cluster, task defs, services |
| **ALB** | Routage HTTPS, termination SSL, path-based routing | `terraform/modules/alb/main.tf` — `aws_lb.main`, listener rules |
| **S3** | Logs, backup, objets statiques | `terraform/modules/s3/main.tf` — `aws_s3_bucket.assets` |

**Justification :** Chaque service a été choisi pour répondre à un besoin précis du SI d'AGROCAM (ERP, CRM, Supply Chain, BI). RDS garantit l'intégrité transactionnelle, Redis accélère le cache BI et gère la queue offline, ECS Fargate évite la gestion de nœuds, ALB centralise le routage sécurisé, S3 archive les logs.

### Cr21.2 — Automatisation des processus via services cloud

Le pipeline CI/CD **GitHub Actions** automatise toute la chaîne :

`Fichier : .github/workflows/ci-cd.yml`

1. **Lint** (l.15-23) — `npm run lint` sur tous les workspaces
2. **Tests** (l.26-59) — 23 tests unitaires avec PostgreSQL + Redis en services GitHub
3. **Python Lint** (l.62-70) — `ruff check` sur le BI Service
4. **Build & Push ECR** (l.73-106) — Docker build → tag → push vers ECR pour les 5 services
5. **Deploy ECS** (l.109-175) — `aws ecs update-service` force le redéploiement

**Impact :** Zéro intervention manuelle du dev à la prod. Chaque commit sur `main` déclenche build → test → push → deploy.

---

## C22 — Automatiser la configuration et la gestion des ressources cloud

### Cr22.1 — Configuration précise des outils

| Outil | Configuration | Preuve |
|-------|--------------|--------|
| **Terraform** | 9 modules, 3 environnements, Makefile | `terraform/modules/` (9 dossiers), `terraform/environments/{dev,test,prod}/terraform.tfvars`, `terraform/Makefile` |
| **Makefile** | Targets init/plan/apply/destroy/fmt/validate | `terraform/Makefile:1-27` |
| **Variables typées** | Validation, defaults, sensitive flags | `terraform/variables.tf:1-124` |
| **Backend S3 + DynamoDB** | State locking, chiffrement | `terraform/providers.tf:19-25` |

Chaque module suit le pattern `main.tf` + `variables.tf` + `outputs.tf` sans duplication.

### Cr22.2 — Déploiements reproductibles

**Terraform** — déploiement identique sur 3 environnements :

```bash
make plan ENV=dev    # Planification
make apply ENV=dev   # Application
make plan ENV=prod   # Idem mais avec variables différentes
make apply ENV=prod
```

**Kustomize Kubernetes** — 2 overlays distincts :

| Environnement | Fichier | Particularités |
|---------------|---------|----------------|
| **Base** | `k8s/base/kustomization.yaml` | Namespace, configmap, 5 deployments+services, HPA, ingress |
| **Dev** | `k8s/overlays/dev/kustomization.yaml` | 1 replica, resources réduites, `NODE_ENV=development` |
| **Prod** | `k8s/overlays/prod/kustomization.yaml` | 3 replicas, resources ×2, `NODE_ENV=production`, secrets |

---

## C23 — Administrer et optimiser les infrastructures cloud

### Cr23.1 — Efficacité des scripts

**Architecture Terraform** : 9 modules indépendants et réutilisables

```
modules/
  vpc/           → VPC, subnets publics/privés, NAT Gateway, route tables
  security/      → Security Groups (moindre privilège : ALB→ECS→RDS/Redis)
  iam/           → Rôles ECS execution + task (S3, ECR, logs, KMS)
  s3/            → Bucket AES256, versioning, lifecycle
  rds/           → PostgreSQL 15 Multi-AZ, backup 30j
  redis/         → ElastiCache Redis 7, subnet group
  alb/           → ALB HTTPS, HTTP→HTTPS redirect, Route53 A record
  ecs/           → ECS Fargate, 5 task defs, target groups, auto-scaling CPU
  azure-network/ → Azure VNet (BI/Fabric)
```

**Point clé :** Dépendances circulaires résolues en créant le module `security` en premier (tous les SGs), puis ALB, RDS, Redis, et enfin ECS qui dépend de tous.

### Cr23.2 — Pertinence du choix technologique

**Terraform (vs CloudFormation) :**
- Multi-cloud natif — `providers.tf` déclare **AWS** + **Azure** (provider alias `azurerm.bi`)
- Langage HCL lisible et typé
- State locking via DynamoDB pour le travail collaboratif
- Modules réutilisables, validation à la planification

**ECS Fargate (vs EC2) :**
- Pas de gestion de nœuds (serverless)
- Auto-scaling intégré (CPU > 70% → scale up)
- Paie à l'usage, pas de capacité réservée

---

## C24 — Analyser et optimiser la performance des systèmes cloud

### Cr24.1 — Pertinence du choix des indicateurs

**10 KPIs définis** dans `docs/performance-analysis.md:12-23` :

| KPI | Cible | Outil |
|-----|-------|-------|
| Disponibilité (uptime) | ≥ 99.9% | CloudWatch |
| Latence P50 / P95 / P99 | < 200ms / < 800ms / < 2s | CloudWatch + Prometheus |
| Débit (req/s) | > 50 req/s | ALB RequestCount |
| Taux d'erreur (5xx) | < 1% | CloudWatch + Prometheus |
| CPU ECS | < 70% | CloudWatch ContainerInsights |
| Mémoire ECS | < 80% | CloudWatch ContainerInsights |
| Connexions RDS | < 100 | CloudWatch |
| Cache Hit Ratio Redis | > 80% | CloudWatch + Prometheus |
| Nombre de tâches actives | 1-10 | CloudWatch |
| File d'attente sync | < 100 | Logs CloudWatch |

**7 règles d'alerte Prometheus** dans `monitoring/alerts/prometheus-rules.yml:1-71` :
- `ServiceDown`, `HighErrorRate`, `HighLatency`, `HighCPUUsage`
- `PGConnectionsHigh`, `RedisCacheMissHigh`, `DiskSpaceLow`

### Cr24.2 — Monitoring pour analyser la performance

**Dashboards :**

| Outil | Fichier | Panels |
|-------|---------|--------|
| CloudWatch Dashboard | `monitoring/cloudwatch-dashboard.json` | CPU ECS, connexions RDS, IOPS, latence ALB, cache Redis, erreurs HTTP, logs, coûts estimés |
| Grafana Dashboard | `monitoring/grafana-dashboard.json` | 7 panels : service status, CPU, mémoire, cache hit ratio, connexions PG, erreurs HTTP, logs |

**Tests de charge K6** (`tests/performance/`) :

| Scénario | Fichier | Charge |
|----------|---------|--------|
| Montée progressive | `load-test.js` | 0 → 10 → 50 → 100 VUs (6 min) |
| Charge soutenue | `load-test.js` | 50 VUs constants (3 min) |
| Stress test | `stress-test.js` | 50 → 200 → 500 VUs (5 min) |

**Seuils :** p95 < 800ms, p99 < 2000ms, erreurs < 2% (load) ; p90 < 2000ms, p99 < 5000ms, échecs < 15% (stress)

**Index SQL d'optimisation** dans `scripts/init-db.sql` : 17 indexes (date, client, statut, clés étrangères) répartis sur ERP, CRM, Supply Chain, BI.

---

## C25 — Sécurisation de l'application

*(À compléter si nécessaire)*

Mesures existantes :
- **IAM** : Moindre privilège, rôles execution/task distincts → `terraform/modules/iam/main.tf`
- **Security Groups** : ALB↔ECS↔RDS/Redis, accès entrant strict → `terraform/modules/security/main.tf`
- **Chiffrement** : TLS sur ALB, AES256 sur S3, RDS encryption
- **Authentification** : JWT + RBAC, X-User-Id/X-User-Role injectés par l'API Gateway
- **Validation** : Joi (Node.js) / Pydantic (Python) sur tous les inputs POST/PATCH
- **Soft delete** : `status IN ('active','inactive','cancelled')`, pas de DELETE SQL

---

## C26 — Rapport de sécurisation

Fichier dédié : `docs/security-report.md` (à produire si exigé)

---

*CAMTECH SOLUTIONS S.A. — Projet DIGITRANS-CM — 2025/2026*
