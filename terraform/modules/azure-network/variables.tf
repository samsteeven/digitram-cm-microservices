variable "environment" {
  description = "Environnement de déploiement"
  type        = string
}

variable "project_name" {
  description = "Nom du projet"
  type        = string
}

variable "azure_location" {
  description = "Région Azure (ex: francesouth, westeurope)"
  type        = string
  default     = "francesouth"
}

variable "vnet_cidr" {
  description = "CIDR du VNet Azure"
  type        = string
  default     = "10.1.0.0/16"
}

variable "azure_availability_zones" {
  description = "Zones Azure (1, 2, 3)"
  type        = list(string)
  default     = ["1", "2"]
}

variable "allowed_cidrs" {
  description = "CIDRs autorisés pour l'accès entrant"
  type        = list(string)
  default     = ["10.0.0.0/8", "172.16.0.0/12"]
}
