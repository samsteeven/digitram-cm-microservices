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

| Rôle AWS | Utilisateur | Droits | Principe |
|----------|-------------|--------|----------|
| **AdminCloud** | Administrateur DevOps | `AdministratorAccess` (limité à vie courte via STS) | Accès total mais temporaire (MFA + session 1h) |
| **DevOps** | Ingénieur CI/CD | ECR push/pull, ECS update-service, CloudWatch logs, S3 read/write sur buckets dev | Déploiement uniquement, pas de modification RDS/Redis en prod |
| **Dev** | Développeur | ECR pull, CloudWatch logs read, S3 read sur buckets dev, EC2 describe | Lecture seule sur la prod, écriture limitée au dev |
| **BI-Analyst** | Analyste métier | RDS read-only sur `bi_db`, S3 read sur bucket analytics, QuickSight | Pas de modification, pas d'accès aux bases métier (ERP/CRM) |
| **AgentTerrain** | Mobile app | `execute-api` sur API Gateway, aucun accès AWS console | Uniquement appel API, jamais de clé AWS directe |

#### Politique `Deny` explicite (Safety Net)

```json
{
  "Effect": "Deny",
  "Action": ["rds:DeleteDBInstance", "s3:DeleteBucket", "iam:DeleteRole"],
  "Resource": "*",
  "Condition": {
    "StringNotEquals": { "aws:PrincipalARN": "arn:aws:iam::*:role/AdminCloud" }
  }
}
```

Seul `AdminCloud` peut supprimer des ressources critiques.

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

| Partie prenante | Canal | Délai | Information |
|----------------|-------|-------|-------------|
| RSSI | Email + Téléphone | Immédiat | Nature, impact, actions en cours |
| DPO | Email | < 24h | Si données personnelles impliquées |
| CNPD (Cameroun) | Email officiel | < 72h | Conformité loi n°2010/012 |
| Clients impactés | Email | < 7j | Si données clients compromises |
| Assureur cyber | Email | < 30j | Pour activation garantie |

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

#### Principes fondamentaux

1. **Moindre privilège IAM**
   - Jamais de clé IAM root, jamais de `*` dans une politique (sauf Deny)
   - Utiliser des rôles (pas des utilisateurs) pour les applications
   - `terraform/modules/iam/main.tf` applique ce principe

2. **Network segmentation**
   - Subnets privés pour les bases de données (pas d'IP publique)
   - Security Groups : ALB↔ECS↔RDS/Redis, pas d'0.0.0.0/0 entrant
   - `terraform/modules/security/main.tf`

3. **Patch management**
   - ECS Fargate = pas de gestion OS
   - RDS : activer les mises à jour mineures automatiques
   - Images Docker : rebuild hebdomadaire avec `docker build --no-cache`

4. **Audit et logs**
   - CloudTrail activé sur tous les comptes AWS
   - CloudWatch Logs avec rétention : 90j prod, 30j dev/test
   - Logs d'accès ALB activés

5. **Secrets management**
   - Jamais de mot de passe en clair dans le code
   - Utiliser AWS Secrets Manager (rotation automatique)
   - `.env` jamais commité (`.gitignore` + `.env.example`)

6. **Backup et DRP**
   - RDS : backup automatique 30j + snapshot manuel avant chaque déploiement
   - S3 : versioning activé
   - State Terraform sur S3 + DynamoDB (lock)

7. **Sécurité humaine**
   - Validation des pull requests par un pair (4 eyes principle)
   - Formation sécurité annuelle pour tous les développeurs
   - Pas de `console.log` en production (vérifié par ESLint)

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

**Intégrité garantie par :**
- Chaque bloc contient le `Previous Hash` du bloc précédent (chaîne liée cryptographiquement)
- L'historique est immuable car modifier un bloc changerait son hash, cassant la chaîne
- Fabric stocke l'historique de chaque clé via `getHistoryForKey()` — on peut tracer toute modification

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

**Procédure de réponse à une demande CNPD :**
1. Interroger la blockchain : `getShipmentHistory(id)` → obtient toutes les transactions liées à une expédition
2. Vérifier les signatures X.509 de chaque transaction → identité du signataire
3. Cross-vérifier avec les logs CloudTrail (accès AWS) + logs application → traçabilité complète

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

---

*CAMTECH SOLUTIONS S.A. — Projet DIGITRANS-CM — 2025/2026*
