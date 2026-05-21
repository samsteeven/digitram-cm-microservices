# DIGITRANS-CM — Schéma d'architecture détaillé

## 1. Architecture globale (vue macro)

```mermaid
graph TB
    subgraph "🌐 Internet"
        USR[Utilisateurs<br/>Web/Mobile]
    end

    subgraph "AWS af-south-1 (Cape Town)"
        subgraph "VPC Production"
            ALB[Application Load Balancer<br/>HTTPS :443]
            
            subgraph "ECS Cluster — digitrans-cluster"
                GW[🛂 Auth Gateway<br/>Port 3000<br/>JWT + OAuth2 Proxy]
                ERP[📊 ERP Service<br/>Port 3001<br/>RH, Compta, Achats]
                CRM[👥 CRM Service<br/>Port 3002<br/>Clients, Commandes]
                SC[📦 Supply Chain<br/>Port 3003<br/>Flux + Offline-first]
                BI[📈 BI Service<br/>Port 3004<br/>KPIs, Dashboards]
            end

            RDS[(RDS PostgreSQL<br/>Multi-AZ)]
            ECR[Amazon ECR<br/>Docker Images]
            S3[(S3 Bucket<br/>Documents/Assets)]
        end

        subgraph "Cache & Queue"
            ECS[(ElastiCache Redis<br/>Cluster Mode)]
        end
    end

    subgraph "Azure South Africa North"
        AAD[Azure AD<br/>Identité & SSO]
        MON[Azure Monitor<br/>Logs & Metrics]
    end

    subgraph "📱 Agents terrain (offline)"
        MOB[App Mobile<br/>IndexedDB / LocalStorage]
        RPI[IoT Raspberry Pi<br/>Checkpoints]
    end

    USR -->|HTTPS| ALB
    ALB --> GW
    GW -->|/api/erp/*| ERP
    GW -->|/api/crm/*| CRM
    GW -->|/api/supply-chain/*| SC
    GW -->|/api/bi/*| BI
    ERP --> RDS
    CRM --> RDS
    SC --> RDS
    BI --> RDS
    BI -->|Cache 5min| ECS
    SC -->|Offline queue| ECS
    GW -->|Sessions| ECS
    GW --> AAD
    MOB -->|Sync offline| SC
    RPI -->|Checkpoints| SC
```

## 2. Architecture des communications interservices

```mermaid
sequenceDiagram
    participant U as Client
    participant GW as Auth Gateway
    participant ERP as ERP Service
    participant CRM as CRM Service
    participant SC as Supply Chain
    participant BI as BI Service

    Note over U,GW: 1.Authentification
    U->>GW: POST /auth/login (email, password)
    GW->>GW: Vérifier credentials<br/>Générer JWT
    GW-->>U: { access_token, refresh_token }

    Note over U,GW: 2.Appels authentifiés
    U->>GW: GET /api/erp/employees<br/>Authorization: Bearer <JWT>
    GW->>GW: Valider JWT<br/>Extraire X-User-Id, X-User-Role
    GW->>ERP: GET /employees<br/>X-User-Id, X-User-Role
    ERP->>ERP: Vérifier rôle (RBAC)
    ERP-->>GW: 200 { data }
    GW-->>U: 200 { data }

    Note over SC,BI: 3.Sync offline (toilette réseau)
    U->>SC: POST /sync/push { items }
    SC->>SC: Valider & mettre en queue Redis
    SC-->>U: 202 { accepted, rejected }
    Note over SC: Worker Redis flush queue<br/>toutes les 30s
```

## 3. Architecture offline-first (Supply Chain)

```mermaid
flowchart LR
    subgraph Client
        A[Agent terrain] -->|Collecte offline| B[(IndexedDB<br/>Queue locale)]
    end

    subgraph Server
        C[POST /sync/push] -->|Valider| D[Redis Queue<br/>Liste chaînée]
        D -->|Worker 30s| E{Processus}
        E -->|INSERT checkpoint| F[(PostgreSQL)]
        E -->|UPDATE shipment| F
        E -->|Échec| G[Dead-letter queue<br/>Max 3 retries]
        E -->|Succès| H{{"Hyperledger Fabric<br/>Blockchain"}}
    end

    B -->|Online| C
```

## 4. Matrice de déploiement (3 environnements)

| Ressource | Dev (local) | Test (CI/CD) | Production (AWS) |
|-----------|-------------|--------------|-------------------|
| PostgreSQL | Docker local | Service GH Actions | RDS Multi-AZ |
| Redis | Docker local | Service GH Actions | ElastiCache |
| Auth Gateway | Port 3000 | ECR + ECS Staging | ECS Fargate |
| ERP Service | Port 3001 | ECR + ECS Staging | ECS Fargate |
| CRM Service | Port 3002 | ECR + ECS Staging | ECS Fargate |
| Supply Chain | Port 3003 | ECR + ECS Staging | ECS Fargate |
| BI Service | Port 3004 | ECR + ECS Staging | ECS Fargate |
| Domaine | localhost | staging.digitrans-cm.com | api.digitrans-cm.com |

## 5. Flux d'authentification OAuth 2.0 / JWT

```mermaid
flowchart TD
    Start([Requête entrante]) --> JWT{Authorization<br/>Header?}
    JWT -->|Oui| Verify[Vérifier signature JWT<br/>avec JWT_SECRET]
    JWT -->|Non| Auth{Path public?<br/>/health, /login}
    Auth -->|Oui| Next[Proxy vers service]
    Auth -->|Non| 401[401 Unauthorized]
    Verify -->|Invalide| 401
    Verify -->|Valide| Exp{Expiré?}
    Exp -->|Oui| 401
    Exp -->|Non| Role{RBAC<br/>Rôle suffisant?}
    Role -->|Oui| Inject[Injecter<br/>X-User-Id, X-User-Role]
    Inject --> Next
    Role -->|Non| 403[403 Forbidden]
```

## 6. Stack technologique

```
┌──────────────────────────────────────────────────┐
│                   DIGITRANS-CM                     │
├──────────┬──────────┬──────────┬──────────────────┤
│ Gatway   │ ERP/CRM  │ Supply   │ BI               │
│ Node.js  │ Node.js  │ Chain    │ Python 3.14      │
│ Express  │ Express  │ Node.js  │ FastAPI          │
│ JWT      │ Joi      │ Express  │ Pandas (planned) │
│ OAuth2   │ Swagger  │ Fabric   │ Matplotlib       │
│          │          │ SDK      │ (planned)        │
├──────────┴──────────┴──────────┴──────────────────┤
│ Infrastructure commune                             │
│ PostgreSQL 15 · Redis 7 · Docker · Terraform       │
│ GitHub Actions · AWS ECS · Azure AD                │
└────────────────────────────────────────────────────┘
```
