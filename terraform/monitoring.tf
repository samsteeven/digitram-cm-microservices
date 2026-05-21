# ─── CloudWatch Dashboard ─────────────────────────────
resource "aws_cloudwatch_dashboard" "main" {
  dashboard_name = "DIGITRANS-CM-${var.environment}"
  dashboard_body = jsonencode({
    widgets = [
      {
        type = "metric", x = 0, y = 0, width = 24, height = 6
        properties = {
          title = "ECS — CPU Utilisation", view = "timeSeries", region = var.aws_region, period = 300, stat = "Average"
          metrics = [
            ["AWS/ECS", "CPUUtilization", { "stat": "Average", "label": "auth-gateway" }],
            ["AWS/ECS", "CPUUtilization", { "stat": "Average", "label": "erp-service" }],
            ["AWS/ECS", "CPUUtilization", { "stat": "Average", "label": "crm-service" }],
            ["AWS/ECS", "CPUUtilization", { "stat": "Average", "label": "supply-chain" }],
            ["AWS/ECS", "CPUUtilization", { "stat": "Average", "label": "bi-service" }]
          ]
        }
      },
      {
        type = "metric", x = 0, y = 6, width = 12, height = 6
        properties = {
          title = "RDS — Connections & IOPS", view = "timeSeries", region = var.aws_region, period = 300
          metrics = [
            ["AWS/RDS", "DatabaseConnections", { "label": "Connections" }],
            ["AWS/RDS", "ReadIOPS", { "label": "Read IOPS" }],
            ["AWS/RDS", "WriteIOPS", { "label": "Write IOPS" }]
          ]
        }
      },
      {
        type = "metric", x = 12, y = 6, width = 12, height = 6
        properties = {
          title = "ALB — Requêtes & Latence", view = "timeSeries", region = var.aws_region, period = 300
          metrics = [
            ["AWS/ApplicationELB", "RequestCount", { "stat": "Sum", "label": "Requests" }],
            ["AWS/ApplicationELB", "TargetResponseTime", { "stat": "p99", "label": "p99 latency" }]
          ]
        }
      }
    ]
  })
}

# ─── CloudWatch Log Groups ────────────────────────────
# Déjà créés dans le module ECS

# ─── Alarmes CloudWatch ───────────────────────────────
resource "aws_cloudwatch_metric_alarm" "ecs_cpu_high" {
  for_each = toset(var.environment == "prod" ? ["auth-gateway", "erp-service", "crm-service", "supply-chain-service", "bi-service"] : [])

  alarm_name          = "${var.project_name}-${var.environment}-${each.key}-cpu-high"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 3
  metric_name         = "CPUUtilization"
  namespace           = "AWS/ECS"
  period              = 300
  statistic           = "Average"
  threshold           = 80
  treat_missing_data  = "notBreaching"
  alarm_description   = "CPU > 80% pendant 15 min sur ${each.key}"

  dimensions = {
    ClusterName = "${var.project_name}-${var.environment}-cluster"
    ServiceName = "${each.key}-service"
  }

  alarm_actions = var.environment == "prod" ? [aws_sns_topic.alarms[0].arn] : []
  ok_actions    = var.environment == "prod" ? [aws_sns_topic.alarms[0].arn] : []
}

resource "aws_cloudwatch_metric_alarm" "alb_5xx" {
  count = var.environment == "prod" ? 1 : 0

  alarm_name          = "${var.project_name}-${var.environment}-alb-5xx-high"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 2
  metric_name         = "HTTPCode_Target_5XX_Count"
  namespace           = "AWS/ApplicationELB"
  period              = 300
  statistic           = "Sum"
  threshold           = 50
  alarm_description   = "Plus de 50 erreurs 5xx sur l'ALB en 5 min"
  alarm_actions       = [aws_sns_topic.alarms[0].arn]
  ok_actions          = [aws_sns_topic.alarms[0].arn]
}

# ─── SNS Topic pour les alarmes ───────────────────────
resource "aws_sns_topic" "alarms" {
  count = var.environment == "prod" ? 1 : 0
  name  = "${var.project_name}-${var.environment}-alarms"
}

resource "aws_sns_topic_subscription" "alarms_email" {
  count     = var.environment == "prod" ? 1 : 0
  topic_arn = aws_sns_topic.alarms[0].arn
  protocol  = "email"
  endpoint  = "ops@camtech.cm"
}

# ─── Logs Metrics ─────────────────────────────────────
resource "aws_cloudwatch_log_metric_filter" "errors" {
  count          = var.environment == "prod" ? 5 : 0
  name           = "${var.project_name}-${var.environment}-error-filter"
  pattern        = "?ERROR ?Error ?error ?ERREUR"
  log_group_name = "/ecs/${var.project_name}-${var.environment}"

  metric_transformation {
    name      = "ErrorCount"
    namespace = "DIGITRANS-CM"
    value     = "1"
  }
}

# ─── CloudTrail (audit de tous les appels API AWS) ────
resource "aws_cloudtrail" "main" {
  count = var.environment == "prod" ? 1 : 0

  name                          = "${var.project_name}-${var.environment}-trail"
  s3_bucket_name                = "${var.project_name}-${var.environment}-logs"
  include_global_service_events = true
  is_multi_region_trail         = true
  enable_log_file_validation    = true

  event_selector {
    read_write_type           = "All"
    include_management_events = true
  }

  tags = { Name = "${var.project_name}-${var.environment}-trail" }
}

# ─── GuardDuty (détection d'intrusions) ───────────────
resource "aws_guardduty_detector" "main" {
  count = var.environment == "prod" ? 1 : 0

  enable                       = true
  finding_publishing_frequency = "FIFTEEN_MINUTES"

  tags = { Name = "${var.project_name}-${var.environment}-guardduty" }
}

# ─── AWS Config (enregistrement des changements de ressource) ───
resource "aws_config_configuration_recorder" "main" {
  count = var.environment == "prod" ? 1 : 0

  name     = "${var.project_name}-${var.environment}-recorder"
  role_arn = aws_iam_role.config[0].arn

  recording_group {
    all_supported                 = true
    include_global_resource_types = true
  }
}

resource "aws_iam_role" "config" {
  count = var.environment == "prod" ? 1 : 0
  name  = "${var.project_name}-${var.environment}-config-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect = "Allow"
      Principal = { Service = "config.amazonaws.com" }
      Action = "sts:AssumeRole"
    }]
  })
}

resource "aws_iam_role_policy_attachment" "config" {
  count      = var.environment == "prod" ? 1 : 0
  role       = aws_iam_role.config[0].name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSConfigRole"
}
