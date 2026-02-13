variable "project_name" {
  description = "Project name prefix"
  type        = string
}

variable "environment" {
  description = "Environment name"
  type        = string
}

variable "alarm_email" {
  description = "Email for alarm notifications"
  type        = string
  default     = ""
}

variable "lambda_function_name" {
  description = "Lambda function name to monitor"
  type        = string
}

variable "api_gateway_name" {
  description = "API Gateway name to monitor"
  type        = string
}

variable "dynamodb_table_name" {
  description = "DynamoDB table name to monitor"
  type        = string
}

variable "cognito_user_pool_id" {
  description = "Cognito User Pool ID"
  type        = string
}

variable "cognito_client_id" {
  description = "Cognito Client ID"
  type        = string
}

variable "lambda_error_threshold" {
  type    = number
  default = 5
}

variable "lambda_throttle_threshold" {
  type    = number
  default = 10
}

variable "api_gw_5xx_threshold" {
  type    = number
  default = 10
}

variable "api_gw_latency_threshold" {
  type    = number
  default = 5000
}

variable "dynamodb_throttle_threshold" {
  type    = number
  default = 5
}

variable "dynamodb_error_threshold" {
  type    = number
  default = 1
}

variable "sns_failure_threshold" {
  type    = number
  default = 1
}

variable "tags" {
  description = "Resource tags"
  type        = map(string)
  default     = {}
}
