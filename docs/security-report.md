# Rapport de sécurisation — DIGITRANS-CM

**Projet :** DIGITRANS-CM — Transformation numérique AGROCAM S.A.  
**Étudiant :** Samen  
**Date :** 21/05/2026  
**Module :** BC04/EC04 — Partie II : Sécurisation (C25 & C26)

---

## II.2. Stratégie de sécurité

### 1. Identification de 4 risques de sécurité Cloud

| # | Risque | Description | Impact |
|---|--------|-------------|--------|
| **R1** | **Fuites de données** via API mal configurée | Un endpoint sans authentification exposant les données clients/ERP | Vol de données sensibles (salaires, informations clients), amende CNPD |
| **R2** | **Privilèges excessifs IAM** | Un développeur avec accès admin complet sur tous les services AWS | Modification/destruction des bases de production, vol de secrets |
| **R3** | **Clé compromise d'un nœud blockchain** | Un agent terrain perd son appareil avec clé privée Fabric | Transactions frauduleuses, rupture de traçabilité |
| **R4** | **DDoS ou saturation** de l'API Gateway | Attaque par déni de service sur l'ALB public | Indisponibilité des services de commande (perte de chiffre d'affaires) |

**Lien avec le contexte camerounais :** La loi n°2010/012 impose la traçabilité des accès. R1 et R2 violent directement cette obligation en cas de fuite ou d'accès non autorisé. R3 compromet l'intégrité de la preuve blockchain exigée par la loi.

### 2. Responsabilités selon le modèle de responsabilité partagée

| Risque | Responsabilité AGROCAM (Client) | Responsabilité AWS (Cloud Provider) | Justification |
|--------|-------------------------------|-------------------------------------|---------------|
| **R1** | Configurer correctement les routes API, l'authentification et les SGs | Sécuriser le réseau physique et l'hyperviseur | AWS sécurise le cloud, AGROCAM sécurise ce qu'il met dans le cloud (principe du shared responsibility model) |
| **R2** | Définir des politiques IAM précises, utiliser le moindre privilège, audit régulier | Fournir le service IAM, les logs CloudTrail | Les politiques IAM sont configurables par le client ; AWS garantit que le service IAM fonctionne |
| **R3** | Gérer les certificats Fabric, la révocation, le hardware wallet | Sécuriser AWS KMS si utilisé pour le HSM | La clé privée est gérée par le client, pas par AWS |
| **R4** | Configurer WAF, rate limiting, auto-scaling thresholds | Fournir l'infrastructure scalable (ALB, ECS, Shield) | AWS fournit les outils (Shield, WAF), AGROCAM les configure |

**Modèle de responsabilité partagée AWS :**
- **AWS = Security OF the Cloud** : Datacenters, réseau, hyperviseur, services managés (RDS, S3, ECS)
- **AGROCAM = Security IN the Cloud** : Données, IAM, Security Groups, chiffrement côté client, secrets

### 3. Politique IAM

**Référentiel :** `terraform/modules/iam/main.tf`

#### Rôles et périmètres

| Rôle AWS | Utilisateur | Périmètre | Principe |
|----------|-------------|-----------|----------|
| **AdminCloud** | RSSI / Chef de projet | Accès total mais temporaire via STS (MFA + session 1h max) | Break-glass account, utilisé uniquement pour les opérations critiques |
| **DevOps** | Ingénieur CI/CD | ECR, ECS, CloudWatch Logs, S3 (buckets dev), déclencheur pipelines | Déploiement uniquement, pas de modification RDS/Redis/Secrets Manager en prod |
| **Dev** | Développeur back-end | ECR pull, CloudWatch logs read, S3 read (dev), EC2 describe, ECS describe | Lecture seule en prod, écriture limitée au dev |
| **BI-Analyst** | Analyste métier | RDS read-only sur `bi_db`, S3 read sur bucket analytics, QuickSight | Zéro modification, pas d'accès aux bases ERP/CRM |
| **AgentTerrain** | Application mobile | `execute-api` sur API Gateway uniquement | Aucune clé AWS directe, authentification via JWT uniquement |

#### Politiques IAM détaillées

##### Rôle `DevOps`

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "ECRPushPull",
      "Effect": "Allow",
      "Action": [
        "ecr:GetAuthorizationToken",
        "ecr:BatchCheckLayerAvailability",
        "ecr:GetDownloadUrlForLayer",
        "ecr:BatchGetImage",
        "ecr:InitiateLayerUpload",
        "ecr:UploadLayerPart",
        "ecr:CompleteLayerUpload",
        "ecr:PutImage"
      ],
      "Resource": "*"
    },
    {
      "Sid": "ECSUpdate",
      "Effect": "Allow",
      "Action": [
        "ecs:UpdateService",
        "ecs:DescribeServices",
        "ecs:DescribeTaskDefinition",
        "ecs:RegisterTaskDefinition",
        "ecs:ListTasks",
        "ecs:DescribeTasks"
      ],
      "Resource": "*"
    },
    {
      "Sid": "CloudWatchRead",
      "Effect": "Allow",
      "Action": [
        "logs:DescribeLogGroups",
        "logs:DescribeLogStreams",
        "logs:GetLogEvents",
        "cloudwatch:GetMetricData",
        "cloudwatch:DescribeAlarms"
      ],
      "Resource": "*"
    },
    {
      "Sid": "S3DevReadWrite",
      "Effect": "Allow",
      "Action": ["s3:GetObject", "s3:PutObject", "s3:ListBucket"],
      "Resource": ["arn:aws:s3:::digitrans-dev-*", "arn:aws:s3:::digitrans-dev-*/*"]
    },
    {
      "Sid": "DenyProdModify",
      "Effect": "Deny",
      "Action": [
        "rds:ModifyDBInstance",
        "rds:DeleteDBInstance",
        "elasticache:ModifyReplicationGroup",
        "elasticache:DeleteReplicationGroup",
        "iam:DeleteRole",
        "iam:PutRolePolicy"
      ],
      "Resource": "*"
    }
  ]
}
```

##### Rôle `Dev`

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "ECRPull",
      "Effect": "Allow",
      "Action": [
        "ecr:GetAuthorizationToken",
        "ecr:BatchCheckLayerAvailability",
        "ecr:GetDownloadUrlForLayer",
        "ecr:BatchGetImage"
      ],
      "Resource": "*"
    },
    {
      "Sid": "CloudWatchRead",
      "Effect": "Allow",
      "Action": [
        "logs:DescribeLogGroups",
        "logs:DescribeLogStreams",
        "logs:GetLogEvents"
      ],
      "Resource": "*"
    },
    {
      "Sid": "S3DevRead",
      "Effect": "Allow",
      "Action": ["s3:GetObject", "s3:ListBucket"],
      "Resource": ["arn:aws:s3:::digitrans-dev-*", "arn:aws:s3:::digitrans-dev-*/*"]
    },
    {
      "Sid": "ReadOnlyInfra",
      "Effect": "Allow",
      "Action": [
        "ec2:DescribeInstances",
        "ec2:DescribeSecurityGroups",
        "ec2:DescribeSubnets",
        "ec2:DescribeVpcs",
        "ecs:DescribeServices",
        "ecs:DescribeTaskDefinition",
        "ecs:ListClusters",
        "ecs:ListServices",
        "ecs:ListTasks",
        "rds:DescribeDBInstances",
        "elasticache:DescribeReplicationGroups"
      ],
      "Resource": "*"
    },
    {
      "Sid": "DenyAllWrite",
      "Effect": "Deny",
      "Action": [
        "ecs:UpdateService",
        "ecs:RegisterTaskDefinition",
        "rds:ModifyDBInstance",
        "rds:DeleteDBInstance",
        "iam:*",
        "s3:PutObject",
        "s3:DeleteObject",
        "ecr:PutImage",
        "ecr:InitiateLayerUpload"
      ],
      "Resource": "*"
    }
  ]
}
```

