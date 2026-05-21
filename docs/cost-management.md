# DIGITRANS-CM — Gestion et optimisation des coûts cloud

**Section 1.3.5** — BC04/EC04 — Mai 2026

---

## 1. Stratégie de tagging

Toutes les ressources AWS sont taguées automatiquement par Terraform :

| Tag | Valeur | Objectif |
|-----|--------|----------|
| `Project` | `DIGITRANS-CM` | Regrouper tous les coûts du projet |
| `Environment` | `dev` / `test` / `prod` | Filtrer par environnement |
| `ManagedBy` | `Terraform` | Identifier les ressources IaC |
| `Owner` | `CAMTECH-SOLUTIONS` | Centre de coût responsable |
| `Service` | `auth-gateway` / `erp-service` / ... | Par microservice |
| `CostCenter` | `EADL-BC04` | Référence examen |

**AWS Cost Explorer** : activer les tags `Project` et `Environment` comme **Cost Allocation Tags** dans la console AWS.

---

## 2. Budgets AWS

### 2.1. Budgets mensuels recommandés

| Environnement | Budget mensuel | Seuil d'alerte | Action |
|---------------|---------------|----------------|--------|
| Dev | $150 | 80% / 100% | Email + Slack |
| Test | $200 | 80% / 100% | Email + Slack |
| Prod | $1 200 | 75% / 90% / 100% | Email + Slack + Arrêt automatique |

### 2.2. Configuration Terraform (AWS Budgets)

```hcl
# budgets.tf — à ajouter dans le module racine
resource "aws_budgets_budget" "monthly" {
  for_each = {
    dev  = { limit = 150, emails = ["team@camtech.cm"] }
    test = { limit = 200, emails = ["team@camtech.cm"] }
    prod = { limit = 1200, emails = ["team@camtech.cm", "finance@agrocam.cm"] }
  }

  name         = "digitrans-${each.key}-monthly"
  budget_type  = "COST"
  limit_amount = each.value.limit
  limit_unit   = "USD"
  time_unit    = "MONTHLY"

  cost_filters = {
    TagKeyValue = "Project$DIGITRANS-CM"
  }

  notification {
    comparison_operator        = "GREATER_THAN"
    threshold                 = 80
    threshold_type            = "PERCENTAGE"
    notification_type         = "ACTUAL"
    subscriber_email_addresses = each.value.emails
  }
}
```

---

## 3. Auto-scaling déjà implémenté

### 3.1. ECS Fargate (Terraform)

| Service | Min | Max | Seuil CPU | Stratégie |
|---------|-----|-----|-----------|-----------|
| auth-gateway     | 2 | 10 | 70% | Target tracking |
| erp-service      | 2 | 8  | 70% | Target tracking |
| crm-service      | 2 | 8  | 70% | Target tracking |
| supply-chain     | 2 | 6  | 70% | Target tracking |
| bi-service       | 1 | 4  | 70% | Target tracking |

**Économie estimée** : ~40% vs capacité fixe (les réplicas sont réduits la nuit et le week-end).

### 3.2. Kubernetes HPA (EKS)

Les HPAs K8s doublent cette logique avec des metriques CPU :

```bash
kubectl get hpa -n digitrans
# NAME                      REFERENCE                     TARGETS   MINPODS   MAXPODS
# auth-gateway-hpa          Deployment/auth-gateway        45%/70%   2         10
# erp-service-hpa           Deployment/erp-service         30%/70%   2         8
```

---

## 4. Dimensionnement des instances

### 4.1. ECS Fargate (compute)

| Service | CPU prod | Mémoire prod | Coût estimé/mois |
|---------|----------|--------------|-------------------|
| auth-gateway     | 512 | 1 GB | $35 |
| erp-service      | 512 | 1 GB | $35 |
| crm-service      | 512 | 1 GB | $35 |
| supply-chain     | 512 | 1 GB | $35 |
| bi-service       | 256 | 512 MB | $20 |

### 4.2. RDS PostgreSQL

| Environnement | Instance | Stockage | Multi-AZ | Coût estimé/mois |
|---------------|----------|----------|----------|-------------------|
| Dev | db.t3.micro | 20 GB | Non | $15 |
| Test | db.t3.small | 20 GB | Non | $25 |
| Prod | db.t3.medium | 100 GB | Oui | $120 |

### 4.3. ElastiCache Redis

| Environnement | Type | Coût estimé/mois |
|---------------|------|-------------------|
| Dev/Test | cache.t3.micro | $15 |
| Prod | cache.t3.small | $30 |

### 4.4. Coût total estimé (prod)

| Ressource | Coût mensuel |
|-----------|-------------|
| ECS Fargate (5 services × 2 réplicas) | ~$280 |
| RDS PostgreSQL Multi-AZ | ~$120 |
| ElastiCache Redis | ~$30 |
| ALB | ~$20 |
| S3 + Data transfer | ~$10 |
| ECR storage | ~$5 |
| **Total prod** | **~$465/mois** |
| **Total (dev + test + prod)** | **~$650/mois** |

---

## 5. Recommandations d'optimisation

### 5.1. Réservations / Savings Plans

| Service | Recommandation | Économie |
|---------|---------------|----------|
| RDS PostgreSQL | **RDS Reserved Instance** (1 an, partiel) | ~40% |
| ECS Fargate | **Savings Plan** (Compute, 1 an) | ~30% |
| ElastiCache | **Savings Plan** couvert par Compute SP | — |

### 5.2. Right-sizing

- **Dev/Test** : arrêter les services non utilisés en dehors des heures ouvrées (cron de désactivation 20h-8h)
- **BI Service** : instance plus petite en dev (256 CPU suffit)
- **RDS** : passer `db.t3.medium` → `db.t3.large` uniquement si CPU > 60% sur 7 jours

### 5.3. Lifecycle S3

Déjà configuré dans Terraform :
- Versions non courantes supprimées après 90 jours
- Stockage STANDARD → GLACIER après 180 jours (pour les documents archivés)

### 5.4. Data Transfer

- Tous les services dans le même VPC (data transfer gratuit entre AZ)
- ALB → ECS : traffic interne (gratuit)
- RDS dans le même AZ que les ECS tasks (latence minimale, pas de coût AZ)

---

## 6. Surveillance des coûts

### 6.1. AWS Cost Explorer

Tags activés pour le filtrage :
```
Project:DIGITRANS-CM, Environment:prod
→ Visualiser le coût mensuel par service
→ Exporter au format CSV pour le rapport
```

### 6.2. Azure Cost Management

Pour les ressources Azure (Azure AD uniquement — gratuit) :
- Pas de coût significatif prévu (Azure AD P1 gratuit avec le plan E5)

### 6.3. Alertes recommandées

| Seuil | Action | Canal |
|-------|--------|-------|
| 75% du budget | Notification proactive | Email |
| 90% du budget | Alerte urgente | Email + Slack |
| 100% du budget | Alerte critique | Email + Slack + SMS |
| Spike > 20% vs mois précédent | Investigation | Slack |

---

## 7. Script d'estimation des coûts

```bash
# Estimation rapide avec AWS Pricing Calculator
# Ou via AWS CLI :
aws ce get-cost-and-usage \
  --time-period Start=2026-04-01,End=2026-05-01 \
  --granularity MONTHLY \
  --metrics "BlendedCost" \
  --group-by Type=TAG,Key=Project
```

---

*CAMTECH SOLUTIONS S.A. — Projet DIGITRANS-CM — 2025/2026*
