environment = "prod"

aws_region  = "af-south-1"
aws_profile = "digitrans-prod"

vpc_cidr = "10.2.0.0/16"

db_instance_class = "db.t3.medium"
redis_node_type   = "cache.t3.small"

ecs_cpu    = 512
ecs_memory = 1024

min_capacity = 2
max_capacity = 10

cpu_target_tracking = 70

domain_name = "digitrans-cm.com"