##### Rôle `BI-Analyst`

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "RDSPostgreSQLReadOnly",
      "Effect": "Allow",
      "Action": ["rds:DescribeDBInstances"],
      "Resource": "*"
    },
    {
      "Sid": "S3AnalyticsRead",
      "Effect": "Allow",
      "Action": ["s3:GetObject", "s3:ListBucket"],
      "Resource": ["arn:aws:s3:::digitrans-analytics-*", "arn:aws:s3:::digitrans-analytics-*/*"]
    },
    {
      "Sid": "QuickSightAccess",
      "Effect": "Allow",
      "Action": ["quicksight:DescribeDashboard", "quicksight:ListDashboards", "quicksight:GetDashboardEmbedUrl"],
      "Resource": "*"
    },
    {
      "Sid": "DenyNonBI",
      "Effect": "Deny",
      "Action": [
        "ecs:*",
        "ec2:*",
        "iam:*",
        "lambda:*",
        "ecr:*",
        "elasticache:*",
        "rds:ModifyDBInstance",
        "rds:DeleteDBInstance",
        "rds:CreateDBInstance"
      ],
      "Resource": "*"
    }
  ]
}
```

##### Politique `Deny` globale (Safety Net — appliquée à tous)

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "SafetyNet",
      "Effect": "Deny",
      "Action": ["rds:DeleteDBInstance", "s3:DeleteBucket", "iam:DeleteRole", "organizations:LeaveOrganization"],
      "Resource": "*",
      "Condition": {
        "StringNotEquals": {
          "aws:PrincipalARN": "arn:aws:iam::495234635866:role/AdminCloud"
        }
      }
    }
  ]
}
```

### 4. Procédure de gestion des droits au départ d'un développeur

**Étapes immédiates (J0) :**

1. **Désactiver les clés IAM** — Dans la console AWS IAM, désactiver les clés d'accès (ne pas supprimer, pour audit) :
   ```bash
   aws iam update-access-key --access-key-id AKIA*** --status Inactive --user-name <user>
   ```

2. **Retirer des groupes** — Supprimer l'utilisateur des groupes IAM (DevOps, Dev) :
   ```bash
   aws iam remove-user-from-group --user-name <user> --group-name DevOps
   ```

3. **Révoquer les sessions actives** — Appliquer une politique de refus global pour invalider immédiatement :
   ```json
   {
     "Effect": "Deny",
     "Action": "*",
     "Resource": "*"
   }
   ```

4. **Révoquer les tokens GitHub** — Dans GitHub, Settings → Developer settings → Personal access tokens, révoquer les tokens du développeur.

5. **Renouveler les secrets** — Si le développeur avait accès à `db_password` ou `JWT_SECRET` :
   - Rotation du `JWT_SECRET` → tous les services redémarrent avec nouveau secret
   - Rotation du `db_password` → toutes les applications reconnectées

**Vérifications (J+7) :**

6. **Audit CloudTrail** — Vérifier qu'aucune action n'a été effectuée par cet utilisateur depuis J0
7. **Supprimer l'utilisateur** si aucune anomalie détectée

### 5. Politique de rotation des clés

#### Fréquence

| Clé | Fréquence | Méthode | Justification |
|-----|-----------|---------|---------------|
| `db_password` RDS | Tous les 90 jours | AWS Secrets Manager rotation automatique | Recommandation CIS AWS Foundations |
| `JWT_SECRET` | Tous les 180 jours | Rotation manuelle avec re-déploiement ECS | Impact fort (tous les tokens invalidés) |
| AWS Access Keys (IAM) | Tous les 90 jours | Rotation avec 2 clés (pré-rotation) | Recommandation NIST SP 800-63 |
| Clés KMS | Tous les 365 jours | AWS KMS auto-rotation (annuelle) | Automatique, aucun impact applicatif |

#### Procédure de rotation du mot de passe RDS

