variable "function_name" {
  type = string
}

variable "description" {
  type    = string
  default = "Worker Lambda"
}

variable "handler" {
  type    = string
  default = "dist/main.handler"
}

variable "runtime" {
  type    = string
  default = "nodejs20.x"
}

variable "architecture" {
  type    = string
  default = "arm64"
}

variable "memory_size" {
  type    = number
  default = 256
}

variable "timeout" {
  type    = number
  default = 300
}

variable "package_path" {
  type    = string
  default = "lambda-placeholder.zip"
}

variable "log_retention_days" {
  type    = number
  default = 30
}

# Networking
variable "vpc_subnet_ids" {
  type    = list(string)
  default = null
}

variable "vpc_security_group_ids" {
  type    = list(string)
  default = []
}

# Permissions
variable "dynamodb_table_arn" {
  type    = string
  default = ""
}

variable "enable_dynamodb" {
  description = "Whether to create DynamoDB IAM policy"
  type        = bool
  default     = false
}

variable "customer_account_role_arn" {
  type    = string
  default = ""
}

variable "enable_cloudformation" {
  type    = bool
  default = false
}

variable "cognito_user_pool_arn" {
  type    = string
  default = ""
}

variable "enable_cognito" {
  description = "Whether to create Cognito IAM policy"
  type        = bool
  default     = false
}

variable "ssm_prefix" {
  type    = string
  default = ""
}

variable "enable_step_functions_callback" {
  type    = bool
  default = false
}

variable "enable_ses" {
  description = "Whether to create SES SendEmail IAM policy"
  type        = bool
  default     = false
}

variable "enable_cloudwatch_metrics" {
  description = "Whether to create CloudWatch PutMetricData IAM policy"
  type        = bool
  default     = false
}

variable "enable_sns_publish" {
  description = "Whether to create SNS Publish IAM policy"
  type        = bool
  default     = false
}

variable "sns_topic_arn" {
  description = "SNS topic ARN for provisioning notifications"
  type        = string
  default     = ""
}

variable "environment_variables" {
  type    = map(string)
  default = {}
}

variable "tags" {
  type    = map(string)
  default = {}
}
