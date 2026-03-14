# =============================================================================
# GitHub OIDC — IAM Role for GitHub Actions CI/CD
# =============================================================================
# Provisions:
#   - GitHub OIDC Identity Provider (if not already present)
#   - IAM Role with trust policy scoped to the repository
#   - IAM Policies split to stay under the 10 KB aggregate inline-policy limit
# =============================================================================

terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

# -----------------------------------------------------------------------------
# Data Sources
# -----------------------------------------------------------------------------
data "aws_caller_identity" "current" {}
data "aws_region" "current" {}
data "aws_partition" "current" {}

# -----------------------------------------------------------------------------
# GitHub OIDC Provider (created once per AWS account)
# -----------------------------------------------------------------------------
resource "aws_iam_openid_connect_provider" "github" {
  count = var.create_oidc_provider ? 1 : 0

  url             = "https://token.actions.githubusercontent.com"
  client_id_list  = ["sts.amazonaws.com"]
  thumbprint_list = [
    "6938fd4d98bab03faadb97b34396831e3780aea1",
    "1c58a3a8518e8759bf075b76b750d4f2df264fcd",
    "1b511abead59c6ce207077c0bf0e0043b1382612",
  ]

  tags = merge(var.tags, { Name = "github-actions-oidc" })
}

locals {
  account_id             = data.aws_caller_identity.current.account_id
  region                 = data.aws_region.current.name
  partition              = data.aws_partition.current.partition
  existing_oidc_provider = "arn:${local.partition}:iam::${local.account_id}:oidc-provider/token.actions.githubusercontent.com"
  oidc_provider_arn      = var.create_oidc_provider ? aws_iam_openid_connect_provider.github[0].arn : local.existing_oidc_provider
  name_prefix            = "${var.project_name}-gh-platform-admin"

  github_repo_parts      = split("/", trimspace(var.github_repo))
  github_repo_has_owner  = length(local.github_repo_parts) > 1
  github_org_normalized  = local.github_repo_has_owner ? local.github_repo_parts[0] : trimspace(var.github_org)
  github_repo_normalized = local.github_repo_has_owner ? local.github_repo_parts[length(local.github_repo_parts) - 1] : trimspace(var.github_repo)
  github_repo_full       = "${local.github_org_normalized}/${local.github_repo_normalized}"
  github_sub_claims = distinct(compact([
    "repo:${local.github_repo_full}:*",
    local.github_repo_has_owner ? "repo:${trimspace(var.github_repo)}:*" : null,
  ]))
}

# -----------------------------------------------------------------------------
# IAM Role (assumed by GitHub Actions via OIDC)
# -----------------------------------------------------------------------------
resource "aws_iam_role" "github_actions" {
  name = local.name_prefix
  path = "/"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Federated = local.oidc_provider_arn }
      Action    = "sts:AssumeRoleWithWebIdentity"
      Condition = {
        StringEquals = { "token.actions.githubusercontent.com:aud" = "sts.amazonaws.com" }
        StringLike   = { "token.actions.githubusercontent.com:sub" = local.github_sub_claims }
      }
    }]
  })

  lifecycle {
    ignore_changes = [description, assume_role_policy]
  }

  tags = merge(var.tags, { Name = local.name_prefix })
}

# =============================================================================
# INLINE POLICIES  (aggregate must stay < 10 240 bytes)
# Strategy: 3 policies, wildcards where safe, no duplicate actions
# =============================================================================

# -----------------------------------------------------------------------------
# Policy 1 – Terraform state + IAM + STS + SES + Route53
# -----------------------------------------------------------------------------
resource "aws_iam_role_policy" "core" {
  name = "${local.name_prefix}-core"
  role = aws_iam_role.github_actions.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid      = "TfState"
        Effect   = "Allow"
        Action   = ["s3:GetObject", "s3:PutObject", "s3:DeleteObject", "s3:ListBucket"]
        Resource = [
          "arn:${local.partition}:s3:::${var.tf_state_bucket}",
          "arn:${local.partition}:s3:::${var.tf_state_bucket}/*",
        ]
      },
      {
        Sid      = "TfLock"
        Effect   = "Allow"
        Action   = ["dynamodb:GetItem", "dynamodb:PutItem", "dynamodb:DeleteItem"]
        Resource = "arn:${local.partition}:dynamodb:${local.region}:${local.account_id}:table/${var.tf_lock_table}"
      },
      {
        Sid      = "IAM"
        Effect   = "Allow"
        Action   = ["iam:*Role*", "iam:*Policy*", "iam:PassRole", "iam:*OpenIDConnectProvider*"]
        Resource = "*"
      },
      {
        Sid      = "STS"
        Effect   = "Allow"
        Action   = ["sts:GetCallerIdentity"]
        Resource = "*"
      },
      {
        Sid      = "SES"
        Effect   = "Allow"
        Action   = [
          "ses:GetAccount", "ses:GetSendQuota", "ses:GetIdentityVerificationAttributes",
          "ses:VerifyEmailIdentity", "ses:GetEmailIdentity", "ses:CreateEmailIdentity",
          "ses:DeleteEmailIdentity", "ses:PutAccountDetails",
          "ses:PutEmailIdentityDkimSigningAttributes",
        ]
        Resource = "*"
      },
      {
        Sid      = "Route53"
        Effect   = "Allow"
        Action   = [
          "route53:ListHostedZones", "route53:ListHostedZonesByName",
          "route53:GetHostedZone", "route53:ChangeResourceRecordSets",
          "route53:GetChange",
        ]
        Resource = "*"
      },
    ]
  })
}

