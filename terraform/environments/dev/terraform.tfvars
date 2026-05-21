environment = "dev"

aws_region  = "af-south-1"
aws_profile = "digitrans-dev"

vpc_cidr = "10.0.0.0/16"

db_instance_class = "db.t3.micro"
redis_node_type   = "cache.t3.micro"

ecs_cpu    = 256
ecs_memory = 512

min_capacity = 1
max_capacity = 2

domain_name = "digitrans-cm.com"

# Ces valeurs doivent être définies dans les secrets CI/CD ou AWS Secrets Manager
# db_username     = "digitrans_dev"
# db_password     = "<secret>"
# azure_subscription_id = "<secret>"
# azure_tenant_id       = "<secret>"
