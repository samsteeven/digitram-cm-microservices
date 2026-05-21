# DIGITRANS-CM — Déploiement Kubernetes (EKS)

## Structure

\\\
k8s/
├── base/                          # Manifests de base
│   ├── kustomization.yaml         # Kustomize root
│   ├── namespace.yaml             # Namespace digitrans
│   ├── configmap.yaml             # ConfigMap commune
│   ├── secret.yaml                # Secret template
│   ├── auth-gateway.yaml          # Deployment + Service
│   ├── erp-service.yaml           # Deployment + Service
│   ├── crm-service.yaml           # Deployment + Service
│   ├── supply-chain-service.yaml  # Deployment + Service
│   ├── bi-service.yaml            # Deployment + Service
│   ├── hpa.yaml                   # Auto-scaling CPU (5 HPAs)
│   └── ingress.yaml               # ALB Ingress (path-based routing)
│
└── overlays/
    ├── dev/                       # Environnement dev (1 replica, resources faibles)
    │   └── kustomization.yaml
    └── prod/                      # Environnement prod (3 replicas, scaling auto)
        └── kustomization.yaml
\\\

## Prérequis

- Cluster EKS (créé via Terraform ou eksctl)
- AWS Load Balancer Controller installé
- Certificat ACM pour le domaine
- External Secrets Operator ou Sealed Secrets pour les secrets

## Déploiement

\\\ash
# 1. Appliquer l'environnement dev
kubectl apply -k k8s/overlays/dev

# 2. Appliquer l'environnement prod
kubectl apply -k k8s/overlays/prod

# 3. Voir l'état
kubectl get all -n digitrans

# 4. Voir les HPAs
kubectl get hpa -n digitrans

# 5. Voir l'Ingress (récupérer le DNS ALB)
kubectl get ingress -n digitrans
\\\

## Architecture K8s

\\\
                    ┌──────────────────┐
                    │   ALB Ingress    │  (AWS Load Balancer Controller)
                    │   HTTPS :443     │
                    └────────┬─────────┘
                             │
                    ┌────────▼─────────┐
                    │   auth-gateway   │  (ClusterIP :3000)
                    │   JWT Proxy      │
                    └──┬───┬───┬───┬──┘
                       │   │   │   │
              ┌────────┘   │   │   └────────┐
              ▼             ▼   ▼             ▼
        ┌──────────┐ ┌────────┐ ┌──────────┐ ┌──────────┐
        │   ERP    │ │  CRM   │ │  Supply  │ │   BI     │
        │  :3001   │ │ :3002  │ │  :3003   │ │  :3004   │
        └──────────┘ └────────┘ └──────────┘ └──────────┘
              │             │          │              │
              ▼             ▼          ▼              ▼
        ┌─────────────────────────────────────────────────┐
        │           RDS PostgreSQL + ElastiCache Redis     │
        └─────────────────────────────────────────────────┘
\\\

## Auto-scaling

Chaque service a un HPA avec CPU target à 70% :

| Service | Min | Max | Seuil CPU |
|---------|-----|-----|-----------|
| auth-gateway     | 2 | 10 | 70% |
| erp-service      | 2 | 8  | 70% |
| crm-service      | 2 | 8  | 70% |
| supply-chain     | 2 | 6  | 70% |
| bi-service       | 1 | 4  | 70% |

## Rolling Update

Les Deployments utilisent la stratégie par défaut (RollingUpdate) :
- \maxSurge\: 25%
- \maxUnavailable\: 25%

Ce qui garantit zéro temps d'arrêt lors des mises à jour.
