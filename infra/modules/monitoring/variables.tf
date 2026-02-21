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

variable "provisioning_notification_email" {
  description = "(Legacy) Single email for provisioning SNS notifications. Prefer provisioning_notification_emails."
  type        = string
  default     = ""
}

variable "provisioning_notification_emails" {
  description = "Emails that receive ALL provisioning events (completion + failure)"
  type        = list(string)
  default     = []
}

variable "provisioning_failure_only_emails" {
  description = "Emails that receive ONLY provisioning failure events (filtered via SNS)"
  type        = list(string)
  default     = []
}

variable "provisioning_cloud_type_emails" {
  description = "Map of email → list of cloud types to receive. Example: { \"ops@co.com\" = [\"private\"], \"all@co.com\" = [\"public\", \"private\"] }"
  type        = map(list(string))
  default     = {}
}

variable "tags" {
  description = "Resource tags"
  type        = map(string)
  default     = {}
}
