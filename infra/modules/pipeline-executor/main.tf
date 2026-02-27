# =============================================================================
# Pipeline Executor Terraform Module
# =============================================================================
# Dedicated Lambda for pipeline execution with tight IAM scoping.
# Uses the worker-lambda pattern but with CloudWatch Logs read access
# for the polling endpoint.
# =============================================================================

variable "function_name" {
  type = string
}

variable "description" {
  type    = string
  default = "Pipeline Execution Engine"
}

variable "handler" {
  type    = string
  default = "dist/pipeline-executor.handler.handler"
}

variable "runtime" {
  type    = string
  default = "nodejs20.x"
}

variable "architecture" {
  type    = string
  default = "arm64"
}

variable "memory_size" {
  type    = number
  default = 1024
}

variable "timeout" {
  type    = number
  default = 600 # 10 minutes
}

variable "package_path" {
  type    = string
  default = "lambda-placeholder.zip"
}

variable "log_retention_days" {
  type    = number
  default = 7 # Cost optimization: 7 days retention
}

variable "dynamodb_table_arn" {
  description = "Control-plane DynamoDB table ARN"
  type        = string
}

variable "dynamodb_table_name" {
  description = "Control-plane DynamoDB table name"
  type        = string
}

variable "environment_variables" {
  type    = map(string)
  default = {}
}

variable "tags" {
  type    = map(string)
  default = {}
}

# =============================================================================
# IAM Role — Dedicated execution role with least-privilege
# =============================================================================

resource "aws_iam_role" "executor" {
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

# Basic Lambda execution (CloudWatch Logs write)
resource "aws_iam_role_policy_attachment" "basic" {
  role       = aws_iam_role.executor.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

# DynamoDB — scoped to specific table only
resource "aws_iam_role_policy" "dynamodb" {
  name = "${var.function_name}-dynamodb"
  role = aws_iam_role.executor.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect = "Allow"
      Action = [
        "dynamodb:GetItem",
        "dynamodb:PutItem",
        "dynamodb:UpdateItem",
        "dynamodb:Query"
      ]
      Resource = [
        var.dynamodb_table_arn,
        "${var.dynamodb_table_arn}/index/*"
      ]
    }]
  })
}

# CloudWatch Logs read — for polling endpoint (scoped to executor log group)
resource "aws_iam_role_policy" "cloudwatch_read" {
  name = "${var.function_name}-cw-read"
  role = aws_iam_role.executor.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect = "Allow"
      Action = [
        "logs:GetLogEvents",
        "logs:FilterLogEvents"
      ]
      Resource = [
        aws_cloudwatch_log_group.executor.arn,
        "${aws_cloudwatch_log_group.executor.arn}:*"
      ]
    }]
  })
}

# =============================================================================
# CloudWatch Log Group
# =============================================================================

resource "aws_cloudwatch_log_group" "executor" {
  name              = "/aws/lambda/${var.function_name}"
  retention_in_days = var.log_retention_days
  tags              = var.tags

  lifecycle {
    ignore_changes = [name]
  }
}

# =============================================================================
# Lambda Function
# =============================================================================

resource "aws_lambda_function" "executor" {
  function_name = var.function_name
  description   = var.description
  role          = aws_iam_role.executor.arn
  handler       = var.handler
  runtime       = var.runtime
  architectures = [var.architecture]
  memory_size   = var.memory_size
  timeout       = var.timeout

  filename         = var.package_path
  source_code_hash = fileexists(var.package_path) ? filebase64sha256(var.package_path) : null

  # Code is deployed by workflow 04b; Terraform should manage infra/config only.
  # Without this, infra syncs (workflow 04) can overwrite executor code with placeholder artifacts.
  lifecycle {
    ignore_changes = [
      filename,
      source_code_hash,
    ]
  }

  environment {
    variables = merge(var.environment_variables, {
      CONTROL_PLANE_TABLE_NAME = var.dynamodb_table_name
    })
  }

  depends_on = [
    aws_cloudwatch_log_group.executor,
    aws_iam_role_policy_attachment.basic,
  ]

  tags = var.tags
}

resource "aws_lambda_alias" "live" {
  name             = "live"
  description      = "Live alias for ${var.function_name}"
  function_name    = aws_lambda_function.executor.function_name
  function_version = aws_lambda_function.executor.version
}

# =============================================================================
# Outputs
# =============================================================================

output "function_name" {
  value = aws_lambda_function.executor.function_name
}

output "function_arn" {
  value = aws_lambda_function.executor.arn
}

output "invoke_arn" {
  value = aws_lambda_function.executor.invoke_arn
}

output "role_arn" {
  value = aws_iam_role.executor.arn
}

output "log_group_name" {
  value = aws_cloudwatch_log_group.executor.name
}

output "log_group_arn" {
  value = aws_cloudwatch_log_group.executor.arn
}

data "aws_region" "current" {}
data "aws_caller_identity" "current" {}