```bash
# Étape 1 : Générer un nouveau mot de passe
NEW_PASSWORD=$(openssl rand -base64 32)

# Étape 2 : Modifier le mot de passe RDS
aws rds modify-db-instance \
  --db-instance-identifier digitrans-prod \
  --master-user-password "$NEW_PASSWORD" \
  --apply-immediately

# Étape 3 : Mettre à jour le secret dans AWS Secrets Manager
aws secretsmanager update-secret \
  --secret-id digitrans/db_password \
  --secret-string "$NEW_PASSWORD"

# Étape 4 : Redéployer ECS (les nouvelles tâches lisent le secret)
aws ecs update-service --cluster digitrans-cluster --service erp-service --force-new-deployment

# Étape 5 : Vérifier que toutes les tâches sont stables
aws ecs wait services-stable --cluster digitrans-cluster --services erp-service crm-service supply-chain-service bi-service
```

### 6. Plan de réponse aux incidents

#### Classification des incidents

| Niveau | Exemple | Temps de réponse | Notification |
|--------|---------|------------------|--------------|
| **P1 Critique** | Fuite de données clients, clé root compromise, RDS down | < 15 min | DG AGROCAM + CNPD (72h) |
| **P2 Élevé** | Brèche IAM, tentative d'intrusion détectée | < 1h | RSSI + DPO |
| **P3 Moyen** | Erreur applicative 5xx, latence dégradée | < 4h | Équipe DevOps |
| **P4 Faible** | Warning de capacité, certificat proche expiration | < 48h | Équipe DevOps |

#### Procédure Incident P1

```
1. DÉTECTION
   │
   ├── Alert CloudWatch / Prometheus
   └── Signalement manuel

2. CONTENANCE (15 min)
   │
   ├── IAM : Désactiver les clés compromises
   ├── Network : Appliquer un WAF block rule ou modifier les SGs
   └── ECS : Réduire à 0 le desired_count du service impacté

3. ÉRADICATION (1h)
   │
   ├── Analyse CloudTrail + GuardDuty → identifier la cause racine
   ├── Rotation des secrets exposés
   └── Snapshot forensic RDS avant nettoyage

4. RÉCUPÉRATION (2h)
   │
   ├── Restore RDS depuis snapshot (PITR si perte de données)
   ├── Redéploiement ECS avec images sécurisées
   └── Validation des services (health + smoke tests)

5. POST-MORTEM (J+7)
   │
   ├── Rapport d'incident
   ├── Correction des failles identifiées
   └── Mise à jour du plan de réponse
```

#### Notification des parties prenantes

| Partie prenante | Canal | Délai | Information à transmettre |
|----------------|-------|-------|---------------------------|
| RSSI | Email + Téléphone | Immédiat | Nature de l'incident, services impactés, premières actions |
| DPO | Email | < 24h | Données personnelles éventuellement compromises |
| **CNPD (Cameroun)** | Email officiel | **< 72h** (loi n°2010/012 art. 45) | Voir template ci-dessous |
| Clients impactés | Email | < 7j | Nature, risques, mesures prises |
| Assureur cyber | Email | < 30j | Rapport d'incident complet |

#### Template de notification CNPD (délai légal : 72h)

```
OBJET : Notification d'incident de sécurité — DIGITRANS-CM — AGROCAM S.A.

À l'attention de la Commission Nationale pour la Protection des Données (CNPD)
Yaoundé, Cameroun

--- 1. Description de l'incident ---
Date et heure de détection :   [JJ/MM/AAAA HH:MM]
Nature de l'incident :         [ ] Fuite de données
                                [ ] Accès non autorisé
                                [ ] Déni de service
                                [ ] Perte d'intégrité
                                [ ] Autre : _______________
Systèmes impactés :            [RDS / S3 / ECS / Blockchain Fabric / API Gateway]
Volume de données :            [Nombre d'enregistrements / Taille estimée]

--- 2. Catégories de données concernées ---
[ ] Données personnelles (nom, email, téléphone)
[ ] Données financières (salaires, transactions)
[ ] Données de santé
[ ] Données de traçabilité (loi n°2010/012)
[ ] Identifiants techniques (logs, tokens)
[ ] Aucune donnée personnelle

--- 3. Mesures prises ---
Contenance :                   [Désactivation des accès, blocage réseau, snapshot]
Notification en interne :      [RSSI / DPO informé le JJ/MM/AAAA à HH:MM]
Correction :                   [Rotation des secrets / correctif déployé / nouveau certificat]

--- 4. Contacts ---
RSSI :                         [Nom, téléphone, email]
DPO :                          [Nom, téléphone, email]
Responsable juridique :        [Nom, téléphone, email]

--- 5. Pièces jointes ---
[ ] Journal d'audit CloudTrail
[ ] Logs applicatifs
[ ] Rapport d'analyse forensique (si disponible)

Nous restons à votre disposition pour tout complément d'information.

Signature : _________________
Fonction : RSSI — AGROCAM S.A.
Date :     JJ/MM/AAAA
```

### 7. Chiffrement des données

#### Chiffrement en transit

| Couche | Technologie | Configuration | Fichier de preuve |
|--------|-------------|---------------|-------------------|
| **Transport (ALB)** | TLS 1.3, certificat ACM | ALB listener HTTPS port 443, HTTP→HTTPS redirect | `terraform/modules/alb/main.tf:25-45` |
| **Inter-services** | TLS mutuel (mTLS) | Auth Gateway injecte `X-User-Id` header aux services internes (pas de Authorization transmis) | `auth-gateway/src/middleware/auth.middleware.js` |
| **RDS** | TLS natif PostgreSQL | `sslmode=require` dans la chaîne de connexion | `erp-service/config/db.js` |
| **Redis** | Encryption in-transit (AUTH token) | `REDIS_URL` avec mot de passe + TLS | `terraform/modules/redis/main.tf:16` |

#### Chiffrement au repos

| Service | Technologie | Fichier de preuve |
|---------|-------------|-------------------|
| **RDS PostgreSQL** | Encryption at rest (AES-256) via AWS KMS | `terraform/modules/rds/main.tf:25` |
| **S3** | AES-256 (SSE-S3) + versioning + lifecycle | `terraform/modules/s3/main.tf:1-40` |
| **ElastiCache Redis** | Encryption at rest activée | `terraform/modules/redis/main.tf:17` |
| **ECS Task definitions** | Variables d'environnement sensibles via Secrets Manager | `terraform/modules/ecs/main.tf:76-93` |

