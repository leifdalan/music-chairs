# Outage and cost alerts in us-east-1, where Route 53 health-check metrics and
# billing live. The operator's address is read from Parameter Store
# (./bin/deploy bootstrap), never written in the repository.
data "aws_ssm_parameter" "alert_email" {
  name            = local.config.alertEmailParameter
  with_decryption = true
}

resource "aws_sns_topic" "alerts" {
  provider = aws.us_east_1
  name     = local.config.alertTopicName
}

# Email subscriptions need confirming; SNS drops an unconfirmed one after 48
# hours, and the next plan then adds it again.
resource "aws_sns_topic_subscription" "alerts" {
  provider  = aws.us_east_1
  topic_arn = aws_sns_topic.alerts.arn
  protocol  = "email"
  endpoint  = data.aws_ssm_parameter.alert_email.value
}

# A plain-HTTP check (the cheap basic one): Caddy serves /healthz on port 80
# without redirecting.
resource "aws_route53_health_check" "app" {
  provider          = aws.us_east_1
  type              = "HTTP"
  fqdn              = local.config.domain
  port              = 80
  resource_path     = "/healthz"
  request_interval  = 30
  failure_threshold = 3
  tags = {
    Name = local.config.domain
  }
}

resource "aws_cloudwatch_metric_alarm" "outage" {
  provider            = aws.us_east_1
  alarm_name          = local.config.outageAlarmName
  alarm_description   = "${local.config.domain} is not answering its health check"
  namespace           = "AWS/Route53"
  metric_name         = "HealthCheckStatus"
  dimensions          = { HealthCheckId = aws_route53_health_check.app.id }
  statistic           = "Minimum"
  period              = 60
  evaluation_periods  = 2
  threshold           = 1
  comparison_operator = "LessThanThreshold"
  treat_missing_data  = "breaching"
  alarm_actions       = [aws_sns_topic.alerts.arn]
  ok_actions          = [aws_sns_topic.alerts.arn]
}

resource "aws_budgets_budget" "monthly" {
  provider     = aws.us_east_1
  name         = "music-chairs-monthly"
  budget_type  = "COST"
  time_unit    = "MONTHLY"
  limit_amount = tostring(local.config.monthlyBudgetUsd)
  limit_unit   = "USD"

  # Actual spend above the limit ($10).
  notification {
    notification_type          = "ACTUAL"
    comparison_operator        = "GREATER_THAN"
    threshold                  = 100
    threshold_type             = "PERCENTAGE"
    subscriber_email_addresses = [data.aws_ssm_parameter.alert_email.value]
  }

  # Forecast above 95% of the limit ($9.50); expected steady cost is about $8.40.
  notification {
    notification_type          = "FORECASTED"
    comparison_operator        = "GREATER_THAN"
    threshold                  = 95
    threshold_type             = "PERCENTAGE"
    subscriber_email_addresses = [data.aws_ssm_parameter.alert_email.value]
  }
}
