environment = "test"

aws_region  = "af-south-1"
aws_profile = "digitrans-test"

vpc_cidr = "10.1.0.0/16"

db_instance_class = "db.t3.small"
redis_node_type   = "cache.t3.micro"

ecs_cpu    = 256
ecs_memory = 512

min_capacity = 1
max_capacity = 2

domain_name = "digitrans-cm.com"
