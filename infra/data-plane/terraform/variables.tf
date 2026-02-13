variable "project_name" {
  description = "Project name"
  type        = string
}

variable "environment" {
  description = "Environment name"
  type        = string
}

variable "aws_region" {
  description = "AWS region"
  type        = string
  default     = "us-east-1"
}

variable "platform_admin_account_id" {
  description = "AWS Account ID of the Platform Admin account"
  type        = string
}

variable "external_id" {
  description = "External ID for cross-account role assumption"
  type        = string
}

variable "customer_account_role_arn" {
  description = "ARN of the customer account IAM role for Terraform provider assumption (empty = use current credentials)"
  type        = string
  default     = ""
}
