output "alb_dns_name" {
  description = "DNS name de l'ALB"
  value       = module.alb.alb_dns_name
}

output "ecs_cluster_name" {
  description = "Nom du cluster ECS"
  value       = module.ecs.cluster_name
}

output "rds_endpoint" {
  description = "Endpoint RDS PostgreSQL"
  value       = module.rds.endpoint
  sensitive   = true
}

output "redis_endpoint" {
  description = "Endpoint ElastiCache Redis"
  value       = module.redis.endpoint
  sensitive   = true
}

output "s3_bucket_name" {
  description = "Nom du bucket S3"
  value       = module.s3.bucket_name
}

output "ecr_repository_urls" {
  description = "URLs des repositories ECR par service"
  value       = module.ecs.ecr_repository_urls
}

output "vpc_id" {
  description = "ID du VPC"
  value       = module.vpc.vpc_id
}

output "environment_domain" {
  description = "Domaine complet pour l'environnement"
  value       = var.environment == "prod" ? "api.${var.domain_name}" : "${var.environment}.api.${var.domain_name}"
}
