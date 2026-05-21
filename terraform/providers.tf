terraform {
  required_version = ">= 1.6"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.40"
    }
    azurerm = {
      source  = "hashicorp/azurerm"
      version = "~> 3.100"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.6"
    }
  }

  backend "s3" {
    bucket         = "digitrans-terraform-state"
    key            = "digitrans-cm/terraform.tfstate"
    region         = "af-south-1"
    encrypt        = true
    use_lockfile = true
  }
}

provider "aws" {
  region  = var.aws_region
  profile = var.aws_profile
  default_tags {
    tags = {
      Project     = "DIGITRANS-CM"
      Environment = var.environment
      ManagedBy   = "Terraform"
      Owner       = "CAMTECH-SOLUTIONS"
    }
  }
}

provider "azurerm" {
  features {
    resource_group {
      prevent_deletion_if_contains_resources = false
    }
  }
  subscription_id = var.azure_subscription_id
  tenant_id       = var.azure_tenant_id
}

provider "azurerm" {
  alias = "bi"
  features {}
  subscription_id = var.azure_subscription_id
  tenant_id       = var.azure_tenant_id
}
