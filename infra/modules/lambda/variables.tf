variable "function_name" {
  description = "Lambda function name"
  type        = string
}

variable "description" {
  description = "Lambda function description"
  type        = string
  default     = "NestJS Backend"
}

variable "project_name" {
  description = "Project name for SSM prefix"
  type        = string
}

variable "environment" {
  description = "Environment name"
  type        = string
}

variable "runtime" {
  description = "Lambda runtime"
  type        = string
  default     = "nodejs20.x"
}

variable "architecture" {
  description = "Lambda architecture"
  type        = string
  default     = "arm64"
}

variable "memory_size" {
  description = "Lambda memory in MB"
  type        = number
  default     = 512
}

variable "timeout" {
  description = "Lambda timeout in seconds"
  type        = number
  default     = 30
}

variable "package_path" {
  description = "Path to Lambda deployment package"
  type        = string
  default     = "lambda-placeholder.zip"
}

variable "reserved_concurrent_executions" {
  description = "Reserved concurrent executions"
  type        = number
  default     = -1
}

variable "log_retention_days" {
  description = "CloudWatch log retention in days"
  type        = number
  default     = 30
}

variable "control_plane_dynamodb_arn" {
  description = "ARN of the control-plane DynamoDB table"
  type        = string
}

variable "control_plane_dynamodb_name" {
  description = "Name of the control-plane DynamoDB table"
  type        = string
}

variable "data_plane_role_arn" {
  description = "ARN of the IAM role to assume in the data-plane account"
  type        = string
  default     = ""
}

variable "data_plane_dynamodb_name" {
  description = "Name of the data-plane DynamoDB table"
  type        = string
  default     = ""
}

variable "data_plane_region" {
  description = "AWS region of the data-plane"
  type        = string
  default     = ""
}

variable "cognito_user_pool_arn" {
  description = "ARN of the Cognito user pool"
  type        = string
  default     = ""
}

variable "enable_cognito" {
  description = "Whether to create Cognito IAM policy"
  type        = bool
  default     = false
}

variable "environment_variables" {
  description = "Additional environment variables"
  type        = map(string)
  default     = {}
}

variable "account_registry_dynamodb_arn" {
  description = "ARN of the account registry DynamoDB table"
  type        = string
  default     = ""
}

variable "enable_account_registry" {
  description = "Whether to create account registry DynamoDB IAM policy"
  type        = bool
  default     = false
}

variable "step_functions_arns" {
  description = "ARNs of Step Functions state machines the Lambda can invoke"
  type        = list(string)
  default     = []
}

variable "enable_ses" {
  description = "Whether to create SES SendEmail IAM policy"
  type        = bool
  default     = false
}

variable "enable_sns_publish" {
  description = "Whether to create SNS Publish IAM policy for provisioning notifications"
  type        = bool
  default     = false
}

variable "sns_topic_arn" {
  description = "SNS topic ARN for provisioning notifications"
  type        = string
  default     = ""
}

variable "cfn_template_bucket_arn" {
  description = "ARN of the S3 bucket used for CloudFormation templates (private cloud provisioning)"
  type        = string
  default     = ""
}

variable "enable_cfn_template_bucket" {
  description = "Whether to create S3 IAM policy for CFN template bucket access"
  type        = bool
  default     = false
}

variable "enable_cloudformation" {
  description = "Whether to create CloudFormation IAM policy for stack provisioning"
  type        = bool
  default     = false
}

variable "tags" {
  description = "Resource tags"
  type        = map(string)
  default     = {}
}
