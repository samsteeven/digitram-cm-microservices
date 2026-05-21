# DIGITRANS-CM — Infrastructure as Code (Terraform)

## Structure

```
terraform/
├── main.tf                 # Point d'entrée
├── providers.tf            # Providers AWS + Azure
├── variables.tf            # Variables globales
├── outputs.tf              # Outputs
├── Makefile                # Commandes simplifiées
│
├── modules/
│   ├── vpc/                # VPC, subnets, NAT, route tables
│   ├── security/           # Security Groups (ALB, ECS, RDS, Redis)
│   ├── iam/                # Rôles ECS Task + Execution
│   ├── s3/                 # S3 Bucket assets
│   ├── rds/                # RDS PostgreSQL Multi-AZ
│   ├── redis/              # ElastiCache Redis
│   ├── alb/                # ALB HTTPS + Route53
│   └── ecs/                # ECS Fargate + ECR + Auto-scaling
│
└── environments/
    ├── dev/terraform.tfvars
    ├── test/terraform.tfvars
    └── prod/terraform.tfvars
```

## Prérequis

- Terraform >= 1.6
- AWS CLI configuré (profile `digitrans-dev`, `digitrans-test`, `digitrans-prod`)
- Certificat ACM dans `af-south-1` pour le domaine
- Zone Route53 existante pour le domaine

## Déploiement

```bash
# 1. Initialiser le backend (par environnement)
make init ENV=dev

# 2. Voir le plan
make plan ENV=dev

# 3. Appliquer
make apply ENV=dev

# 4. Détruire (attention !)
make destroy ENV=dev
```

## Séparation des environnements

| Environnement | VPC CIDR | RDS        | ECS min/max | Domaine                  |
|---------------|----------|------------|-------------|--------------------------|
| dev           | 10.0.0.0/16 | db.t3.micro | 1/2         | dev.api.digitrans-cm.com |
| test          | 10.1.0.0/16 | db.t3.small | 1/2         | test.api.digitrans-cm.com|
| prod          | 10.2.0.0/16 | db.t3.medium| 2/10        | api.digitrans-cm.com     |

Chaque environnement :
- Backend S3 isolé (`digitrans-cm/<env>/terraform.tfstate`)
- VPC distinct (CIDR non chevauchants)
- Comptes AWS séparés (profiles distincts)
- En prod : Multi-AZ RDS, deletion protection, backup 30 jours, auto-scaling CPU

## Outputs

```bash
terraform output
# alb_dns_name        = "digitrans-..."
# ecs_cluster_name    = "digitrans-cm-dev-cluster"
# rds_endpoint        = "...rds.amazonaws.com:5432"
# redis_endpoint      = "...cache.amazonaws.com"
# s3_bucket_name      = "digitrans-cm-dev-assets"
```

## Cost Management

Tags automatiques sur toutes les ressources :
- `Project=DIGITRANS-CM`
- `Environment=dev|test|prod`
- `ManagedBy=Terraform`
- `Owner=CAMTECH-SOLUTIONS`

Ces tags permettent le suivi des coûts via AWS Cost Explorer.
