# =============================================================================
# Monitoring Module - CloudWatch Alarms + SNS (Control Plane Only)
# =============================================================================

# SNS Topic for alarm notifications
resource "aws_sns_topic" "alarms" {
  name = "${var.project_name}-${var.environment}-alarms"
  tags = var.tags
}

resource "aws_sns_topic_subscription" "email" {
  count     = var.alarm_email != "" ? 1 : 0
  topic_arn = aws_sns_topic.alarms.arn
  protocol  = "email"
  endpoint  = var.alarm_email
}

# 1. Lambda Errors
resource "aws_cloudwatch_metric_alarm" "lambda_errors" {
  alarm_name          = "${var.project_name}-${var.environment}-lambda-errors"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 2
  metric_name         = "Errors"
  namespace           = "AWS/Lambda"
  period              = 300
  statistic           = "Sum"
  threshold           = var.lambda_error_threshold
  alarm_description   = "Lambda function errors exceed threshold"
  alarm_actions       = [aws_sns_topic.alarms.arn]
  ok_actions          = [aws_sns_topic.alarms.arn]
  treat_missing_data  = "notBreaching"

  dimensions = {
    FunctionName = var.lambda_function_name
  }

  tags = var.tags
}

# 2. Lambda Throttles
resource "aws_cloudwatch_metric_alarm" "lambda_throttles" {
  alarm_name          = "${var.project_name}-${var.environment}-lambda-throttles"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 2
  metric_name         = "Throttles"
  namespace           = "AWS/Lambda"
  period              = 300
  statistic           = "Sum"
  threshold           = var.lambda_throttle_threshold
  alarm_description   = "Lambda function throttles exceed threshold"
  alarm_actions       = [aws_sns_topic.alarms.arn]
  treat_missing_data  = "notBreaching"

  dimensions = {
    FunctionName = var.lambda_function_name
  }

  tags = var.tags
}

# 3. API Gateway 5XX Errors
resource "aws_cloudwatch_metric_alarm" "api_gw_5xx" {
  alarm_name          = "${var.project_name}-${var.environment}-apigw-5xx"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 2
  metric_name         = "5XXError"
  namespace           = "AWS/ApiGateway"
  period              = 300
  statistic           = "Sum"
  threshold           = var.api_gw_5xx_threshold
  alarm_description   = "API Gateway 5XX errors exceed threshold"
  alarm_actions       = [aws_sns_topic.alarms.arn]
  ok_actions          = [aws_sns_topic.alarms.arn]
  treat_missing_data  = "notBreaching"

  dimensions = {
    ApiName = var.api_gateway_name
  }

  tags = var.tags
}

# 4. API Gateway Latency
resource "aws_cloudwatch_metric_alarm" "api_gw_latency" {
  alarm_name          = "${var.project_name}-${var.environment}-apigw-latency"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 3
  metric_name         = "Latency"
  namespace           = "AWS/ApiGateway"
  period              = 300
  statistic           = "Average"
  threshold           = var.api_gw_latency_threshold
  alarm_description   = "API Gateway latency exceeds threshold"
  alarm_actions       = [aws_sns_topic.alarms.arn]
  treat_missing_data  = "notBreaching"

  dimensions = {
    ApiName = var.api_gateway_name
  }

  tags = var.tags
}

# 5. DynamoDB Throttles (control-plane table)
resource "aws_cloudwatch_metric_alarm" "dynamodb_throttles" {
  alarm_name          = "${var.project_name}-${var.environment}-dynamodb-throttles"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 2
  metric_name         = "ThrottledRequests"
  namespace           = "AWS/DynamoDB"
  period              = 300
  statistic           = "Sum"
  threshold           = var.dynamodb_throttle_threshold
  alarm_description   = "DynamoDB throttled requests exceed threshold"
  alarm_actions       = [aws_sns_topic.alarms.arn]
  treat_missing_data  = "notBreaching"

  dimensions = {
    TableName = var.dynamodb_table_name
  }

  tags = var.tags
}

# 6. DynamoDB System Errors
resource "aws_cloudwatch_metric_alarm" "dynamodb_errors" {
  alarm_name          = "${var.project_name}-${var.environment}-dynamodb-errors"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 2
  metric_name         = "SystemErrors"
  namespace           = "AWS/DynamoDB"
  period              = 300
  statistic           = "Sum"
  threshold           = var.dynamodb_error_threshold
  alarm_description   = "DynamoDB system errors exceed threshold"
  alarm_actions       = [aws_sns_topic.alarms.arn]
  ok_actions          = [aws_sns_topic.alarms.arn]
  treat_missing_data  = "notBreaching"

  dimensions = {
    TableName = var.dynamodb_table_name
  }

  tags = var.tags
}

# 7. Cognito Auth Failures
resource "aws_cloudwatch_metric_alarm" "cognito_auth_failures" {
  alarm_name          = "${var.project_name}-${var.environment}-cognito-auth-failures"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 2
  metric_name         = "SignInSuccesses"
  namespace           = "AWS/Cognito"
  period              = 300
  statistic           = "Sum"
  threshold           = 0
  alarm_description   = "Cognito authentication anomaly detected"
  alarm_actions       = [aws_sns_topic.alarms.arn]
  treat_missing_data  = "notBreaching"

  dimensions = {
    UserPool   = var.cognito_user_pool_id
    UserPoolClient = var.cognito_client_id
  }

  tags = var.tags
}

# 8. SNS Delivery Failures
resource "aws_cloudwatch_metric_alarm" "sns_delivery_failures" {
  alarm_name          = "${var.project_name}-${var.environment}-sns-delivery-failures"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 2
  metric_name         = "NumberOfNotificationsFailed"
  namespace           = "AWS/SNS"
  period              = 300
  statistic           = "Sum"
  threshold           = var.sns_failure_threshold
  alarm_description   = "SNS notification delivery failures exceed threshold"
  alarm_actions       = [aws_sns_topic.alarms.arn]
  treat_missing_data  = "notBreaching"

  dimensions = {
    TopicName = aws_sns_topic.alarms.name
  }

  tags = var.tags
}
