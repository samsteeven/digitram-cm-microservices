locals {
  services = ["auth-gateway", "erp-service", "crm-service", "supply-chain-service", "bi-service"]

  service_paths = {
    auth-gateway         = "/"
    erp-service          = "/api/erp/*"
    crm-service          = "/api/crm/*"
    supply-chain-service = "/api/supply-chain/*"
    bi-service           = "/api/bi/*"
  }
}

# ─── ECR Repositories ─────────────────────────────────
resource "aws_ecr_repository" "services" {
  for_each = toset(local.services)
  name     = "digitrans-${each.key}"
  image_tag_mutability = "MUTABLE"

  image_scanning_configuration {
    scan_on_push = true
  }

  tags = { Name = "digitrans-${each.key}" }
}

# ─── CloudWatch Logs ──────────────────────────────────
resource "aws_cloudwatch_log_group" "ecs" {
  name              = "/ecs/${var.project_name}-${var.environment}"
  retention_in_days = var.environment == "prod" ? 90 : 30
  tags              = { Name = "${var.project_name}-${var.environment}-logs" }
}

# ─── Cluster ECS ──────────────────────────────────────
resource "aws_ecs_cluster" "main" {
  name = "${var.project_name}-${var.environment}-cluster"

  setting {
    name  = "containerInsights"
    value = "enabled"
  }

  configuration {
    execute_command_configuration {
      logging = "OVERRIDE"
      log_configuration {
        cloud_watch_log_group_name = aws_cloudwatch_log_group.ecs.name
      }
    }
  }

  tags = { Name = "${var.project_name}-${var.environment}-cluster" }
}

# ─── Task Definitions ─────────────────────────────────
resource "aws_ecs_task_definition" "services" {
  for_each = toset(local.services)

  family                   = "${var.project_name}-${var.environment}-${each.key}"
  network_mode             = "awsvpc"
  requires_compatibilities = ["FARGATE"]
  cpu                      = var.environment == "prod" ? 512 : var.ecs_cpu
  memory                   = var.environment == "prod" ? 1024 : var.ecs_memory
  execution_role_arn       = var.ecs_exec_role_arn
  task_role_arn            = var.ecs_task_role_arn

  container_definitions = jsonencode([
    {
      name  = each.key
      image = "${aws_ecr_repository.services[each.key].repository_url}:latest"

      portMappings = [{
        containerPort = var.container_port
        protocol      = "tcp"
      }]

      environment = concat(
        [
          { name = "NODE_ENV", value = var.environment },
          { name = "DB_HOST",  value = split(":", var.rds_endpoint)[0] },
          { name = "DB_PORT",  value = "5432" },
          { name = "DB_USER",  value = var.db_username },
          { name = "DB_PASSWORD", value = var.db_password },
          { name = "REDIS_URL", value = "redis://${var.redis_endpoint}:6379" }
        ],
        each.key == "bi-service" ? [
          { name = "DB_NAME", value = "digitrans_bi" }
        ] : each.key == "crm-service" ? [
          { name = "DB_NAME", value = "digitrans_crm" }
        ] : each.key == "erp-service" ? [
          { name = "DB_NAME", value = "digitrans_erp" }
        ] : each.key == "supply-chain-service" ? [
          { name = "DB_NAME", value = "digitrans_supply_chain" }
        ] : []
      )

      logConfiguration = {
        logDriver = "awslogs"
        options = {
          "awslogs-group"         = aws_cloudwatch_log_group.ecs.name
          "awslogs-region"        = var.aws_region
          "awslogs-stream-prefix" = each.key
        }
      }
    }
  ])

  tags = { Name = "${var.project_name}-${var.environment}-${each.key}" }
}

# ─── ALB Target Groups ────────────────────────────────
resource "aws_lb_target_group" "services" {
  for_each = toset(local.services)

  name        = substr("${var.project_name}-${replace(each.key, "-", "")}-tg", 0, 32)
  port        = var.container_port
  protocol    = "HTTP"
  vpc_id      = var.vpc_id
  target_type = "ip"

  health_check {
    path                = "/health"
    interval            = 30
    timeout             = 5
    healthy_threshold   = 2
    unhealthy_threshold = 3
    matcher             = "200"
  }

  tags = { Name = "${var.project_name}-${var.environment}-${each.key}-tg" }
}

# ─── ALB Listener Rules ───────────────────────────────
resource "aws_lb_listener_rule" "services" {
  for_each = local.service_paths

  listener_arn = var.alb_listener_arn
  priority     = index(local.services, each.key) + 1

  action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.services[each.key].arn
  }

  condition {
    path_pattern {
      values = [each.value]
    }
  }
}

# ─── ECS Services ─────────────────────────────────────
resource "aws_ecs_service" "services" {
  for_each = toset(local.services)

  name            = "${each.key}-service"
  cluster         = aws_ecs_cluster.main.id
  task_definition = aws_ecs_task_definition.services[each.key].arn
  desired_count   = var.environment == "prod" ? 2 : 1
  launch_type     = "FARGATE"

  network_configuration {
    subnets         = var.private_subnet_ids
    security_groups = [var.ecs_service_sg_id]
    assign_public_ip = false
  }

  load_balancer {
    target_group_arn = aws_lb_target_group.services[each.key].arn
    container_name   = each.key
    container_port   = var.container_port
  }

  depends_on = [aws_lb_listener_rule.services]

  deployment_minimum_healthy_percent = 50
  deployment_maximum_percent         = 200

  tags = { Name = "${var.project_name}-${var.environment}-${each.key}-service" }
}

# ─── Auto-scaling ─────────────────────────────────────
resource "aws_appautoscaling_target" "services" {
  for_each = toset(local.services)

  service_namespace  = "ecs"
  resource_id        = "service/${aws_ecs_cluster.main.name}/${aws_ecs_service.services[each.key].name}"
  scalable_dimension = "ecs:service:DesiredCount"
  min_capacity       = var.environment == "prod" ? var.min_capacity : 1
  max_capacity       = var.environment == "prod" ? var.max_capacity : 2
}

resource "aws_appautoscaling_policy" "cpu" {
  for_each = toset(var.environment == "prod" ? local.services : [])

  name               = "${var.project_name}-${var.environment}-${each.key}-cpu-scaling"
  service_namespace  = "ecs"
  resource_id        = "service/${aws_ecs_cluster.main.name}/${aws_ecs_service.services[each.key].name}"
  scalable_dimension = "ecs:service:DesiredCount"

  target_tracking_scaling_policy_configuration {
    predefined_metric_specification {
      predefined_metric_type = "ECSServiceAverageCPUUtilization"
    }
    target_value = var.cpu_target_tracking
  }
}
