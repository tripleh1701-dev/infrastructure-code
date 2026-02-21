output "sns_topic_arn" {
  description = "SNS topic ARN for alarm notifications"
  value       = aws_sns_topic.alarms.arn
}

output "alarm_names" {
  description = "List of all CloudWatch alarm names"
  value = [
    aws_cloudwatch_metric_alarm.lambda_errors.alarm_name,
    aws_cloudwatch_metric_alarm.lambda_throttles.alarm_name,
    aws_cloudwatch_metric_alarm.api_gw_5xx.alarm_name,
    aws_cloudwatch_metric_alarm.api_gw_latency.alarm_name,
    aws_cloudwatch_metric_alarm.dynamodb_throttles.alarm_name,
    aws_cloudwatch_metric_alarm.dynamodb_errors.alarm_name,
    aws_cloudwatch_metric_alarm.cognito_auth_failures.alarm_name,
    aws_cloudwatch_metric_alarm.sns_delivery_failures.alarm_name,
  ]
}

output "provisioning_sns_topic_arn" {
  description = "SNS topic ARN for provisioning lifecycle notifications"
  value       = length(aws_sns_topic.provisioning) > 0 ? aws_sns_topic.provisioning[0].arn : ""
}
