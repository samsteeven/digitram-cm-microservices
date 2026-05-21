output "cluster_name" { value = aws_ecs_cluster.main.name }
output "cluster_id" { value = aws_ecs_cluster.main.id }
output "ecr_repository_urls" { value = { for k, r in aws_ecr_repository.services : k => r.repository_url } }
output "target_group_arns" { value = { for k, tg in aws_lb_target_group.services : k => tg.arn } }
