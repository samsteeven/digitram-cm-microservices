# ─── Général ──────────────────────────────────────────
variable "environment" {
  description = "Environnement de déploiement (dev, test, prod)"
  type        = string
  validation {
    condition     = contains(["dev", "test", "prod"], var.environment)
    error_message = "L'environnement doit être dev, test ou prod."
  }
}

variable "aws_region" {
  description = "Région AWS (recommandé: af-south-1 pour l'Afrique)"
  type        = string
  default     = "af-south-1"
}

variable "aws_profile" {
  description = "Profil AWS CLI"
  type        = string
  default     = "digitrans"
}

variable "project_name" {
  description = "Nom du projet"
  type        = string
  default     = "digitrans-cm"
}

# ─── Azure ────────────────────────────────────────────
variable "azure_subscription_id" {
  description = "Azure Subscription ID"
  type        = string
  sensitive   = true
}

variable "azure_tenant_id" {
  description = "Azure Tenant ID"
  type        = string
  sensitive   = true
}

# ─── VPC ──────────────────────────────────────────────
variable "vpc_cidr" {
  description = "CIDR du VPC"
  type        = string
  default     = "10.0.0.0/16"
}

variable "availability_zones" {
  description = "Zones de disponibilité"
  type        = list(string)
  default     = ["af-south-1a", "af-south-1b"]
}

# ─── RDS PostgreSQL ───────────────────────────────────
variable "db_instance_class" {
  description = "Instance class RDS"
  type        = string
  default     = "db.t3.medium"
}

variable "db_username" {
  description = "Utilisateur PostgreSQL"
  type        = string
  sensitive   = true
}

variable "db_password" {
  description = "Mot de passe PostgreSQL"
  type        = string
  sensitive   = true
}

# ─── ECS ──────────────────────────────────────────────
variable "ecs_cpu" {
  description = "CPU units pour les tâches ECS (par défaut)"
  type        = number
  default     = 256
}

variable "ecs_memory" {
  description = "Memory MiB pour les tâches ECS (par défaut)"
  type        = number
  default     = 512
}

variable "container_port" {
  description = "Port exposé par les conteneurs"
  type        = number
  default     = 3000
}

# ─── Redis ────────────────────────────────────────────
variable "redis_node_type" {
  description = "Type de nœud ElastiCache Redis"
  type        = string
  default     = "cache.t3.micro"
}

# ─── Domaines ─────────────────────────────────────────
variable "domain_name" {
  description = "Nom de domaine (ex: digitrans-cm.com)"
  type        = string
  default     = "digitrans-cm.com"
}

# ─── Auto-scaling ────────────────────────────────────
variable "min_capacity" {
  description = "Nombre minimum de tâches ECS par service"
  type        = number
  default     = 1
}

variable "max_capacity" {
  description = "Nombre maximum de tâches ECS par service"
  type        = number
  default     = 4
}

variable "cpu_target_tracking" {
  description = "Cible CPU % pour auto-scaling"
  type        = number
  default     = 70
}