### 8. Guide de bonnes pratiques sécurité Cloud

Ce guide est adapté au contexte spécifique d'AGROCAM S.A. au Cameroun : contraintes de connectivité (coupures fréquentes à Douala), exigences de souveraineté des données (loi n°2010/012), et besoin de traçabilité blockchain.

#### 1. Moindre privilège IAM — Contexte AGROCAM

**Pratique :** Chaque utilisateur AWS reçoit uniquement les permissions nécessaires à son rôle. Les politiques Deny explicites protègent les ressources critiques.

**Pourquoi c'est vital pour AGROCAM :** Avec 3 développeurs et des stagiaires, le risque d'erreur humaine est élevé. Un développeur avec des droits admin pourrait supprimer la base de production par inadvertance. Les politiques JSON détaillées (section 3) empêchent cela : un développeur ne peut PAS `rds:DeleteDBInstance`, seul AdminCloud le peut.

**Preuve :** `terraform/modules/iam/main.tf` — la politique `ecs_task_role` et `ecs_exec_role` appliquent le moindre privilège.

#### 2. Network segmentation — Isolement des données camerounaises

**Pratique :** Subnets privés pour toutes les bases de données, Security Groups avec règle de moindre accès (ALB → ECS → RDS/Redis). Aucun service n'a d'IP publique sauf l'ALB.

**Pourquoi c'est vital pour AGROCAM :** La loi camerounaise n°2010/012 exige que les données des citoyens restent sur le territoire. Le réseau privé AWS (VPC) garantit qu'aucune donnée ne transite par l'internet public entre les services. Les SGs empêchent tout accès non autorisé aux bases.

**Preuve :** `terraform/modules/security/main.tf` — SGs avec règles entrantes limitées aux sous-réseaux privés et aux services autorisés.

#### 3. Patch management — Résilience face aux coupures

**Pratique :** ECS Fargate élimine la gestion OS (AWS patch automatiquement). RDS reçoit les mises à jour mineures automatiquement. Les images Docker sont rebuildées chaque semaine.

**Pourquoi c'est vital pour AGROCAM :** Les coupures réseau à Douala peuvent empêcher les mises à jour manuelles. Un système qui nécessite une connexion internet pour patcher est vulnérable. Fargate et RDS sont patchés par AWS sans intervention humaine. En mode offline, les agents terrain utilisent la queue Redis (sync.worker.js) et synchronisent à la reconnexion — pas besoin de patch pour ça.

**Preuve :** `supply-chain-service/src/sync/sync.worker.js:96-128` — mécanisme offline-first.

#### 4. Audit et logs — Conformité n°2010/012

**Pratique :** CloudTrail activé sur toutes les régions AWS, CloudWatch Logs avec rétention 90 jours (prod) / 30 jours (dev/test), logs d'accès ALB activés, logs Fabric blockchain.

**Pourquoi c'est vital pour AGROCAM :** La loi n°2010/012 exige la traçabilité des accès. Les logs CloudTrail + CloudWatch + Fabric fournissent une piste d'audit complète : qui a accédé à quoi, quand, et depuis où. En cas de contrôle CNPD, AGROCAM peut produire ces logs.

**Preuve :** `terraform/monitoring.tf` — `aws_cloudwatch_log_group`, `aws_cloudwatch_metric_alarm`, `aws_cloudwatch_dashboard`.

#### 5. Secrets management — Protection des accès BDD

**Pratique :** Aucun mot de passe en clair dans le code. AWS Secrets Manager stocke les secrets (db_password, JWT_SECRET) avec rotation automatique. `.env` jamais commité (`.gitignore` + `.env.example`).

**Pourquoi c'est vital pour AGROCAM :** Le code source circule entre 3 développeurs et des stagiaires. Un mot de passe RDS en clair dans un fichier `.env` commité par erreur exposerait toutes les bases de données. Secrets Manager chiffre les secrets (AES-256) et les rotent automatiquement tous les 90 jours.

**Preuve :** `.gitignore` (fichiers `.env` exclus), `terraform/modules/ecs/main.tf:76-93` (variables sensibles passées en environment, lues depuis Secrets Manager).

#### 6. Backup et DRP — Continuité d'activité

**Pratique :** RDS backup automatique 30 jours + snapshot manuel avant chaque déploiement. S3 versioning activé. State Terraform sur S3 avec locking. Plan de reprise documenté dans `docs/drp.md`.

**Pourquoi c'est vital pour AGROCAM :** En cas de sinistre (incendie, inondation à Douala), AGROCAM doit pouvoir restaurer son SI rapidement. RDS Multi-AZ + PITR (Point-In-Time Recovery) permet de revenir à n'importe quel moment des 30 derniers jours. RTO (Recovery Time Objective) cible : 4 heures. RPO (Recovery Point Objective) : 5 minutes.

**Preuve :** `docs/drp.md` — procédures de restauration complètes (RDS, S3, ECR, Terraform).

#### 7. Sécurité humaine et développement

**Pratique :** Validation des pull requests par un pair (4-eyes principle), formation sécurité annuelle, interdiction des `console.log` en production (vérifié par ESLint + CI/CD).

**Pourquoi c'est vital pour AGROCAM :** Les erreurs de sécurité viennent souvent d'une méconnaissance (ex: un développeur expose une API sans auth). Les PR reviews permettent de détecter ces erreurs avant le déploiement. Le linter ESLint (`no-console` sauf `warn`/`error`) empêche la fuite de données debug en production.

**Preuve :** `.eslintrc.json` (règle `no-console`), `.github/workflows/ci-cd.yml:15-23` (étape lint obligatoire).

---

## II.3. Sécurité des transactions et des données

### 1. Plateforme blockchain retenue : Hyperledger Fabric

