# Rapport d'activité collectif — DIGITRANS-CM

**Module :** BC04/EC04 — Optimiser le SI par le Cloud Computing  
**Projet :** DIGITRANS-CM — Transformation numérique AGROCAM S.A.  
**Période :** 19/05/2026 → 21/05/2026  
**Équipe :** CAMTECH SOLUTIONS

---

## 1. Composition de l'équipe

| Rôle | Nom & Prénom | Compétences principales | Tâches principales |
|------|-------------|------------------------|-------------------|
| **Chef de projet / Architecte** | Samen | Architecture cloud, décisions techniques | Conception architecture, coordination, validation |
| **Développeur Backend** | Youessah | Node.js, APIs REST, BDD | Développement microservices, tests unitaires |
| **DevOps / Cloud**  | Kwitat | Terraform, CI/CD, Docker, K8s | IaC, pipeline CI/CD, déploiement, monitoring |

---

## 2. Planning et jalons

| Date | Jalon | Statut | Livrable |
|------|-------|--------|----------|
| J1 | Architecture et setup | ✅ | Schéma architecture, dépôt Git, Dockerfiles |
| J1 | Microservices socle | ✅ | Auth Gateway, ERP, CRM, Supply Chain, BI |
| J2 | Intégration et tests | ✅ | APIs REST, sync offline, 23 tests unitaires |
| J2 | IaC Terraform + CI/CD | ✅ | Modules Terraform, GitHub Actions pipeline |
| J2 | Conteneurisation K8s | ✅ | Manifests Kubernetes, Kustomize overlays |
| J3 | Documentation + Monitoring | ✅ | Architecture doc, rapport technique, monitoring |
| J3 | Finalisation | ✅ | Rapport d'activité, push final |

---

## 3. Répartition détaillée des tâches

### Samen — Architecture & Coordination

| Tâche | Techno | Effort |
|-------|--------|--------|
| Conception architecture cloud hybride (AWS + Azure) | — | 2h |
| Choix technologiques (Node.js vs Python, JWT vs OAuth) | — | 1h |
| Structuration monorepo (workspaces npm) | npm | 1h |
| Coordination et revue de code | GitHub | 3h |
| Documentation architecture + rapport technique | Markdown, Mermaid | 3h |
| Rédaction rapport d'activité | — | 1h |

### Youessah — Développement Backend

| Tâche | Techno | Effort |
|-------|--------|--------|
| Auth Gateway (JWT, proxy, RBAC) | Node.js/Express | 4h |
| ERP Service (employees, accounting, purchase orders) | Node.js/Express | 4h |
| CRM Service (customers, orders) | Node.js/Express | 3h |
| Supply Chain Service (shipments, checkpoints, sync) | Node.js/Express | 4h |
| BI Service (KPIs, dashboards) | Python/FastAPI | 3h |
| Tests unitaires (23 tests) | Jest, Supertest | 3h |
| Offline-first (Redis queue, sync worker) | Redis, Fabric SDK | 2h |

### Kwitat — DevOps & Cloud

| Tâche | Techno | Effort |
|-------|--------|--------|
| Dockerfiles + docker-compose.yml | Docker | 2h |
| Terraform IaC (VPC, ECS, RDS, Redis, ALB, S3, IAM) | Terraform | 5h |
| Pipeline CI/CD (GitHub Actions) | YAML, AWS ECR/ECS | 2h |
| Manifests Kubernetes (Deployments, Services, HPA, Ingress) | K8s, Kustomize | 3h |
| Monitoring (CloudWatch, Prometheus, Grafana, alertes) | AWS, Prometheus | 3h |
| Cost management (budgets, tags, auto-scaling) | AWS Budgets | 1h |
| Gestion des environnements (dev/test/prod) | Terraform, .env | 1h |

---

## 4. Difficultés rencontrées et solutions

### 4.1. Techniques

| Difficulté | Contexte | Solution apportée |
|------------|----------|-------------------|
| **BI Service en Python** dans un monorepo npm | BI nécessite pandas/numpy pour les KPIs, pas Node.js | BI Service exclu des workspaces npm, déploiement indépendant (Docker) |
| **Hyperledger Fabric** indisponible en local | Pas de réseau Fabric de disponible pour les tests | Mode degraded : l'API répond toujours, les données sont synchronisées quand Fabric est disponible |
| **Dépendances circulaires Terraform** | ECS a besoin de l'ARN ALB, ALB a besoin du SG ECS | Création d'un module `security` indépendant qui crée tous les SGs avant les autres ressources |
| **Offline-first** avec queue Redis | Fiabilité : éviter les doublons et la perte de données | Dédoublonnage par `offline_id`, dead-letter queue après 3 retries, transaction PostgreSQL |
| **CRLF vs LF** sur Windows | Git warning sur tous les fichiers | .gitattributes pour normaliser en LF, mais pas bloquant |

### 4.2. Organisationnelles

| Difficulté | Solution |
|------------|----------|
| Coordination à distance des 3 membres | GitHub Projects pour le suivi des tâches, branches par fonctionnalité |
| Délai court (3 jours) | Priorisation stricte : socle fonctionnel d'abord, optimisations ensuite |
| Alignement sur les choix technologiques | Décisions prises collectivement en début de projet, documentées dans le rapport technique |

---

## 5. Outils utilisés

| Catégorie | Outil | Usage |
|-----------|-------|-------|
| Versioning | Git + GitHub | Code source, PRs, issues |
| CI/CD | GitHub Actions | Lint, tests, build, déploiement |
| IaC | Terraform | Provision AWS (VPC, ECS, RDS, Redis, ALB, S3) |
| Conteneurs | Docker + Docker Compose | Dev local + production |
| Orchestration | Kubernetes (EKS) | Déploiement prod avec auto-scaling |
| Monitoring | CloudWatch + Prometheus + Grafana | Métriques, alertes, dashboards |
| BDD | PostgreSQL 15 | 4 bases isolées (erp, crm, supply_chain, bi) |
| Cache | Redis 7 | Cache BI + queue offline |
| Auth | JWT + RBAC | Authentification centralisée |
| Docs | Markdown, Mermaid | Architecture, rapports |

---

## 6. Chiffres clés

| Métrique | Valeur |
|----------|--------|
| Lignes de code | ~14 000 |
| Fichiers | 130+ |
| Microservices | 5 |
| Tests unitaires | 23 |
| Modules Terraform | 8 |
| Manifests K8s | 10 |
| Alertes monitoring | 7 |
| Budget cloud estimé | ~$465/mois (prod) |

---

## 7. Améliorations possibles

| Priorité | Amélioration | Justification |
|----------|-------------|---------------|
| Haute | OAuth 2.0 / Azure AD | Authentification SSO pour tous les employés AGROCAM |
| Haute | Tests BI (pytest) | Couverture du service Python actuellement à 0% |
| Moyenne | Tests d'intégration cross-services | Vérifier le chainage complet (login → proxy → sync → BI) |
| Moyenne | Rate limiting sur le gateway | Protection anti-brute-force / DDoS |
| Faible | Dashboard BI avec Matplotlib | Visualisation des KPIs dans l'API |
| Faible | i18n anglais/français | Documentation bilingue |

---

*Signatures :*  
**Samen** _________________ &nbsp;&nbsp; **Youessah** _________________ &nbsp;&nbsp; **Kwitat** _________________

*Date :* 21 / 05 / 2026

*CAMTECH SOLUTIONS S.A. — Projet DIGITRANS-CM — 2025/2026*
