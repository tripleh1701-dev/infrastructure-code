variable "project_name" {
  description = "Project name used for resource naming"
  type        = string
}

variable "github_org" {
  description = "GitHub organization or username (e.g. 'my-org')"
  type        = string
}

variable "github_repo" {
  description = "GitHub repository name (e.g. 'license-portal')"
  type        = string
}

variable "create_oidc_provider" {
  description = "Whether to create the GitHub OIDC provider (set false if it already exists in this account)"
  type        = bool
  default     = true
}

variable "manage_assume_role_policy" {
  description = "Whether Terraform should actively manage (update) the GitHub Actions role trust policy"
  type        = bool
  default     = false
}

variable "tf_state_bucket" {
  description = "S3 bucket name for Terraform state"
  type        = string
}

variable "tf_lock_table" {
  description = "DynamoDB table name for Terraform state locking"
  type        = string
}

variable "data_plane_role_arn" {
  description = "IAM role ARN for cross-account data plane access (optional)"
  type        = string
  default     = ""
}

variable "tags" {
  description = "Tags to apply to all resources"
  type        = map(string)
  default     = {}
}
