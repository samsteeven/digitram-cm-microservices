# ─── 1. Réseau ────────────────────────────────────────
module "vpc" {
  source             = "./modules/vpc"
  environment        = var.environment
  project_name       = var.project_name
  vpc_cidr           = var.vpc_cidr
  availability_zones = var.availability_zones
}

# ─── 2. Sécurité (SGs) ───────────────────────────────
module "security" {
  source         = "./modules/security"
  environment    = var.environment
  project_name   = var.project_name
  vpc_id         = module.vpc.vpc_id
  container_port = var.container_port
}

# ─── 3. Stockage ──────────────────────────────────────
module "s3" {
  source       = "./modules/s3"
  environment  = var.environment
  project_name = var.project_name
}

# ─── 4. IAM ───────────────────────────────────────────
module "iam" {
  source       = "./modules/iam"
  environment  = var.environment
  project_name = var.project_name
  aws_region   = var.aws_region
}

# ─── 5. Bases de données ──────────────────────────────
module "rds" {
  source              = "./modules/rds"
  environment         = var.environment
  project_name        = var.project_name
  private_subnet_ids  = module.vpc.private_subnet_ids
  db_instance_class   = var.db_instance_class
  db_username         = var.db_username
  db_password         = var.db_password
  rds_sg_id           = module.security.rds_sg_id
}

module "redis" {
  source             = "./modules/redis"
  environment        = var.environment
  project_name       = var.project_name
  private_subnet_ids = module.vpc.private_subnet_ids
  redis_node_type    = var.redis_node_type
  redis_sg_id        = module.security.redis_sg_id
}

# ─── 6. ALB ───────────────────────────────────────────
module "alb" {
  source           = "./modules/alb"
  environment      = var.environment
  project_name     = var.project_name
  public_subnet_ids = module.vpc.public_subnet_ids
  alb_sg_id        = module.security.alb_sg_id
  domain_name      = var.domain_name
}

# ─── 7.1 Azure VNet (BI / Fabric) ────────────────────
module "azure_network" {
  source       = "./modules/azure-network"
  providers = {
    azurerm = azurerm.bi
  }
  environment  = var.environment
  project_name = var.project_name
}

# ─── 7.2 ECS (dépend de tout ce qui précède) ──────────
module "ecs" {
  source              = "./modules/ecs"
  environment         = var.environment
  project_name        = var.project_name
  aws_region          = var.aws_region
  vpc_id              = module.vpc.vpc_id
  private_subnet_ids  = module.vpc.private_subnet_ids
  ecs_cpu             = var.ecs_cpu
  ecs_memory          = var.ecs_memory
  container_port      = var.container_port
  ecs_task_role_arn   = module.iam.ecs_task_role_arn
  ecs_exec_role_arn   = module.iam.ecs_exec_role_arn
  ecs_service_sg_id   = module.security.ecs_service_sg_id
  rds_endpoint        = module.rds.endpoint
  redis_endpoint      = module.redis.endpoint
  db_username         = var.db_username
  db_password         = var.db_password
  min_capacity        = var.min_capacity
  max_capacity        = var.max_capacity
  cpu_target_tracking = var.cpu_target_tracking
  alb_listener_arn    = module.alb.alb_listener_arn
}
