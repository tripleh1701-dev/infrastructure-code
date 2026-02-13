variable "project_name" {
  description = "Project name"
  type        = string
}

variable "environment" {
  description = "Environment name (dev, staging, prod)"
  type        = string
}

variable "aws_region" {
  description = "AWS region"
  type        = string
  default     = "us-east-1"
}

# ---- VPC ----
variable "vpc_cidr" {
  description = "VPC CIDR block"
  type        = string
  default     = "10.0.0.0/16"
}

variable "vpc_az_count" {
  description = "Number of availability zones for VPC subnets"
  type        = number
  default     = 2
}

variable "enable_nat_gateway" {
  description = "Enable NAT Gateway for outbound internet from private subnets"
  type        = bool
  default     = true
}

# ---- Cognito ----
variable "enable_mfa" {
  type    = bool
  default = false
}

variable "enable_advanced_security" {
  type    = bool
  default = false
}

variable "cognito_callback_urls" {
  type    = list(string)
  default = ["http://localhost:3000/callback"]
}

variable "cognito_logout_urls" {
  type    = list(string)
  default = ["http://localhost:3000"]
}

variable "enable_cognito_auth" {
  type    = bool
  default = true
}

# ---- Lambda ----
variable "lambda_runtime" {
  type    = string
  default = "nodejs20.x"
}

variable "lambda_memory_size" {
  type    = number
  default = 512
}

variable "lambda_timeout" {
  type    = number
  default = 30
}

variable "lambda_package_path" {
  type    = string
  default = "lambda-placeholder.zip"
}

# ---- Customer Account (cross-account) ----
variable "data_plane_role_arn" {
  description = "IAM role ARN in the customer account"
  type        = string
  default     = ""
}

variable "data_plane_dynamodb_name" {
  description = "Customer account DynamoDB table name"
  type        = string
  default     = ""
}

variable "data_plane_region" {
  description = "Customer account AWS region"
  type        = string
  default     = ""
}

# ---- Monitoring ----
variable "alarm_email" {
  description = "Email for alarm notifications"
  type        = string
  default     = ""
}

# ---- Notification / SES ----
variable "credential_notification_enabled" {
  description = "Enable SES credential notification emails on user provisioning"
  type        = bool
  default     = false
}

variable "ses_sender_email" {
  description = "Verified SES sender email address"
  type        = string
  default     = "noreply@example.com"
}

variable "platform_login_url" {
  description = "Login URL included in credential notification emails"
  type        = string
  default     = ""
}

variable "platform_name" {
  description = "Platform name used in email templates"
  type        = string
  default     = "License Portal"
}

variable "platform_support_email" {
  description = "Support email included in notification emails"
  type        = string
  default     = "support@example.com"
}
