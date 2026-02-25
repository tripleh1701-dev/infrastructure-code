# =============================================================================
# Customer Account — Full Resource Provisioning
# =============================================================================
# Provisions:
#   - DynamoDB table: account-admin-public-{workspace}
#   - IAM cross-account role (if separate account)
#   - SSM parameters
#   - CloudFormation stack support (private tier — created/deleted by workers)
#   - CloudFormation execution role (for private-tier stacks)
# =============================================================================

terraform {
  required_version = ">= 1.5.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }

  backend "s3" {}
}

provider "aws" {
  region = var.aws_region

  # When running from CI, Terraform assumes the customer account role directly.
  # The TF state backend uses the caller's credentials (Platform Admin).
  # For local runs, omit these variables to use current credentials.
  dynamic "assume_role" {
    for_each = var.customer_account_role_arn != "" ? [1] : []
    content {
      role_arn    = var.customer_account_role_arn
      external_id = var.external_id
      session_name = "TerraformDataPlane"
    }
  }

  default_tags {
    tags = {
      Project     = var.project_name
      Environment = var.environment
      ManagedBy   = "terraform"
      Plane       = "customer-account"
    }
  }
}

locals {
  name_prefix = "${var.project_name}-${var.environment}"
  common_tags = {
    Project     = var.project_name
    Environment = var.environment
  }
  ssm_prefix = "/${var.project_name}/${var.environment}"
}

# =============================================================================
# 1. Customer Data DynamoDB — account-admin-public-{workspace}
# =============================================================================
module "customer_dynamodb" {
  source = "../../modules/dynamodb"

  table_name  = "account-admin-public-${var.environment}"
  enable_pitr = true
  tags        = local.common_tags
}

# =============================================================================
# 2. Cross-Account IAM Role (assumable by Platform Admin)
# =============================================================================
resource "aws_iam_role" "customer_account_access" {
  name = "${local.name_prefix}-customer-account-access"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Action    = ["sts:AssumeRole", "sts:TagSession"]
      Principal = { AWS = "arn:aws:iam::${var.platform_admin_account_id}:root" }
      Condition = {
        StringEquals = {
          "sts:ExternalId" = var.external_id
        }
      }
    }]
  })

  tags = local.common_tags
}

# Least-privilege DynamoDB access
resource "aws_iam_role_policy" "dynamodb_access" {
  name = "${local.name_prefix}-dynamodb-access"
  role = aws_iam_role.customer_account_access.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect = "Allow"
      Action = [
        "dynamodb:GetItem", "dynamodb:PutItem", "dynamodb:UpdateItem",
        "dynamodb:DeleteItem", "dynamodb:Query", "dynamodb:Scan",
        "dynamodb:BatchGetItem", "dynamodb:BatchWriteItem", "dynamodb:DescribeTable"
      ]
      Resource = [
        module.customer_dynamodb.table_arn,
        "${module.customer_dynamodb.table_arn}/index/*"
      ]
    }]
  })
}

# CloudFormation management (for private-tier stacks created by workers)
resource "aws_iam_role_policy" "cloudformation_access" {
  name = "${local.name_prefix}-cloudformation-access"
  role = aws_iam_role.customer_account_access.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "CloudFormationManagement"
        Effect = "Allow"
        Action = [
          "cloudformation:CreateStack", "cloudformation:DeleteStack",
          "cloudformation:DescribeStacks", "cloudformation:DescribeStackEvents",
          "cloudformation:DescribeStackResource", "cloudformation:DescribeStackResources",
          "cloudformation:UpdateStack", "cloudformation:ListStackResources"
        ]
        Resource = "arn:aws:cloudformation:${var.aws_region}:*:stack/${var.project_name}-*/*"
      },
      {
        Sid    = "CloudFormationPassRole"
        Effect = "Allow"
        Action = "iam:PassRole"
        Resource = aws_iam_role.cloudformation_execution.arn
      },
      {
        Sid    = "DynamoDBForPrivateStacks"
        Effect = "Allow"
        Action = [
          "dynamodb:CreateTable", "dynamodb:DeleteTable",
          "dynamodb:DescribeTable", "dynamodb:TagResource"
        ]
        Resource = "arn:aws:dynamodb:${var.aws_region}:*:table/${var.project_name}-*"
      }
    ]
  })
}

# SSM read/write for customer account config
resource "aws_iam_role_policy" "ssm_access" {
  name = "${local.name_prefix}-ssm-access"
  role = aws_iam_role.customer_account_access.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect = "Allow"
      Action = [
        "ssm:GetParameter", "ssm:GetParameters", "ssm:GetParametersByPath",
        "ssm:PutParameter", "ssm:DeleteParameter"
      ]
      Resource = "arn:aws:ssm:${var.aws_region}:*:parameter${local.ssm_prefix}/*"
    }]
  })
}

# =============================================================================
# 3. CloudFormation Execution Role (for private-tier stacks)
# =============================================================================
resource "aws_iam_role" "cloudformation_execution" {
  name = "${local.name_prefix}-cfn-execution"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Action    = "sts:AssumeRole"
      Principal = { Service = "cloudformation.amazonaws.com" }
    }]
  })

  tags = local.common_tags
}

resource "aws_iam_role_policy" "cfn_execution_permissions" {
  name = "${local.name_prefix}-cfn-execution-permissions"
  role = aws_iam_role.cloudformation_execution.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "DynamoDBManagement"
        Effect = "Allow"
        Action = [
          "dynamodb:CreateTable", "dynamodb:DeleteTable", "dynamodb:DescribeTable",
          "dynamodb:UpdateTable", "dynamodb:TagResource", "dynamodb:UntagResource",
          "dynamodb:UpdateContinuousBackups"
        ]
        Resource = "arn:aws:dynamodb:${var.aws_region}:*:table/${var.project_name}-*"
      },
      {
        Sid    = "IAMForDynamoDB"
        Effect = "Allow"
        Action = [
          "iam:CreateRole", "iam:DeleteRole", "iam:AttachRolePolicy",
          "iam:DetachRolePolicy", "iam:PutRolePolicy", "iam:DeleteRolePolicy",
          "iam:GetRole", "iam:PassRole", "iam:TagRole"
        ]
        Resource = "arn:aws:iam::*:role/${var.project_name}-*"
      },
      {
        Sid    = "SSMForStacks"
        Effect = "Allow"
        Action = ["ssm:PutParameter", "ssm:DeleteParameter", "ssm:GetParameter"]
        Resource = "arn:aws:ssm:${var.aws_region}:*:parameter${local.ssm_prefix}/*"
      }
    ]
  })
}

# =============================================================================
# 4. SSM Parameters
# =============================================================================
resource "aws_ssm_parameter" "customer_dynamodb_table" {
  name      = "${local.ssm_prefix}/dynamodb/customer-table"
  type      = "String"
  value     = module.customer_dynamodb.table_name
  overwrite = true
  tags      = local.common_tags
}

resource "aws_ssm_parameter" "customer_account_role_arn" {
  name      = "${local.ssm_prefix}/cross-account/customer-account-role-arn"
  type      = "String"
  value     = aws_iam_role.customer_account_access.arn
  overwrite = true
  tags      = local.common_tags
}

resource "aws_ssm_parameter" "cfn_execution_role_arn" {
  name      = "${local.ssm_prefix}/cloudformation/execution-role-arn"
  type      = "String"
  value     = aws_iam_role.cloudformation_execution.arn
  overwrite = true
  tags      = local.common_tags
}