# -----------------------------------------------------------------------------
# Policy 2 – Compute: Lambda, API GW, Cognito, Step Functions
# -----------------------------------------------------------------------------
resource "aws_iam_role_policy" "compute" {
  name = "${local.name_prefix}-compute"
  role = aws_iam_role.github_actions.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid      = "Lambda"
        Effect   = "Allow"
        Action   = ["lambda:*"]
        Resource = "arn:${local.partition}:lambda:${local.region}:${local.account_id}:function:${var.project_name}-*"
      },
      {
        Sid      = "LambdaRead"
        Effect   = "Allow"
        Action   = ["lambda:GetFunction", "lambda:GetFunctionConfiguration"]
        Resource = "*"
      },
      {
        Sid      = "APIGW"
        Effect   = "Allow"
        Action   = ["apigateway:*"]
        Resource = "*"
      },
      {
        Sid      = "Cognito"
        Effect   = "Allow"
        Action   = ["cognito-idp:*"]
        Resource = "*"
      },
      {
        Sid      = "StepFn"
        Effect   = "Allow"
        Action   = ["states:*StateMachine*", "states:TagResource", "states:UntagResource", "states:ListTagsForResource"]
        Resource = "arn:${local.partition}:states:${local.region}:${local.account_id}:stateMachine:${var.project_name}-*"
      },
    ]
  })
}

# -----------------------------------------------------------------------------
# Policy 3 – Data + Hosting: DynamoDB, SSM, Logs, SNS, S3, CloudFront, VPC
# -----------------------------------------------------------------------------
resource "aws_iam_role_policy" "data_hosting" {
  name = "${local.name_prefix}-data-hosting"
  role = aws_iam_role.github_actions.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid      = "DDB"
        Effect   = "Allow"
        Action   = ["dynamodb:*Table*", "dynamodb:ListTagsOfResource", "dynamodb:TagResource", "dynamodb:UntagResource", "dynamodb:*TimeToLive*", "dynamodb:*ContinuousBackups*"]
        Resource = "arn:${local.partition}:dynamodb:${local.region}:${local.account_id}:table/${var.project_name}-*"
      },
      {
        Sid      = "SSM"
        Effect   = "Allow"
        Action   = ["ssm:*Parameter*", "ssm:AddTagsToResource", "ssm:RemoveTagsFromResource", "ssm:ListTagsForResource"]
        Resource = [
          "arn:${local.partition}:ssm:${local.region}:${local.account_id}:parameter/${var.project_name}/*",
          "arn:${local.partition}:ssm:${local.region}:${local.account_id}:parameter/${var.project_name}",
        ]
      },
      {
        Sid      = "SSMDesc"
        Effect   = "Allow"
        Action   = ["ssm:DescribeParameters"]
        Resource = "*"
      },
      {
        Sid      = "Logs"
        Effect   = "Allow"
        Action   = ["logs:*"]
        Resource = "*"
      },
      {
        Sid      = "SNS"
        Effect   = "Allow"
        Action   = ["sns:*"]
        Resource = "arn:${local.partition}:sns:${local.region}:${local.account_id}:${var.project_name}-*"
      },
      {
        Sid      = "CWAlarms"
        Effect   = "Allow"
        Action   = ["cloudwatch:PutMetricAlarm", "cloudwatch:DeleteAlarms", "cloudwatch:DescribeAlarms", "cloudwatch:ListTagsForResource", "cloudwatch:TagResource"]
        Resource = "*"
      },
      {
        Sid      = "S3Host"
        Effect   = "Allow"
        Action   = ["s3:*"]
        Resource = ["arn:${local.partition}:s3:::${var.project_name}-*"]
      },
      {
        Sid      = "CF"
        Effect   = "Allow"
        Action   = ["cloudfront:*"]
        Resource = "*"
      },
      {
        Sid      = "VPC"
        Effect   = "Allow"
        Action   = [
          "ec2:*Vpc*", "ec2:*Subnet*", "ec2:*InternetGateway*", "ec2:*NatGateway*",
          "ec2:*Address*", "ec2:*RouteTable*", "ec2:*Route", "ec2:*SecurityGroup*",
          "ec2:*VpcEndpoint*", "ec2:DescribeAvailabilityZones",
          "ec2:DescribeNetworkInterfaces", "ec2:*Tags", "ec2:DescribePrefixLists",
        ]
        Resource = "*"
      },
    ]
  })
}

# -----------------------------------------------------------------------------
# Policy 4 (conditional) – Cross-Account STS AssumeRole
# -----------------------------------------------------------------------------
resource "aws_iam_role_policy" "cross_account" {
  count = var.data_plane_role_arn != "" ? 1 : 0
  name  = "${local.name_prefix}-cross-account"
  role  = aws_iam_role.github_actions.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Sid      = "AssumeDataPlane"
      Effect   = "Allow"
      Action   = "sts:AssumeRole"
      Resource = var.data_plane_role_arn
    }]
  })
}

# -----------------------------------------------------------------------------
# Outputs
# -----------------------------------------------------------------------------
output "role_arn" {
  description = "ARN of the GitHub Actions IAM role"
  value       = aws_iam_role.github_actions.arn
}

output "role_name" {
  description = "Name of the GitHub Actions IAM role"
  value       = aws_iam_role.github_actions.name
}

output "oidc_provider_arn" {
  description = "ARN of the GitHub OIDC provider"
  value       = local.oidc_provider_arn
}