**Choix :** Hyperledger Fabric 2.5

**Justification face aux contraintes du projet :**

| Contrainte | Hyperledger Fabric | Ethereum (écarté) | Pourquoi pas Hyperledger Besu |
|------------|-------------------|-------------------|------------------------------|
| **Latence réseau** | Transactions < 1s (confirmation immédiate) | ~12s (Ethereum), secondes (privé) | Fabric n'a pas besoin d'attente de bloc pour finalité |
| **Hébergement Cameroun** | On-premise ou AWS (géré par le client) | Besoin d'infrastructure mining ou Infura | Fabric s'installe sur n'importe quel serveur |
| **Budget** | Gratuit (open source), pas de gas fees | Gas fees sur Ethereum public | Fabric = coût d'infrastructure uniquement |
| **Souveraineté des données** | Données stockées uniquement sur les nœuds autorisés | Données potentiellement répliquées publiquement | Fabric respecte la loi n°2010/012 |
| **Confidentialité** | Canaux privés entre sous-ensembles de pairs | Public par défaut | Les concurrents d'AGROCAM ne voient pas leurs données respectives |

**Architecture Fabric mise en œuvre :**

`Fichier : chaincode/supply-chain-contract.js` — Smart contract complet

### 2. Structure d'un bloc

```
┌────────────────────────────────────────────────────────┐
│                        BLOCK N                         │
├────────────────────────────────────────────────────────┤
│  HEADER                                                  │
│  ├── Block Number: 42                                   │
│  ├── Previous Hash: 0x7f3b... (hash du bloc N-1)        │
│  ├── Data Hash: 0x9a2c... (hash des transactions)        │
│  └── Timestamp: 2026-05-21T14:30:00Z                    │
├────────────────────────────────────────────────────────┤
│  DATA                                                    │
│  ├── Transaction 1: createShipment(...)                  │
│  ├── Transaction 2: recordCheckpoint(...)                │
│  └── Transaction 3: updateShipmentStatus(...)            │
├────────────────────────────────────────────────────────┤
│  METADATA                                                │
│   ├── Creator: Org1MSP (identité du signataire)          │
│   ├── Signature: 0x3f8a...                              │
│   ├── Endorsements: [Org1MSP, Org2MSP]                  │
│   └── Last Block Hash: 0x7f3b... (→ BLOCK N+1)         │
└────────────────────────────────────────────────────────┘
```

#### Hachage et Merkle Tree

Hyperledger Fabric utilise **SHA-256** (Secure Hash Algorithm 256 bits) pour garantir l'intégrité :

1. **Lien entre blocs :** Chaque bloc contient le hash SHA-256 du bloc précédent (`Previous Hash`). Si quelqu'un modifie un bloc passé, son hash change, et la chaîne est cassée → détection immédiate.

2. **Merkle Tree (arbre de Merkle) :** Les transactions d'un bloc ne sont pas stockées en clair dans l'en-tête. Elles sont organisées en arbre de Merkle :
   - Chaque transaction est hashée individuellement (SHA-256)
   - Les hashs sont groupés par paires et re-hashés
   - La racine de l'arbre (`Data Hash` dans le header) représente l'ensemble des transactions

```
        ┌───────────── Root Hash ─────────────┐
        │                                      │
   ┌──── Hash(AB) ────┐                 ┌──── Hash(CD) ────┐
   │                   │                 │                   │
 Hash(A)             Hash(B)          Hash(C)             Hash(D)
   │                   │                 │                   │
 Tx A               Tx B               Tx C               Tx D
```

**Propriété importante :** Pour vérifier qu'une transaction appartient au bloc, on n'a pas besoin de toutes les transactions — seulement le chemin de hashs jusqu'à la racine (vérification en O(log n)). C'est ce qu'on appelle une **preuve de Merkle**.

3. **Historique Fabric :** `getHistoryForKey()` ne lit pas les blocs un par un. Fabric maintient un index de l'historique de chaque clé. Chaque entrée dans l'historique contient le `txId` de la transaction qui a modifié la clé, permettant de remonter au bloc correspondant.

**Intégrité garantie par :**
- **SHA-256** entre les blocs (`Previous Hash` → chaîne liée cryptographiquement)
- **Merkle Tree** dans chaque bloc (`Data Hash` → intègre toutes les transactions)
- **Signature Fabric** dans la metadata (endorsements signés par les pairs)
- L'historique est immuable car modifier un bloc changerait son hash, cassant la chaîne

**Preuve :** `chaincode/supply-chain-contract.js:59-80` — fonction `updateShipmentStatus` qui enregistre l'historique

### 3. Mécanisme de consensus : Raft (et non PoW/PoS)

**Choix :** Raft (consensus par crash-tolerance, intégré dans Fabric)

**Pourquoi Raft pour AGROCAM :**

| Consensus | Usage | Pourquoi pas pour AGROCAM |
|-----------|-------|---------------------------|
| **Proof of Work** | Bitcoin, public | ⛔ Trop lent (10 min/bloc), énergie massive, pas de permission |
| **Proof of Stake** | Ethereum 2.0, public | ⛔ Nécessite token natif, validation ouverte à tous |
| **Raft (choisi)** | Fabric privé | ✅ Finalité immédiate, tolérant aux pannes (pas aux byzantins), ne nécessite pas de cryptomonnaie |

**Fonctionnement Raft :**
- Leader élu parmi les nœuds (orderers)
- Le leader propose des blocs, les followers les valident
- Si le leader tombe, un nouveau leader est élu en quelques secondes
- Pas de fork possible : une seule chaîne valide à tout moment

**Avantage pour AGROCAM :** En cas de coupure réseau à Douala (fréquente), Raft tolère la perte de nœuds tant qu'une majorité est en vie. Les agents terrain continuent à collecter des données offline, synchronisées via Redis à la reconnexion.

**Preuve :** `supply-chain-service/src/sync/sync.worker.js:1-145` — mécanisme offline-first avec queue Redis + dédoublonnage

