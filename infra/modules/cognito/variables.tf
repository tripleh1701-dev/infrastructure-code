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

# ---- SES Email Configuration ----
variable "ses_email_sending_account" {
  description = "Email sending mode: COGNITO_DEFAULT (50/day limit) or DEVELOPER (uses SES, no limit)"
  type        = string
  default     = "DEVELOPER"
}

variable "ses_sender_arn" {
  description = "ARN of the verified SES identity (domain or email). Required when ses_email_sending_account = DEVELOPER."
  type        = string
  default     = ""
}

variable "ses_sender_email" {
  description = "FROM address for Cognito emails when using DEVELOPER mode"
  type        = string
  default     = ""
}
