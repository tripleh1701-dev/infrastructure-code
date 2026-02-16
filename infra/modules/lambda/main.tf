# =============================================================================
# Lambda Module - NestJS Backend (Control Plane Only)
# =============================================================================

resource "aws_iam_role" "lambda" {
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

resource "aws_iam_role_policy_attachment" "lambda_basic" {
  role       = aws_iam_role.lambda.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

# Control-plane DynamoDB access
resource "aws_iam_role_policy" "control_plane_dynamodb" {
  name = "${var.function_name}-control-plane-dynamodb"
  role = aws_iam_role.lambda.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect = "Allow"
      Action = [
        "dynamodb:GetItem",
        "dynamodb:PutItem",
        "dynamodb:UpdateItem",
        "dynamodb:DeleteItem",
        "dynamodb:Query",
        "dynamodb:Scan",
        "dynamodb:BatchGetItem",
        "dynamodb:BatchWriteItem",
        "dynamodb:DescribeTable"
      ]
      Resource = [
        var.control_plane_dynamodb_arn,
        "${var.control_plane_dynamodb_arn}/index/*"
      ]
    }]
  })
}

# Cross-account assume role for data-plane access
resource "aws_iam_role_policy" "assume_data_plane" {
  count = var.data_plane_role_arn != "" ? 1 : 0
  name  = "${var.function_name}-assume-data-plane"
  role  = aws_iam_role.lambda.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect   = "Allow"
      Action   = "sts:AssumeRole"
      Resource = var.data_plane_role_arn
    }]
  })
}

# SSM read/write access for platform config and account registration
resource "aws_iam_role_policy" "ssm_access" {
  name = "${var.function_name}-ssm-access"
  role = aws_iam_role.lambda.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid      = "SSMPlatformConfig"
        Effect   = "Allow"
        Action   = ["ssm:GetParameter", "ssm:GetParameters", "ssm:GetParametersByPath"]
        Resource = "arn:aws:ssm:${data.aws_region.current.name}:${data.aws_caller_identity.current.account_id}:parameter/${var.project_name}/${var.environment}/*"
      },
      {
        Sid      = "SSMAccountRegistration"
        Effect   = "Allow"
        Action   = ["ssm:PutParameter", "ssm:GetParameter", "ssm:DeleteParameter"]
        Resource = "arn:aws:ssm:${data.aws_region.current.name}:${data.aws_caller_identity.current.account_id}:parameter/accounts/*"
      }
    ]
  })
}

# Cognito admin access
resource "aws_iam_role_policy" "cognito_access" {
  count = var.enable_cognito ? 1 : 0
  name  = "${var.function_name}-cognito-access"
  role  = aws_iam_role.lambda.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect = "Allow"
      Action = [
        "cognito-idp:AdminCreateUser",
        "cognito-idp:AdminDeleteUser",
        "cognito-idp:AdminGetUser",
        "cognito-idp:AdminUpdateUserAttributes",
        "cognito-idp:AdminAddUserToGroup",
        "cognito-idp:AdminRemoveUserFromGroup",
        "cognito-idp:ListUsers"
      ]
      Resource = var.cognito_user_pool_arn
    }]
  })
}

# Account Registry DynamoDB access (separate from control-plane table)
resource "aws_iam_role_policy" "account_registry_dynamodb" {
  count = var.enable_account_registry ? 1 : 0
  name  = "${var.function_name}-account-registry-dynamodb"
  role  = aws_iam_role.lambda.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect = "Allow"
      Action = [
        "dynamodb:GetItem",
        "dynamodb:PutItem",
        "dynamodb:UpdateItem",
        "dynamodb:DeleteItem",
        "dynamodb:Query",
        "dynamodb:Scan",
        "dynamodb:BatchGetItem",
        "dynamodb:BatchWriteItem"
      ]
      Resource = [
        var.account_registry_dynamodb_arn,
        "${var.account_registry_dynamodb_arn}/index/*"
      ]
    }]
  })
}

# SES email sending access
resource "aws_iam_role_policy" "ses_send" {
  count = var.enable_ses ? 1 : 0
  name  = "${var.function_name}-ses-send"
  role  = aws_iam_role.lambda.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect = "Allow"
      Action = [
        "ses:SendEmail",
        "ses:SendRawEmail"
      ]
      Resource = "*"
    }]
  })
}

# Step Functions execution access
resource "aws_iam_role_policy" "step_functions" {
  count = length(var.step_functions_arns) > 0 ? 1 : 0
  name  = "${var.function_name}-step-functions"
  role  = aws_iam_role.lambda.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect   = "Allow"
      Action   = ["states:StartExecution", "states:DescribeExecution", "states:StopExecution"]
      Resource = var.step_functions_arns
    }]
  })
}

resource "aws_cloudwatch_log_group" "lambda" {
  name              = "/aws/lambda/${var.function_name}"
  retention_in_days = var.log_retention_days
  tags              = var.tags
}

resource "aws_lambda_function" "main" {
  function_name = var.function_name
  description   = var.description
  role          = aws_iam_role.lambda.arn
  handler       = "dist/main.handler"
  runtime       = var.runtime
  architectures = [var.architecture]
  memory_size   = var.memory_size
  timeout       = var.timeout

  filename         = var.package_path
  source_code_hash = fileexists(var.package_path) ? filebase64sha256(var.package_path) : null

  reserved_concurrent_executions = var.reserved_concurrent_executions

  environment {
    variables = merge(var.environment_variables, {
      NODE_ENV                     = var.environment
      CONTROL_PLANE_TABLE_NAME     = var.control_plane_dynamodb_name
      DATA_PLANE_ROLE_ARN          = var.data_plane_role_arn
      DATA_PLANE_TABLE_NAME        = var.data_plane_dynamodb_name
      DATA_PLANE_REGION            = var.data_plane_region
      SSM_PREFIX                   = "/${var.project_name}/${var.environment}"
    })
  }

  depends_on = [
    aws_cloudwatch_log_group.lambda,
    aws_iam_role_policy_attachment.lambda_basic,
  ]

  tags = var.tags
}

resource "aws_lambda_alias" "live" {
  name             = "live"
  description      = "Live alias for ${var.function_name}"
  function_name    = aws_lambda_function.main.function_name
  function_version = aws_lambda_function.main.version
}

data "aws_region" "current" {}
data "aws_caller_identity" "current" {}
