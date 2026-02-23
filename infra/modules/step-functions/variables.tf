variable "name_prefix" {
  description = "Prefix for resource names"
  type        = string
}

variable "worker_lambda_arns" {
  description = "List of all worker Lambda ARNs that Step Functions can invoke"
  type        = list(string)
}

variable "create_infra_worker_arn" {
  description = "ARN of the create-infra-worker Lambda"
  type        = string
}

variable "delete_infra_worker_arn" {
  description = "ARN of the delete-infra-worker Lambda"
  type        = string
}

variable "poll_infra_worker_arn" {
  description = "ARN of the poll-infra-worker Lambda"
  type        = string
}

variable "setup_rbac_worker_arn" {
  description = "ARN of the setup-rbac-worker Lambda"
  type        = string
}

variable "create_admin_worker_arn" {
  description = "ARN of the create-admin-worker Lambda"
  type        = string
}

variable "verify_provisioning_worker_arn" {
  description = "ARN of the verify-provisioning-worker Lambda"
  type        = string
}

variable "log_retention_days" {
  description = "CloudWatch log retention in days"
  type        = number
  default     = 30
}

variable "tags" {
  description = "Resource tags"
  type        = map(string)
  default     = {}
}
