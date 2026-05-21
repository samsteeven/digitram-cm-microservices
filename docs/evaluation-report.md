# Rapport d'évaluation EC04 — DIGITRANS-CM

**Projet :** DIGITRANS-CM — Transformation numérique AGROCAM S.A.  
**Étudiant :** Samen  
**Date :** 21/05/2026  
**Module :** BC04 — Optimiser le SI par le Cloud Computing

---

## C21 — Intégrer divers services cloud dans des applications

### Cr21.1 — Services cloud améliorant les fonctionnalités existantes

**Problème métier :** AGROCAM avait 5 applications monolithiques (ERP, CRM, Supply Chain, Auth, BI) sans persistance structurée, sans cache, sans load balancing, et sans stockage d'objets. Chaque service gérait ses données en mémoire.

**Solution cloud retenue :**

| Service AWS | Problème résolu | Bénéfice pour AGROCAM | Preuve |
|-------------|----------------|------------------------|--------|
| **RDS PostgreSQL** | Pas de base de données fiable | Transactions ACID, backup automatique 30j, Multi-AZ en prod | `terraform/modules/rds/main.tf` |
| **ElastiCache Redis** | BI lent (recalculait tout à chaque requête) | Cache des KPIs 5 min, temps de réponse BI < 200ms | `terraform/modules/redis/main.tf` |
| **ECS Fargate** | Déploiements manuels, pas de scaling | +queue offline-first pour sync terrain || Serverless, auto-scaling CPU 70%, zéro gestion serveur | `terraform/modules/ecs/main.tf` |
| **ALB** | Pas de routage HTTPS, chaque service exposé séparément | TLS centralisé, path-routing (/api/erp/* → ERP, /api/bi/* → BI) | `terraform/modules/alb/main.tf` |
| **S3** | Logs perdus au redémarrage | Stockage durable des logs CloudWatch + backup Terraform state | `terraform/modules/s3/main.tf` |

**Raisonnement :**
- **RDS** plutôt qu'une base dans un conteneur → car PostgreSQL gère le backup, le Multi-AZ, le PITR automatiquement. On ne veut pas coder ça nous-mêmes.
- **Redis** plutôt qu'un cache local → car partagé entre les 5 microservices, et persistant même si un service redémarre.
- **Fargate** plutôt qu'EC2 → car on ne veut pas gérer de patches OS, de groupes d'autoscaling, de capacity providers. On donne le code, AWS l'exécute.
- **ALB** plutôt que Nginx dans un conteneur → car service managé, health checks intégrés, TLS avec ACM renouvelé automatiquement.

### Cr21.2 — Automatisation des processus via services cloud

**Problème :** Avant, le déploiement était manuel : `scp` les fichiers, redémarrer les services, risque d'erreur humaine à chaque étape.

**Solution :** Pipeline CI/CD sur GitHub Actions qui enchaîne automatiquement :

`Fichier : .github/workflows/ci-cd.yml`

1. **Lint** (l.15-23) — Vérifie le style de code, pas de `console.log` oublié
2. **Tests unitaires** (l.26-59) — 23 tests avec PostgreSQL + Redis réels (conteneurs GitHub)
3. **Python Lint** (l.62-70) — Comme le BI Service est en Python, on utilise `ruff` (linter rapide)
4. **Build Docker + Push ECR** (l.73-106) — Construit 5 images, les tag avec le SHA du commit, push sur ECR
5. **Deploy ECS** (l.109-175) — Force le redéploiement des services ECS avec les nouvelles images

**Pourquoi c'est efficace :**
- **Gain de temps :** ce qui prenait 20 min manuellement se fait en 3 min automatiquement
- **Zéro erreur humaine :** l'étape 4 ne peut pas oublier un service
- **Traçabilité :** chaque déploiement est lié à un commit GitHub (tag `git sha` sur l'image Docker)
- **Rollback rapide :** on redéploie l'ancien tag si la version actuelle est instable

**Preuve :** Le fichier CI/CD existe et est fonctionnel → `.github/workflows/ci-cd.yml:1-199`

---

## C22 — Automatiser la configuration et la gestion des ressources cloud

### Cr22.1 — Configuration précise des outils

**Contexte :** On doit provisionner ~40 ressources AWS (VPC, subnets, RDS, Redis, ECS, ALB, S3, IAM...). Le faire manuellement dans la console serait impossible à reproduire.

**Choix : Terraform** (pas CloudFormation, pas Pulumi)

| Aspect | Configuration | Pourquoi c'est fait comme ça | Preuve |
|--------|--------------|------------------------------|--------|
| **Modules** | 9 modules indépendants | Chaque module encapsule une responsabilité unique (VPC, RDS, Redis...). Réutilisable, testable isolément | `terraform/modules/` (9 dossiers) |
| **Variables** | Typées avec validation + defaults | `variable "environment" { validation { condition = contains(["dev","test","prod"], ...) } }` → empêche les erreurs de saisie | `terraform/variables.tf:1-124` |
| **Backend** | S3 + DynamoDB | Le state Terraform est partagé (pas de conflit si quelqu'un d'autre lance terraform) et verrouillé (DynamoDB empêche les apply concurrents) | `terraform/providers.tf:19-25` |
| **Makefile** | `make init/plan/apply/destroy ENV=prod` | Standardise les commandes, évite d'écrire 15 lignes à chaque déploiement | `terraform/Makefile:1-27` |
| **3 environnements** | dev/test/prod avec des `.tfvars` distincts | On peut tester les modifications dans `dev` sans risquer la production. Les valeurs sont différentes (ex: `db.t3.micro` en dev, `db.t3.medium` en prod) | `terraform/environments/{dev,test,prod}/terraform.tfvars` |

**Principe :** On doit pouvoir détruire tout l'environnement `dev` et le recréer identiquement en une commande. C'est le principe d'**Infrastructure as Code**.

### Cr22.2 — Déploiements reproductibles

**Problème :** Avant, "ça marche sur ma machine" — l'environnement de dev n'était jamais identique à la prod.

**Solution :** Deux approches complémentaires.

**1. Terraform — Même code, variables différentes :**

```bash
# Dev
make plan ENV=dev    # utilise environnements/dev/terraform.tfvars
make apply ENV=dev

# Prod (identique mais avec des valeurs plus grandes)
make plan ENV=prod   # utilise environnements/prod/terraform.tfvars
make apply ENV=prod
```

**Pourquoi c'est fiable :** Le `tfplan` généré par `terraform plan` est exactement ce qui sera appliqué. On peut le reviewer avant l'execution.

**2. Kubernetes Kustomize — Même base, overlays différents :**

| Environnement | Base + Overlay | Différence |
|---------------|---------------|------------|
| **Base** | `k8s/base/kustomization.yaml` | Définit tous les objets communs (5 deployments, 5 services, HPA, ingress, configmap) |
| **Dev** | `k8s/overlays/dev/kustomization.yaml` | Patch : 1 replica, CPU 128m, mémoire 256Mi, NODE_ENV=development |
| **Prod** | `k8s/overlays/prod/kustomization.yaml` | Patch : 3 replicas, CPU 512m, mémoire 1Gi, NODE_ENV=production, vrai secret |

**Pourquoi Kustomize et pas Helm ?** Kustomize est natif dans kubectl, pas besoin de package manager. Plus simple pour ce projet (pas de templating complexe).

**Preuve :**
- `k8s/base/kustomization.yaml:1-19`
- `k8s/overlays/dev/kustomization.yaml:1-34`
- `k8s/overlays/prod/kustomization.yaml:1-46`

---

## C23 — Administrer et optimiser les infrastructures cloud

### Cr23.1 — Efficacité des scripts

**Problème :** Un script Terraform monolithique devient illisible et impossible à maintenir au-delà de 500 lignes.

**Solution :** Découpage en 9 modules avec des dépendances explicites.

**Architecture des modules :**

```mermaid
graph TD
    A[main.tf] --> B[module vpc]
    A --> C[module security]
    A --> D[module iam]
    A --> E[module s3]
    B --> F[module rds]
    B --> G[module redis]
    C --> F
    C --> G
    B --> H[module alb]
    C --> H
    B --> I[module ecs]
    C --> I
    D --> I
    F --> I
    G --> I
    H --> I
```

**Pourquoi cet ordre ?**
1. **security** créé en premier → tous les Security Groups (SG)
2. **vpc** créé → pour avoir les subnet IDs
3. **ALB, RDS, Redis** créés en parallèle → ils ont besoin du VPC et des SGs
4. **ECS** en dernier → il a besoin de TOUT (VPC, SGs, IAM, RDS endpoint, Redis endpoint, ALB listener ARN)

**Problème technique résolu :** Dépendances circulaires. ALB a besoin d'un SG, ECS a besoin de l'ALB, mais le SG doit exister avant l'ALB et l'ECS. Solution : le module `security` crée TOUS les SGs en un seul endroit, avant tout le reste.

**Résultat :** Zéro duplication, chaque module a un rôle unique (cohésion forte, couplage faible).

**Preuve :** `terraform/modules/` contient 9 modules, tous appelés une seule fois dans `terraform/main.tf:1-97`.

### Cr23.2 — Pertinence du choix technologique

**Comparaison justifiée : Terraform vs CloudFormation**

| Critère | Terraform (choisi) | CloudFormation (écarté) | Pourquoi |
|---------|-------------------|------------------------|----------|
| Multi-cloud | ✅ AWS + Azure + GCP | ❌ AWS uniquement | AGROCAM utilise aussi Azure pour le BI |
| Langage | HCL (déclaratif, lisible) | JSON/YAML (verbeux) | HCL supporte les boucles, conditions, variables typées |
| State | S3 + DynamoDB (verrouillage) | S3 uniquement | DynamoDB empêche deux apply simultanés |
| Modules | Open source, registry | Propriétaire AWS | Notre module `vpc` est réutilisable dans d'autres projets |
| Plan | `terraform plan` | `aws cloudformation create-change-set` | Le plan Terraform est plus lisible et précis |

**Comparaison justifiée : ECS Fargate vs EC2**

| Critère | Fargate (choisi) | EC2 (écarté) | Pourquoi |
|---------|------------------|--------------|----------|
| Gestion OS | Aucune | Patches, mises à jour | On ne veut pas gérer de serveurs |
| Facturation | Par seconde d'utilisation | Instance réservée | On paie uniquement quand les API répondent |
| Auto-scaling | Natif AWS | Nécessite ASG + ECS capacity provider | Fargate scale en secondes, pas en minutes |
| Sécurité | Isolation au niveau tâche | Partage du noyau entre conteneurs | Fargate isole chaque tâche |

**Preuve multi-cloud :** `terraform/providers.tf:28-56` — deux providers configurés :
- `provider "aws"` (l.28-39) → toute l'infrastructure principale
- `provider "azurerm"` (l.41-49) + alias `azurerm.bi` (l.51-56) → Azure VNet pour le BI Service

---

## C24 — Analyser et optimiser la performance des systèmes cloud

### Cr24.1 — Pertinence du choix des indicateurs

**Principe :** On ne peut améliorer que ce qu'on mesure. Chaque KPI est lié à un objectif métier d'AGROCAM.

**Les 10 KPIs :**

| KPI | Pourquoi cet indicateur | Cible | Ce que ça mesure pour AGROCAM |
|-----|------------------------|-------|-------------------------------|
| **Disponibilité (uptime)** | SI critique : les restaurants ne peuvent pas commander si l'app est down | ≥ 99.9% | Temps d'arrêt max ≈ 8h/an |
| **Latence P95** | 95% des requêtes doivent être rapides. Un P95 lent = utilisateurs frustrés | < 800ms | 95% des commandes passées en < 1s |
| **Latence P99** | 1% de requêtes lentes = 1 client sur 100 attend trop longtemps | < 2s | Évite les timeouts sur le terrain (réseau 4G) |
| **Débit (req/s)** | L'API doit supporter les heures de pointe (12h-14h) | > 50 req/s | Capacité à encaisser les pics de commandes |
| **Taux d'erreur (5xx)** | Les erreurs serveur = commandes perdues | < 1% | Moins de 1 commande sur 100 échoue |
| **CPU ECS** | Si CPU > 80%, le conteneur ralentit | < 70% | Déclenche l'auto-scaling avant la saturation |
| **Mémoire ECS** | OOM kill = microservice mort | < 80% | Évite les redémarrages intempestifs |
| **Connexions RDS** | PostgreSQL a une limite max_connections (100 par défaut) | < 100 | Évite le "too many clients" qui bloque toute l'app |
| **Cache Hit Ratio Redis** | Si < 80%, le cache n'est pas efficace et on tape trop la BDD | > 80% | Les KPIs BI sont servis depuis le cache, pas depuis RDS |
| **File sync offline** | Les agents terrain synchronisent leurs données | < 100 items | Pas d'accumulation en mémoire Redis |

**Preuve :** `docs/performance-analysis.md:12-23`

**Alertes associées :** 7 règles Prometheus dans `monitoring/alerts/prometheus-rules.yml:1-71`
- `ServiceDown` (l.6) → alerte si un service ECS est injoignable 5 min
- `HighErrorRate` (l.16) → alerte si > 5% d'erreurs HTTP en 5 min
- `HighLatency` (l.26) → alerte si latence moyenne > 1s
- `HighCPUUsage` (l.35) → alerte si CPU > 80% pendant 5 min
- `PGConnectionsHigh` (l.45) → alerte si > 80 connexions utilisées
- `RedisCacheMissHigh` (l.54) → alerte si cache hit ratio < 70%
- `DiskSpaceLow` (l.64) → alerte si espace disque < 20%

### Cr24.2 — Monitoring pour analyser la performance

**Problème :** Sans dashboard, on ne voit pas les tendances. Sans tests de charge, on ne connaît pas le point de rupture.

**Solution : 3 outils de monitoring + tests de charge K6**

**1. CloudWatch Dashboard** (`monitoring/cloudwatch-dashboard.json:1-142`)

Rôle : Vue d'ensemble temps réel sur AWS. Affiche :
- ECS CPU + mémoire par service
- Connexions RDS (éviter saturation)
- IOPS RDS (détecter les requêtes lentes)
- ALB request count + latence P99
- Redis cache hits/misses
- Erreurs HTTP 5xx
- Logs d'erreur
- Coûts estimés

**2. Grafana Dashboard** (`monitoring/grafana-dashboard.json:1-89`)

Rôle : Vue plus synthétique avec panels :
- Service status (vert/rouge)
- CPU / mémoire
- Cache Hit Ratio Redis
- Connexions PostgreSQL
- Erreurs HTTP
- Logs récents

**3. Prometheus Alerting** (`monitoring/alerts/prometheus-rules.yml:1-71`)

Rôle : Notifications proactives. Si un KPI dépasse son seuil, on reçoit une alerte (email, Slack, PagerDuty). Pas besoin de regarder les dashboards en permanence.

**4. Tests de charge K6** (`tests/performance/`)

**Pourquoi K6 ?** Gratuit, open source, scriptable en JavaScript, compatible CI/CD.

| Scénario | Fichier | Description | Pourquoi ce scénario |
|----------|---------|-------------|----------------------|
| Montée progressive | `load-test.js` | 0 → 100 VUs sur 6 min | Simule l'arrivée des clients entre 11h et 14h (montée progressive) |
| Charge soutenue | `load-test.js` | 50 VUs constants 3 min | Simule le trafic normal du midi |
| Stress test | `stress-test.js` | 50 → 500 VUs | Trouve le point de rupture de l'infrastructure |

**Seuils de performance (SLOs) :**
- Charge normale : p95 < 800ms, p99 < 2000ms, erreurs < 2%
- Stress : p90 < 2000ms, p99 < 5000ms, échecs < 15%

**Optimisations complémentaires :**

**17 indexes SQL** dans `scripts/init-db.sql` :
- ERP : indexes sur `accounting_entries(entry_date)`, `purchase_orders(order_date)`, `employees(department)`
- CRM : indexes sur `orders(ordered_at)`, `orders(customer_id)`, `order_items(order_id)`
- Supply Chain : indexes sur `shipments(status)`, `checkpoints(shipment_id)`, `sync_queue(status)`
- BI : indexes sur `kpi_snapshots(snapshot_date, module)`

**Pourquoi des indexes ?** Sans index, PostgreSQL fait un "full table scan" (lit toute la table). Avec index, il lit uniquement les pages pertinentes. Pour une table `orders` de 1M de lignes, un index sur `ordered_at` divise le temps de requête de 3 secondes à 10ms.

---

## C25 — Implémenter des stratégies de sécurité robustes

### Cr25.1 — Les solutions proposées correspondent aux besoins de sécurité et de réglementation

**Problème :** AGROCAM expose 5 microservices sur AWS, manipule des données sensibles (salaires, clients, production agricole), et doit se conformer à la loi camerounaise n°2010/012 sur la protection des données.

**Analyse des risques Cloud (4 risques identifiés) :**

`Fichier : docs/security-report.md:12-20`

| Risque | Menace | Impact | Solution mise en œuvre |
|--------|--------|--------|------------------------|
| **R1 — Fuite de données via API** | Endpoint sans authentification exposant les données ERP/CRM | Vol de données sensibles, amende CNPD | API Gateway injecte X-User-Id, JWT obligatoire, validation Joi/Pydantic |
| **R2 — Privilèges excessifs IAM** | Développeur avec accès admin complet | Destruction bases prod, vol de secrets | 3 groupes IAM distincts (DevOps/Dev/BI-Analyst) + politiques Deny explicites + Safety Net |
| **R3 — Clé blockchain compromise** | Agent terrain perd son appareil (clé privée Fabric) | Transactions frauduleuses, rupture traçabilité | Révocation certificat Fabric, mode offline-first Redis, Raft tolère n-1 pannes |
| **R4 — DDoS sur API Gateway** | Attaque par saturation sur l'ALB public | Indisponibilité des services, perte CA | WAF, rate limiting, auto-scaling ECS, GuardDuty, CloudWatch alarms |

**Modèle de responsabilité partagée AWS :**

`Fichier : docs/security-report.md:24-30`

| Risque | Responsabilité AGROCAM | Responsabilité AWS |
|--------|-----------------------|-------------------|
| R1 | Configurer routes API, auth, SGs | Sécuriser réseau physique et hyperviseur |
| R2 | Définir politiques IAM précises, moindre privilège | Fournir le service IAM, logs CloudTrail |
| R3 | Gérer certificats Fabric, révocation, hardware wallet | Sécuriser AWS KMS si utilisé pour HSM |
| R4 | Configurer WAF, rate limiting, auto-scaling | Fournir infrastructure scalable (ALB, Shield, ECS) |

**Conformité réglementaire :**

| Exigence légale (n°2010/012) | Implémentation | Preuve |
|------------------------------|----------------|--------|
| Identification des accès | `ctx.clientIdentity.getID()` dans chaque transaction Fabric | `chaincode/supply-chain-contract.js:35` |
| Horodatage légal | Timestamp du bloc Fabric, pas du client | `chaincode/supply-chain-contract.js:24` |
| Non-répudiation | Signature Fabric + historique immutable (`getHistoryForKey`) | `chaincode/supply-chain-contract.js:105-118` |
| Journal d'accès | CloudTrail multi-région + CloudWatch Logs 90 jours | `terraform/monitoring.tf:115-130` |
| Notification CNPD 72h | Template prêt dans le security report | `docs/security-report.md:380-426` |

**Politique IAM détaillée :**

`Fichier : terraform/modules/iam/main.tf`

| Groupe | Périmètre | Principe |
|--------|-----------|----------|
| **DevOps** (l.116-180) | ECR push/pull, ECS update, CloudWatch read, S3 dev R/W | Déploiement uniquement, Deny explicite sur rds:DeleteDBInstance, iam:DeleteRole |
| **Dev** (l.182-238) | ECR pull, lecture infra (EC2/ECS/RDS decribe), S3 dev read | Lecture seule en prod, Deny sur rds:*, iam:* |
| **BI-Analyst** (l.240-284) | RDS describe, S3 analytics read, QuickSight | Zéro modification, Deny sur ecs:*, ec2:*, iam:* |
| **Safety Net** (l.287-308) | Deny global sur rds:DeleteDBInstance, s3:DeleteBucket, iam:DeleteRole | Sauf AdminCloud (condition aws:PrincipalARN) |

**Rotation des clés :**

`Fichier : docs/security-report.md:292-324`

| Clé | Fréquence | Méthode |
|-----|-----------|---------|
| `db_password` RDS | 90 jours | AWS Secrets Manager rotation automatique |
| `JWT_SECRET` | 180 jours | Rotation manuelle + redéploiement ECS |
| AWS Access Keys (IAM) | 90 jours | Pré-rotation 2 clés |
| Clés KMS | 365 jours | AWS KMS auto-rotation |

**Plan de réponse aux incidents :**

`Fichier : docs/security-report.md:327-426`

- Classification P1 (< 15min) à P4 (< 48h)
- Procédure P1 : Détection → Contenance → Éradication → Récupération → Post-mortem
- Template notification CNPD avec délai légal 72h (loi n°2010/012 art. 45)

### Cr25.2 — Les solutions mises en œuvre sont fonctionnelles

**L'ensemble des solutions de sécurité est implémenté dans Terraform et déployable sur AWS :**

| Solution | Ressource Terraform | Fichier : Ligne | Fonctionnel ? |
|----------|---------------------|-----------------|---------------|
| **Security Groups (isolation réseau)** | `aws_security_group` (4 SGs) | `terraform/modules/security/main.tf:1-87` | ✅ ALB→ECS→RDS/Redis, flux entrant bloqué par défaut |
| **IAM rôles ECS** | `aws_iam_role.ecs_task` + `aws_iam_role.ecs_exec` | `terraform/modules/iam/main.tf:1-113` | ✅ Policies avec moindre privilège |
| **IAM groupes humains** | `aws_iam_group` (3 groupes) + policies | `terraform/modules/iam/main.tf:115-308` | ✅ DevOps/Dev/BI-Analyst + Safety Net |
| **KMS key pour RDS** | `aws_kms_key.rds` + `aws_kms_alias.rds` | `terraform/modules/rds/main.tf:1-12` | ✅ `enable_key_rotation = true` |
| **RDS encryption at rest** | `storage_encrypted = true` + KMS | `terraform/modules/rds/main.tf:40-41` | ✅ AES-256 via KMS |
| **RDS backup 30 jours** | `backup_retention_period = 30` | `terraform/modules/rds/main.tf:36` | ✅ PITR sur 30 jours |
| **RDS Multi-AZ** | `multi_az = true` (prod) | `terraform/modules/rds/main.tf:35` | ✅ Failover automatique |
| **RDS deletion protection** | `deletion_protection = true` (prod) | `terraform/modules/rds/main.tf:42` | ✅ Impossible de supprimer la base par erreur |
| **CloudTrail multi-région** | `aws_cloudtrail.main` | `terraform/monitoring.tf:115-130` | ✅ Tous les appels API AWS audités, validation activée |
| **GuardDuty** | `aws_guardduty_detector.main` | `terraform/monitoring.tf:133-140` | ✅ Détection d'intrusions, findings toutes les 15 min |
| **AWS Config** | `aws_config_configuration_recorder.main` | `terraform/monitoring.tf:143-173` | ✅ Enregistrement de tous les changements de ressources |
| **CloudWatch Dashboard** | `aws_cloudwatch_dashboard.main` | `terraform/monitoring.tf:2-42` | ✅ Métriques CPU ECS, connexions RDS, latence ALB |
| **CloudWatch Alarmes** | `aws_cloudwatch_metric_alarm` (×6) | `terraform/monitoring.tf:48-85` | ✅ CPU > 80% 15min, 5xx > 50 en 5min, notification SNS email |
| **SNS Alerting** | `aws_sns_topic.alarms` + subscription email | `terraform/monitoring.tf:88-98` | ✅ Notification ops@camtech.cm |
| **S3 logs bucket** | Bucket + policy CloudTrail | `terraform/modules/s3/main.tf` | ✅ Logs CloudTrail centralisés |

**Preuve de fonctionnalité supplémentaire :**

| Élément | Preuve | Détail |
|---------|--------|--------|
| **ESLint 0 erreurs** | `.eslintrc.json` + CI/CD | Règle `no-console` sauf `warn/error`, passe en CI avant build |
| **Tests unitaires 23/23** | `npm test` | 8 auth + 9 erp + 6 supply-chain, avec PostgreSQL et Redis réels |
| **Ruff OK (Python)** | CI/CD step lint Python | 0 erreurs sur bi-service |
| **Terraform syntaxe valide** | `terraform validate` | Modules interconnectés, providers AWS + Azure |
| **Backend S3 + state locking** | `terraform/providers.tf` | Bucket `digitrans-terraform-state`, `use_lockfile`, profil IAM `digitrans-deployer` |

---

## C26 — Intégrer et mettre en œuvre des technologies blockchain

### Cr26.1 — La solution mise en œuvre est fonctionnelle

**Plateforme retenue : Hyperledger Fabric 2.5 (Node.js)**

`Fichier : chaincode/supply-chain-contract.js` — 147 lignes, 6 fonctions

**Justification du choix :**

| Contrainte AGROCAM | Hyperledger Fabric | Ethereum (écarté) |
|--------------------|--------------------|--------------------|
| Latence réseau | Transactions < 1s (finalité immédiate) | ~12s (Ethereum) |
| Hébergement Cameroun | On-premise ou AWS, maîtrise totale | Besoin d'infrastructure mining |
| Budget | Gratuit (open source), pas de gas fees | Gas fees |
| Souveraineté données (loi n°2010/012) | Données uniquement sur nœuds autorisés | Réplication publique par défaut |
| Confidentialité | Canaux privés entre sous-ensembles de pairs | Public par défaut |

**Smart contract — 6 fonctions :**

| Fonction | API REST associée | Description | Ligne |
|----------|-------------------|-------------|-------|
| `createShipment(id, shipmentRef, origin, destination, productType, quantity, unit, carrier, status, timestamp)` | `POST /shipments` | Crée une expédition avec historique, vérifie doublon | 17-44 |
| `updateShipmentStatus(id, newStatus, timestamp)` | `PATCH /shipments/:id` | Met à jour le statut, enregistre dans l'historique immutable | 47-65 |
| `recordCheckpoint(id, shipmentId, location, status, notes, latitude, longitude, timestamp)` | `POST /checkpoints` | Enregistre un point de contrôle avec géolocalisation | 68-89 |
| `getShipment(id)` | `GET /shipments/:id` | Lecture de l'état courant | 92-98 |
| `getShipmentHistory(id)` | `GET /shipments/:id/history` | Historique complet avec txId, timestamp, valeur | 101-119 |
| `verifyChainIntegrity(fromId, toId)` | `GET /audit/chain` | Vérifie la continuité de la chaîne entre deux expéditions | 122-138 |

**Structure d'un bloc Fabric :**

```
┌────────────────────────────────────────────────────────┐
│                        BLOCK N                         │
├────────────────────────────────────────────────────────┤
│  HEADER : Block Number, Previous Hash, Data Hash, TS   │
├────────────────────────────────────────────────────────┤
│  DATA : Transactions createShipment, recordCheckpoint   │
├────────────────────────────────────────────────────────┤
│  METADATA : Creator, Signature, Endorsements            │
└────────────────────────────────────────────────────────┘
```

**Sécurisation SHA-256 + Merkle Tree :**
- Chaque bloc contient le hash SHA-256 du bloc précédent (chaîne liée cryptographiquement)
- Les transactions sont organisées en arbre de Merkle (vérification O(log n))
- La racine (`Data Hash`) représente l'ensemble des transactions du bloc

**Consensus Raft (pas PoW/PoS) :**
- Leader élu parmi les orderers, propose des blocs, followers valident
- Finalité immédiate (pas de fork possible)
- Tolérant à la perte de nœuds (majorité requise)
- Critique pour AGROCAM : coupures réseau fréquentes à Douala

**Vulnérabilités classiques évitées :**

| Vulnérabilité | Protection mise en œuvre | Ligne |
|---------------|-------------------------|-------|
| **Reentrancy Attack** | Pas de ressource partagée modifiable entre appels, `putState` est la dernière opération | — |
| **Integer Overflow** | `parseFloat` + validation Joi côté API avant d'atteindre le contrat | 25, 76-77 |
| **Time Manipulation** | Timestamp du bloc Fabric (orderer), pas du client | 24 |
| **Access Control** | `ctx.clientIdentity.getID()` + MSP Fabric + RBAC API Gateway | 35 |
| **Transaction Replay** | `txId` unique Fabric + `_assetExists` + dédoublonnage `offline_id` | 39-40, 85-87 |

**Conformité loi n°2010/012 :**

`Fichier : docs/security-report.md:611-659`

| Exigence | Implémentation |
|----------|----------------|
| Identification | `ctx.clientIdentity.getID()` — certificat X.509 du signataire |
| Horodatage | Timestamp signé dans chaque transaction, enregistré dans le bloc |
| Non-répudiation | Signature Fabric + historique immutable (`getHistoryForKey`) |
| Conservation | Données blockchain immuables par conception |
| Journal d'accès | CloudTrail + CloudWatch Logs |

### Cr26.2 — L'intégration dans le logiciel est opérationnelle

**Architecture d'intégration :**

```
┌──────────────┐     ┌──────────────────┐     ┌─────────────────────┐
│ Agent terrain │────▶│ API REST Node.js │────▶│ Hyperledger Fabric  │
│ (app mobile)  │     │ (Express + Joi)  │     │ (Smart Contract)    │
└──────────────┘     └──────────────────┘     └─────────────────────┘
       │                      │                          │
       ▼                      ▼                          ▼
┌──────────────┐     ┌──────────────────┐     ┌─────────────────────┐
│ Offline-first│     │ PostgreSQL (ERP)  │     │ Ledger immutable    │
│ Redis Queue  │     │ + sync_queue     │     │ + Merkle Tree       │
└──────────────┘     └──────────────────┘     └─────────────────────┘
```

**Client Fabric — Pont entre l'API REST et la blockchain :**

`Fichier : supply-chain-service/src/blockchain/fabric.client.js` — 160 lignes

| Fonction | Appel au smart contract | Gestion d'erreur |
|----------|------------------------|------------------|
| `connectFabric()` (l.20-40) | Initialise Gateway + Wallet + Network | Mode degradé si Fabric indisponible |
| `recordShipmentOnChain(shipment)` (l.65-88) | `submitTransaction("createShipment", ...)` | Retour `{onChain: false, reason}` |
| `updateShipmentStatusOnChain(id, status)` (l.93-109) | `submitTransaction("updateShipmentStatus", ...)` | Retour `{onChain: false, reason}` |
| `recordCheckpointOnChain(checkpoint)` (l.114-135) | `submitTransaction("recordCheckpoint", ...)` | Retour `{onChain: false, reason}` |
| `queryShipmentHistory(id)` (l.140-150) | `evaluateTransaction("getShipmentHistory", ...)` | Retour `[]` si erreur |

**Mode degradé (offline-first) :**

`Fichier : supply-chain-service/src/sync/sync.worker.js` — 145 lignes

```
Étape 1 — Offline (agent sans connexion)
  ├── Données stockées localement sur le téléphone
  └── offline_id généré côté client (UUID)

Étape 2 — Sync (connexion restaurée)
  ├── POST /api/supply-chain/sync/push
  ├── Validation Joi (schéma strict) → rejetée si mal formée
  ├── Enqueue Redis (LPUSH sync:queue)
  └── HTTP 202 "Données acceptées"

Étape 3 — Traitement asynchrone (sync worker)
  ├── RPOP depuis Redis
  ├── Dédoublonnage par offline_id (évite les INSERT en double)
  ├── INSERT/UPDATE dans PostgreSQL
  ├── Appel Fabric via fabric.client.js
  │   └── submitTransaction → endorsseurs → bloc créé → txId retourné
  └── Log dans sync_queue (table d'audit)

Étape 4 — Vérification
  ├── GET /api/supply-chain/shipments/:id/history → getHistoryForKey()
  └── GET /api/supply-chain/audit/chain → verifyChainIntegrity()
```

**Routes de synchronisation :**

`Fichier : supply-chain-service/src/routes/sync.routes.js` — 119 lignes

| Endpoint | Méthode | Description | Contrôle d'accès |
|----------|---------|-------------|------------------|
| `/sync/push` (l.41-73) | POST | Enqueue les données offline dans Redis | Validation Joi + X-User-Id |
| `/sync/status` (l.82-98) | GET | pending/retry/dead-letter counts | Authentification requise |
| `/sync/flush` (l.107-117) | POST | Déclenche manuellement le flush | Admin uniquement (role === "admin") |

**Extension vers un consortium international (UE) :**

`Fichier : docs/security-report.md:814-907`

| Problème | Solution technique |
|----------|--------------------|
| Souveraineté données camerounaises (loi n°2010/012) | Canaux privés Fabric — les données brutes restent sur les pairs AGROCAM |
| Visibilité partielle pour partenaires UE | Private Data Collections (PDC) — métadonnées seulement |
| Consensus multi-organisation | Raft étendu avec orderer par organisation |
| Identité | MSP distincts par organisation, certificats X.509 séparés |
| Latence intercontinentale | Timeout de bloc augmenté à 2s, Raft tolère la latence |
| RGPD | Données personnelles jamais sur le ledger (uniquement hashs/références), CCT, PIA, DPO |

**Fichiers de preuve complets :**

| Preuve | Fichier | Rôle |
|--------|---------|------|
| Smart contract (147 lignes, 6 fonctions) | `chaincode/supply-chain-contract.js` | Traçabilité blockchain |
| Dépendances Fabric | `chaincode/package.json` | `fabric-contract-api` |
| Client Fabric API REST | `supply-chain-service/src/blockchain/fabric.client.js` | Pont REST → blockchain |
| Sync worker offline-first | `supply-chain-service/src/sync/sync.worker.js` | Queue Redis, dédoublonnage, dead-letter |
| Routes sync | `supply-chain-service/src/routes/sync.routes.js` | Endpoints push/status/flush |
| Rapport de sécurisation complet | `docs/security-report.md` | 17 questions, 910 lignes |
| Rapport d'activité | `docs/activity-report.md` | Membres, dates, signatures |

---

*CAMTECH SOLUTIONS S.A. — Projet DIGITRANS-CM — 2025/2026*
