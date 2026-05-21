# AWS Budgets — Section 1.3.5 Gestion des coûts
# Alerte par email quand le budget mensuel est dépassé

resource "aws_budgets_budget" "monthly" {
  count = var.environment == "prod" ? 1 : 0

  name         = "--monthly-budget"
  budget_type  = "COST"
  limit_amount = 1200
  limit_unit   = "USD"
  time_unit    = "MONTHLY"

  cost_filter {
    name   = "TagKeyValue"
    values = ["Project{var.project_name}"]
  }

  notification {
    comparison_operator        = "GREATER_THAN"
    threshold                 = 75
    threshold_type            = "PERCENTAGE"
    notification_type         = "ACTUAL"
    subscriber_email_addresses = ["team@camtech.cm"]
  }

  notification {
    comparison_operator        = "GREATER_THAN"
    threshold                 = 90
    threshold_type            = "PERCENTAGE"
    notification_type         = "FORECASTED"
    subscriber_email_addresses = ["team@camtech.cm", "finance@agrocam.cm"]
  }

  tags = {
    Name        = "--budget"
    Environment = var.environment
    Project     = var.project_name
  }
}

# Alerte si un service particulier dépasse son allocation
resource "aws_cloudwatch_metric_alarm" "cost_spike" {
  count = var.environment == "prod" ? 1 : 0

  alarm_name          = "--cost-spike"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 1
  metric_name         = "EstimatedCharges"
  namespace           = "AWS/Billing"
  period              = 21600
  statistic           = "Maximum"
  threshold           = 500
  alarm_description   = "Alerte si les frais estimés dépassent 500$ sur 6h"
  alarm_actions       = [] # SNS topic ARN à configurer

  dimensions = {
    Currency = "USD"
  }
}