### 4. Conformité avec la loi camerounaise n°2010/012

La loi n°2010/012 impose la **traçabilité des accès aux systèmes d'information**. Notre solution blockchain répond par :

| Exigence légale | Implémentation technique | Preuve |
|----------------|-------------------------|--------|
| **Identification** | Chaque transaction Fabric contient `ctx.clientIdentity.getID()` (certificat X.509 du signataire) | `chaincode/supply-chain-contract.js:33` |
| **Horodatage légal** | `timestamp` signé dans chaque transaction, enregistré dans le bloc | `chaincode/supply-chain-contract.js:24` |
| **Non-répudiation** | Signature Fabric + historique immuable (`getHistoryForKey`) | `chaincode/supply-chain-contract.js:105-118` |
| **Conservation** | Les données blockchain sont immuables par conception, impossible de les modifier a posteriori | Propriété fondamentale de Fabric |
| **Journal d'accès** | CloudTrail + CloudWatch Logs conservent les accès AWS (console et API) | `terraform/monitoring.tf` |

#### Procédure formelle de réponse à une demande CNPD

Conformément à la loi n°2010/012 et aux directives de la CNPD, AGROCAM S.A. s'engage à répondre à toute demande d'accès, de rectification ou de justification de traçabilité selon la procédure suivante :

1. **Réception de la demande** — La CNPD adresse une demande écrite (email ou courrier) au DPO d'AGROCAM. Délai de réponse légal : **15 jours ouvrés** (art. 47 de la loi n°2010/012).

2. **Identification du périmètre** — Le DPO détermine :
   - Quelles expéditions / données sont concernées
   - Quelle période temporelle
   - Quel type de données (personnelles, financières, traçabilité)

3. **Extraction des preuves blockchain** — L'équipe technique exécute :
   ```javascript
   // Récupération de l'historique complet d'une expédition
   const history = await contract.evaluateTransaction("getShipmentHistory", shipmentId);
   // Vérification de l'intégrité de la chaîne
   const integrity = await contract.evaluateTransaction("verifyChainIntegrity", fromId, toId);
   ```
   Résultat : liste de toutes les transactions avec identité du signataire, timestamp, et hash du bloc.

4. **Cross-vérification** — L'équipe rapproche les données blockchain avec :
   - **CloudTrail** : logs des accès AWS pendant la période concernée
   - **CloudWatch Logs** : logs applicatifs (API calls, sync offline)
   - **Sync queue** : enregistrements de synchronisation terrain

5. **Rédaction du rapport** — Le DPO compile un dossier comprenant :
   - Les données extraites de la blockchain
   - Les logs CloudTrail associés
   - La liste des personnes ayant accédé aux données
   - La justification de la conservation (durée, base légale)

6. **Envoi à la CNPD** — Transmission par email officiel avec accusé de réception dans les délais légaux.

**Fichiers de preuve mobilisables :**
- `chaincode/supply-chain-contract.js:105-118` — `getShipmentHistory`
- `chaincode/supply-chain-contract.js:120-138` — `verifyChainIntegrity`
- `terraform/monitoring.tf` — CloudWatch Logs et métriques
- `supply-chain-service/src/sync/sync.worker.js:79-83` — table `sync_queue` (audit trail)

### 5. Smart contract développé

**Langage :** Node.js (JavaScript) — `fabric-contract-api` SDK

**Fichier :** `chaincode/supply-chain-contract.js` — 120 lignes

**Package :** `chaincode/package.json`

**Fonctions principales :**

