output "ecs_service_sg_id" { value = aws_security_group.ecs_service.id }
output "alb_sg_id" { value = aws_security_group.alb.id }
output "rds_sg_id" { value = aws_security_group.rds.id }
output "redis_sg_id" { value = aws_security_group.redis.id }
