# =============================================================================
# Worker Lambda Module - Reusable for all worker functions
# =============================================================================
# Used for: create-infra, delete-infra, poll-infra, setup-rbac, create-admin
# =============================================================================

resource "aws_iam_role" "worker" {
  name = "${var.function_name}-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Action    = "sts:AssumeRole"
      Effect    = "Allow"
      Principal = { Service = "lambda.amazonaws.com" }
    }]
  })

  tags = var.tags
}

# Basic Lambda execution
resource "aws_iam_role_policy_attachment" "basic" {
  role       = aws_iam_role.worker.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

# VPC access (if VPC is enabled)
resource "aws_iam_role_policy_attachment" "vpc" {
  count      = var.vpc_subnet_ids != null ? 1 : 0
  role       = aws_iam_role.worker.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaVPCAccessExecutionRole"
}

# DynamoDB access (control-plane table)
resource "aws_iam_role_policy" "dynamodb" {
  count = var.enable_dynamodb ? 1 : 0
  name  = "${var.function_name}-dynamodb"
  role  = aws_iam_role.worker.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect = "Allow"
      Action = [
        "dynamodb:GetItem", "dynamodb:PutItem", "dynamodb:UpdateItem",
        "dynamodb:DeleteItem", "dynamodb:Query", "dynamodb:Scan",
        "dynamodb:BatchGetItem", "dynamodb:BatchWriteItem"
      ]
      Resource = [var.dynamodb_table_arn, "${var.dynamodb_table_arn}/index/*"]
    }]
  })
}

# Cross-account assume role (for customer account operations)
resource "aws_iam_role_policy" "assume_customer" {
  count = var.customer_account_role_arn != "" ? 1 : 0
  name  = "${var.function_name}-assume-customer"
  role  = aws_iam_role.worker.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect   = "Allow"
      Action   = "sts:AssumeRole"
      Resource = var.customer_account_role_arn
    }]
  })
}

# CloudFormation permissions (for create/delete-infra workers)
resource "aws_iam_role_policy" "cloudformation" {
  count = var.enable_cloudformation ? 1 : 0
  name  = "${var.function_name}-cloudformation"
  role  = aws_iam_role.worker.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect   = "Allow"
        Action   = ["cloudformation:CreateStack", "cloudformation:DeleteStack", "cloudformation:DescribeStacks", "cloudformation:DescribeStackEvents", "cloudformation:UpdateStack"]
        Resource = "*"
      },
      {
        Effect   = "Allow"
        Action   = "iam:PassRole"
        Resource = "*"
        Condition = {
          StringEquals = { "iam:PassedToService" = "cloudformation.amazonaws.com" }
        }
      }
    ]
  })
}

# Cognito access (for create-admin worker)
resource "aws_iam_role_policy" "cognito" {
  count = var.enable_cognito ? 1 : 0
  name  = "${var.function_name}-cognito"
  role  = aws_iam_role.worker.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect = "Allow"
      Action = [
        "cognito-idp:AdminCreateUser", "cognito-idp:AdminDeleteUser",
        "cognito-idp:AdminGetUser", "cognito-idp:AdminUpdateUserAttributes",
        "cognito-idp:AdminAddUserToGroup", "cognito-idp:AdminRemoveUserFromGroup",
        "cognito-idp:AdminSetUserPassword", "cognito-idp:ListUsers"
      ]
      Resource = var.cognito_user_pool_arn
    }]
  })
}

# SSM read access
resource "aws_iam_role_policy" "ssm" {
  name = "${var.function_name}-ssm"
  role = aws_iam_role.worker.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect   = "Allow"
      Action   = ["ssm:GetParameter", "ssm:GetParameters", "ssm:GetParametersByPath", "ssm:PutParameter"]
      Resource = "arn:aws:ssm:${data.aws_region.current.name}:${data.aws_caller_identity.current.account_id}:parameter/${var.ssm_prefix}/*"
    }]
  })
}

# SES email sending access (for notification workers)
resource "aws_iam_role_policy" "ses" {
  count = var.enable_ses ? 1 : 0
  name  = "${var.function_name}-ses-send"
  role  = aws_iam_role.worker.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect   = "Allow"
      Action   = ["ses:SendEmail", "ses:SendRawEmail"]
      Resource = "*"
    }]
  })
}

# CloudWatch metrics (for notification workers)
resource "aws_iam_role_policy" "cloudwatch_metrics" {
  count = var.enable_cloudwatch_metrics ? 1 : 0
  name  = "${var.function_name}-cloudwatch-metrics"
  role  = aws_iam_role.worker.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect   = "Allow"
      Action   = ["cloudwatch:PutMetricData"]
      Resource = "*"
    }]
  })
}

# Step Functions callback (for async workers)
resource "aws_iam_role_policy" "step_functions" {
  count = var.enable_step_functions_callback ? 1 : 0
  name  = "${var.function_name}-sfn-callback"
  role  = aws_iam_role.worker.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect   = "Allow"
      Action   = ["states:SendTaskSuccess", "states:SendTaskFailure", "states:SendTaskHeartbeat"]
      Resource = "*"
    }]
  })
}

resource "aws_cloudwatch_log_group" "worker" {
  name              = "/aws/lambda/${var.function_name}"
  retention_in_days = var.log_retention_days
  tags              = var.tags
}

resource "aws_lambda_function" "worker" {
  function_name = var.function_name
  description   = var.description
  role          = aws_iam_role.worker.arn
  handler       = var.handler
  runtime       = var.runtime
  architectures = [var.architecture]
  memory_size   = var.memory_size
  timeout       = var.timeout

  filename         = var.package_path
  source_code_hash = fileexists(var.package_path) ? filebase64sha256(var.package_path) : null

  dynamic "vpc_config" {
    for_each = var.vpc_subnet_ids != null ? [1] : []
    content {
      subnet_ids         = var.vpc_subnet_ids
      security_group_ids = var.vpc_security_group_ids
    }
  }

  environment {
    variables = var.environment_variables
  }

  depends_on = [
    aws_cloudwatch_log_group.worker,
    aws_iam_role_policy_attachment.basic,
  ]

  tags = var.tags
}

data "aws_region" "current" {}
data "aws_caller_identity" "current" {}