| Fonction | Déclencheur | Description |
|----------|-------------|-------------|
| `createShipment(id, ...)` | API `POST /shipments` | Crée une expédition sur le ledger Fabric avec statut "pending" |
| `updateShipmentStatus(id, status)` | API `PATCH /shipments/:id` | Met à jour le statut (in_transit, delivered, delayed...) et enregistre dans l'historique |
| `recordCheckpoint(id, shipmentId, ...)` | API `POST /checkpoints` / sync offline | Enregistre un point de contrôle (géolocalisation, statut) |
| `getShipment(id)` | API `GET /shipments/:id` | Lecture de l'état courant |
| `getShipmentHistory(id)` | API `GET /shipments/:id/history` | Historique complet (toutes les modifications de l'expédition) |
| `verifyChainIntegrity(fromId, toId)` | API `GET /audit/chain` | Vérifie la continuité de la chaîne entre deux expéditions (audit) |

### 6. Interaction smart contract ↔ SI AGROCAM (flux technique)

```
Événement déclencheur :
Agent terrain scanne un QR code à un checkpoint → application mobile

Étape 1 — Offline (agent sans connexion)
  ├── Les données sont stockées localement sur le téléphone
  └── Un offline_id est généré côté client (UUID)

Étape 2 — Sync (connexion restaurée)
  ├── L'agent appelle POST /api/supply-chain/sync/push
  ├── La requête est validée par Joi (schéma) → rejetée si mal formée
  ├── Le payload est mis dans une queue Redis (LPUSH sync:queue)
  └── Réponse HTTP 202 "Données acceptées"

Étape 3 — Traitement asynchrone (sync worker)
  ├── Le worker dépile la queue Redis (RPOP)
  ├── Vérification dédoublonnage par offline_id
  ├── INSERT/UPDATE dans PostgreSQL (persistance transactionnelle)
  ├── Appel à Hyperledger Fabric via fabric.client.js :
  │   └── contract.submitTransaction("recordCheckpoint", ...)
  │       ├── Fabric endorsseurs valident la transaction
  │       ├── Bloc créé et ajouté à la chaîne
  │       └── Transaction ID retournée
  └── Log dans sync_queue (table de audit)

Étape 4 — Vérification
  ├── API GET /api/supply-chain/shipments/:id/history
  │   └── Fabric : getHistoryForKey() → historique complet
  └── API GET /api/supply-chain/audit/chain
      └── Vérifie les hashs entre blocs consécutifs
```

**Fichiers de preuve :**
- `supply-chain-service/src/routes/sync.routes.js:41-73` — endpoint push
- `supply-chain-service/src/sync/sync.worker.js:26-85` — processQueueItem
- `supply-chain-service/src/blockchain/fabric.client.js:114-135` — recordCheckpointOnChain
- `chaincode/supply-chain-contract.js:74-92` — recordCheckpoint smart contract

### 7. Bonnes pratiques de sécurité du smart contract

#### Appliquées dans le code

| Pratique | Code | Explication |
|----------|------|-------------|
| **Vérification d'existence** | `_assetExists(id)` avant `createShipment` | `chaincode/supply-chain-contract.js:85-87` — empêche d'écraser une expédition existante |
| **Validation des entrées** | `parseFloat`, `|| ""` sur les paramètres | `chaincode/supply-chain-contract.js:30-35` — évite les injections NaN/undefined |
| **Identification forte** | `ctx.clientIdentity.getID()` | `chaincode/supply-chain-contract.js:33` — chaque transaction est signée |
| **Historique conservé** | `push` dans `history[]` avant `putState` | `chaincode/supply-chain-contract.js:40-46` — toute modification est tracée |
| **Gestion d'erreur** | `throw new Error()` avec message clair | `chaincode/supply-chain-contract.js:53` — pas de crash silencieux |

#### Vulnérabilités classiques évitées

**1. Reentrancy Attack**

*Problème :* Un contrat appelé depuis un autre contrat peut rappeler le contrat original avant que le premier appel ne soit terminé, vidant son solde.

*Protection mise en place :* Notre smart contract Fabric n'utilise aucune ressource partagée modifiable entre appels. Chaque transaction Fabric est atomique : `putState` est la dernière opération, les vérifications (existence) sont faites avant. Pas d'appel externe possible dans le contrat → pas de reentrancy.

**2. Integer Overflow**

*Problème :* Un débordement d'entier peut transformer `balance = balance - amount` en valeur énorme si `amount > balance` sans vérification.

*Protection mise en place :* Dans notre contrat, les `quantity` sont limitées par `parseFloat` et utilisées uniquement pour l'affichage/déclaration, pas pour des calculs critiques de solde. Le type `DECIMAL(15,2)` en PostgreSQL et le JavaScript `Number` gèrent les bornes. Les validations sont faites côté API (Joi) avant d'atteindre le smart contract.

**3. Time Manipulation (Timestamp Attack)**

*Problème :* Un attaquant peut manipuler le timestamp d'une transaction pour falsifier l'ordre chronologique des événements (ex : déclarer une livraison comme arrivée avant son départ).

*Protection mise en place :* Dans notre contrat (`chaincode/supply-chain-contract.js:24`), le `timestamp` est celui du bloc Fabric, pas celui du client. Fabric garantit que le timestamp est celui de l'orderer (nœud de confiance), pas celui du proposant. De plus, l'historique (`history[]`) enregistre chaque état séquentiellement : impossible d'insérer un état entre deux déjà existants.

**4. Access Control — Fonctions non protégées**

*Problème :* Dans un smart contract, une fonction comme `updateShipmentStatus` pourrait être appelée par n'importe qui si elle n'est pas correctement protégée.

*Protection mise en place :* Notre contrat utilise `ctx.clientIdentity.getID()` pour identifier le signataire de chaque transaction (`chaincode/supply-chain-contract.js:33`). Au niveau Fabric, le contrôle d'accès est double :
   - **MSP (Membership Service Provider)** : seuls les pairs autorisés par le canal peuvent soumettre des transactions
   - **Application RBAC** : l'API Gateway (`auth-gateway/src/middleware/auth.middleware.js`) vérifie le rôle JWT avant d'appeler `submitTransaction`
   - Le chaincode lui-même pourrait implémenter une ACL (ex. : seuls les appartenant à `AgrocamMSP.admin` peuvent créer des expéditions), mais dans cette version, le contrôle est délégué à l'API Gateway (principe de défense en profondeur)

**5. Transaction Replay Attack**

*Problème :* Un attaquant intercepte une transaction valide (ex: "checkpoint passer à Douala") et la rejoue plusieurs fois pour créer de faux enregistrements.

*Protection mise en place :* Fabric intègre nativement un mécanisme anti-replay via le `txId` unique généré pour chaque transaction. De plus, notre contrat vérifie l'existence de l'asset avant création (`_assetExists` à la ligne 85). Côté application, le dédoublonnage par `offline_id` (`sync.worker.js:31-40`) empêche la soumission multiple du même enregistrement.

### 8. Procédure en cas de clé privée compromise (question situationnelle)

**Contexte :** Une clé privée d'un nœud Fabric est compromise. Coupures réseau fréquentes à Douala.

**Procédure :**

```
Phase 1 — Détection et isolation (immédiat)
│
├── Identifier le nœud compromis via les logs Fabric + CloudTrail
├── Isoler le nœud du réseau :
│   └── Security Group : supprimer les règles entrantes du nœud
├── Révoquer le certificat Fabric :
│   └── fabric-ca-client revoke -e <cert_id>
└── NOTIFICATION : RSSI + DPO (P1)

Phase 2 — Continuité avec coupures réseau
│
├── Problème : Douala a des coupures fréquentes
├── Solution : Architecture dégradée déjà en place
│   ├── Les autres nœuds continuent (Raft tolère n-1 pannes)
│   └── Les agents terrain passent en mode OFF :
│       ├── Données enregistrées localement (app mobile)
│       └── Sync via Redis queue à la reconnexion
│           (sync.worker.js avec retry + dead-letter queue)

Phase 3 — Reconstruction
│
├── Déployer un nouveau nœud Fabric de remplacement
├── Générer un nouveau certificat via la CA Fabric
├── Synchroniser le nouveau nœud avec l'état actuel du ledger
│   (Fabric synchronise automatiquement depuis les pairs sains)
└── Réintégrer le nœud dans le canal supplychain-channel

Phase 4 — Post-incident
│
├── Analyser les logs du nœud compromis → comprendre le vecteur d'attaque
├── Si nécessaire, faire une rotation des certificats de TOUS les nœuds
│   (mesure radicale mais garantit l'intégrité)
├── Mise à jour du plan de réponse
└── Rapport CNPD si données personnelles impliquées
```

**Preuve du offline-first :** `supply-chain-service/src/sync/sync.worker.js:96-128` — queue Redis avec retry et dead-letter

### 9. Extension vers un consortium international

**Scénario :** AGROCAM veut inclure ses partenaires européens (exportateurs de cacao, clients) tout en gardant la souveraineté des données camerounaises.

#### Architecture cible

```
┌─────────────────────────┐     ┌────────────────────────┐
│   AGROCAM (Cameroun)    │     │   Partenaire (UE)       │
│                         │     │                         │
│  ┌───────────────────┐  │     │  ┌───────────────────┐  │
│  │ Nœud Fabric #1     │  │     │  │ Nœud Fabric #4    │  │
│  │ (Orderer + Peer)   │  │     │  │ (Peer uniquement) │  │
│  └───────────────────┘  │     │  └───────────────────┘  │
│  ┌───────────────────┐  │     │                         │
│  │ Nœud Fabric #2     │  │     └────────────────────────┘
│  │ (Peer)             │  │
│  └───────────────────┘  │
│  ┌───────────────────┐  │
│  │ Nœud Fabric #3     │  │
│  │ (CA + Peer)        │  │
│  └───────────────────┘  │
└─────────────────────────┘
```

#### Adaptations architecturales

| Domaine | Solution technique | Justification |
|---------|-------------------|---------------|
| **Données sensibles** | Canaux privés Fabric (channels) | Les données camerounaises (loi n°2010/012) restent dans un channel où seuls les pairs AGROCAM sont invités |
| **Visibilité partielle** | Private Data Collections (PDC) | Les partenaires voient les métadonnées (statut, date), pas les données internes (salaires, fournisseurs) |
| **Consensus** | Raft étendu aux orderers des partenaires | Chaque organisation a son propre orderer pour éviter la domination d'un seul acteur |
| **Identité** | MSP (Membership Service Provider) distincts | Chaque organisation gère ses propres certificats X.509 |
| **Géolocalisation** | Nœuds UE + Cameroun | Raft tolère la latence intercontinentale (l'ordre des transactions est asynchrone) |
| **Souveraineté** | Gateway API devant chaque cluster Fabric | Le partenaire n'accède jamais directement aux nœuds AGROCAM, passe par une API Gateway qui filtre les données |

#### Flux de travail consortium

```
1. AGROCAM crée une expédition sur son channel privé
   ├── Données complètes : origine, prix, transporteur...
   └── Seulement visibles par les pairs AGROCAM

2. AGROCAM partage un résumé sur le channel consortium
   ├── Données limitées : shipment_ref, statut, ETA
   └── Visibles par tous les partenaires du consortium

3. Le partenaire UE interroge :
   ├── GET /api/consortium/shipments/{ref}
   │   → Données filtrées (pas les prix internes)
   └── GET /api/consortium/shipments/{ref}/history
       → Historique des statuts uniquement
```

**Respect de la loi n°2010/012 :** Les données brutes ne quittent jamais les serveurs camerounais. Seules les données agrégeées et autorisées par le contrat sont partagées via le channel consortium.

#### Conformité RGPD (partenaires européens)

L'extension aux partenaires européens implique la conformité au **Règlement Général sur la Protection des Données (RGPD)** :

| Exigence RGPD | Implémentation dans le consortium |
|---------------|----------------------------------|
| **Base légale du transfert** | Les données transférées aux partenaires UE sont limitées aux métadonnées (statut, dates, shipment_ref). Pas de données personnelles. Base légale : intérêt légitime (art. 6.1.f) |
| **Clauses Contractuelles Types (CCT)** | Un contrat de consortium signé par toutes les parties inclut les CCT de la Commission Européenne pour le transfert de données vers un pays tiers |
| **DPO** | Chaque organisation nomme un DPO. Le DPO d'AGROCAM coordonne avec les DPO européens |
| **Privacy Impact Assessment (PIA)** | Une analyse d'impact est réalisée avant le déploiement du canal consortium |
| **Droit à l'effacement** | La blockchain étant immuable, les données ne peuvent pas être effacées. Solution : les données à caractère personnel ne sont JAMAIS inscrites sur le ledger (uniquement des hashs ou des références). Les données brutes restent dans PostgreSQL (effaçables) |
| **Notification de violation** | 72h (RGPD art. 33) — compatible avec le délai CNPD |

#### Interopérabilité des MSP (Membership Service Providers)

Chaque organisation du consortium conserve son propre **MSP** :

```
AGROCAM MSP (Cameroun)
├── CA Root : AgrocamCA.pem
├── Admin : admin.agrocam@cert
├── Peers : peer0.agrocam, peer1.agrocam
└── Orderer : orderer.agrocam

Partenaire UE MSP (Exportateur)
├── CA Root : ExporterCA.pem
├── Admin : admin.exporter@cert
├── Peers : peer0.exporter
└── (pas d'orderer — utilise celui d'AGROCAM pour le channel consortium)
```

**Défis techniques et solutions :**

| Défi | Solution |
|------|----------|
| **Union de CAs différentes** | La `configtx.yaml` du canal déclare les deux MSP comme membres du consortium. Chaque MSP valide ses propres certificats |
| **Révocation intersite** | La CRL (Certificate Revocation List) de chaque CA est diffusée sur le canal via les blocs de configuration Fabric |
| **Nommage des identités** | Convention : `<role>.<organisation>.<type>` (ex : `admin.agrocam.admin`, `peer0.exporter.peer`) |
| **Latence intercontinentale** | Les orderers sont répartis (Cameroun + UE). Raft tolère la latence. Timeout de bloc augmenté à 2s (au lieu de 500ms par défaut) |

---

*CAMTECH SOLUTIONS S.A. — Projet DIGITRANS-CM — 2025/2026*
