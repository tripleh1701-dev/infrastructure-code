# =============================================================================
# Cognito Module - Authentication (Control Plane Only)
# =============================================================================

resource "aws_cognito_user_pool" "main" {
  name = "${var.project_name}-${var.environment}-user-pool"

  username_attributes      = ["email"]
  auto_verified_attributes = ["email"]

  password_policy {
    minimum_length                   = 8
    require_lowercase                = true
    require_numbers                  = true
    require_symbols                  = true
    require_uppercase                = true
    temporary_password_validity_days = 7
  }

  account_recovery_setting {
    recovery_mechanism {
      name     = "verified_email"
      priority = 1
    }
  }

  mfa_configuration = var.enable_mfa ? "OPTIONAL" : "OFF"

  dynamic "software_token_mfa_configuration" {
    for_each = var.enable_mfa ? [1] : []
    content {
      enabled = true
    }
  }

  email_configuration {
    email_sending_account = "COGNITO_DEFAULT"
  }

  # Custom attributes for multi-tenancy
  schema {
    name                     = "account_id"
    attribute_data_type      = "String"
    developer_only_attribute = false
    mutable                  = true
    required                 = false
    string_attribute_constraints {
      min_length = 1
      max_length = 256
    }
  }

  schema {
    name                     = "enterprise_id"
    attribute_data_type      = "String"
    developer_only_attribute = false
    mutable                  = true
    required                 = false
    string_attribute_constraints {
      min_length = 1
      max_length = 256
    }
  }

  schema {
    name                     = "role"
    attribute_data_type      = "String"
    developer_only_attribute = false
    mutable                  = true
    required                 = false
    string_attribute_constraints {
      min_length = 1
      max_length = 50
    }
  }

  schema {
    name                     = "tenant_id"
    attribute_data_type      = "String"
    developer_only_attribute = false
    mutable                  = true
    required                 = false
    string_attribute_constraints {
      min_length = 1
      max_length = 256
    }
  }

  verification_message_template {
    default_email_option = "CONFIRM_WITH_CODE"
    email_subject        = "Trumpet DevOps – Verify Your Email Address"
    email_message        = <<-EOT
<html>
<body style="margin:0;padding:0;font-family:'Segoe UI',Arial,Helvetica,sans-serif;background-color:#f4f6f9;">
<table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f6f9;padding:40px 0;">
<tr><td align="center">
<table width="520" cellpadding="0" cellspacing="0" style="background-color:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">
<tr><td style="background:linear-gradient(135deg,#1a6ddb,#0db7c4);padding:32px 40px;text-align:center;">
<h1 style="margin:0;color:#ffffff;font-size:24px;font-weight:700;">Trumpet DevOps</h1>
<p style="margin:8px 0 0;color:rgba(255,255,255,0.85);font-size:14px;">CI/CD Platform</p>
</td></tr>
<tr><td style="padding:36px 40px;">
<h2 style="margin:0 0 12px;color:#1a1a2e;font-size:20px;font-weight:600;">Verify Your Email Address</h2>
<p style="margin:0 0 24px;color:#555;font-size:15px;line-height:1.6;">Thank you for creating your Trumpet DevOps account. To complete your registration, please enter the following verification code:</p>
<div style="text-align:center;margin:0 0 24px;">
<div style="display:inline-block;background-color:#f0f4ff;border:2px dashed #1a6ddb;border-radius:8px;padding:16px 32px;">
<span style="font-size:32px;font-weight:700;letter-spacing:8px;color:#1a6ddb;font-family:'Courier New',monospace;">{####}</span>
</div>
</div>
<p style="margin:0 0 8px;color:#555;font-size:14px;line-height:1.5;">This code is valid for <strong>24 hours</strong>. If you did not request this verification, you can safely ignore this email.</p>
<hr style="border:none;border-top:1px solid #eee;margin:24px 0;" />
<p style="margin:0;color:#999;font-size:12px;line-height:1.5;">Need help? Contact our support team if you have any questions about your account setup.</p>
</td></tr>
<tr><td style="background-color:#f8f9fb;padding:20px 40px;text-align:center;">
<p style="margin:0;color:#aaa;font-size:11px;">&copy; 2024 Trumpet DevOps. All rights reserved.</p>
</td></tr>
</table>
</td></tr>
</table>
</body>
</html>
EOT
  }

  user_pool_add_ons {
    advanced_security_mode = var.enable_advanced_security ? "ENFORCED" : "OFF"
  }

  dynamic "lambda_config" {
    for_each = var.post_confirmation_lambda_arn != "" ? [1] : []
    content {
      post_confirmation = var.post_confirmation_lambda_arn
    }
  }

  tags = var.tags
}

resource "aws_cognito_user_pool_domain" "main" {
  domain       = "${var.project_name}-${var.environment}"
  user_pool_id = aws_cognito_user_pool.main.id
}

resource "aws_cognito_user_pool_client" "main" {
  name         = "${var.project_name}-${var.environment}-client"
  user_pool_id = aws_cognito_user_pool.main.id

  access_token_validity  = 1
  id_token_validity      = 1
  refresh_token_validity = 30

  token_validity_units {
    access_token  = "hours"
    id_token      = "hours"
    refresh_token = "days"
  }

  explicit_auth_flows = [
    "ALLOW_USER_SRP_AUTH",
    "ALLOW_REFRESH_TOKEN_AUTH",
  ]

  allowed_oauth_flows                  = ["code"]
  allowed_oauth_flows_user_pool_client = true
  allowed_oauth_scopes                 = ["email", "openid", "profile"]

  callback_urls = var.callback_urls
  logout_urls   = var.logout_urls

  supported_identity_providers = ["COGNITO"]

  prevent_user_existence_errors = "ENABLED"
  enable_token_revocation       = true

  read_attributes = [
    "email",
    "email_verified",
    "custom:account_id",
    "custom:enterprise_id",
    "custom:role",
    "custom:tenant_id",
  ]

  write_attributes = [
    "email",
    "custom:account_id",
    "custom:enterprise_id",
    "custom:role",
    "custom:tenant_id",
  ]
}

resource "aws_cognito_user_group" "admin" {
  name         = "admin"
  user_pool_id = aws_cognito_user_pool.main.id
  description  = "Platform administrators"
  precedence   = 1
}

resource "aws_cognito_user_group" "manager" {
  name         = "manager"
  user_pool_id = aws_cognito_user_pool.main.id
  description  = "Account managers"
  precedence   = 2
}

resource "aws_cognito_user_group" "user" {
  name         = "user"
  user_pool_id = aws_cognito_user_pool.main.id
  description  = "Standard users"
  precedence   = 3
}
