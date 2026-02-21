variable "project_name" {
  description = "Project name prefix"
  type        = string
}

variable "environment" {
  description = "Environment name (dev, staging, prod)"
  type        = string
}

variable "enable_mfa" {
  description = "Enable MFA for the user pool"
  type        = bool
  default     = false
}

variable "enable_advanced_security" {
  description = "Enable advanced security features"
  type        = bool
  default     = false
}

variable "callback_urls" {
  description = "OAuth callback URLs"
  type        = list(string)
  default     = ["http://localhost:3000/callback"]
}

variable "logout_urls" {
  description = "OAuth logout URLs"
  type        = list(string)
  default     = ["http://localhost:3000"]
}

variable "tags" {
  description = "Resource tags"
  type        = map(string)
  default     = {}
}

variable "post_confirmation_lambda_arn" {
  description = "ARN of the Post-Confirmation Lambda trigger (empty = no trigger)"
  type        = string
  default     = ""
}
