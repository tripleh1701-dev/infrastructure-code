# =============================================================================
# GitHub OIDC — IAM Role for GitHub Actions CI/CD
# =============================================================================
# Provisions:
#   - GitHub OIDC Identity Provider (if not already present)
#   - IAM Role with trust policy scoped to the repository
#   - IAM Policies for: Terraform, Lambda deploy, SES bootstrap, S3/CloudFront,
#     DynamoDB state, SSM, CloudWatch, Cognito read, Route53 DKIM
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

# NOTE:
# This module must not use `data "aws_iam_openid_connect_provider"` lookups,
# because that requires iam:ListOpenIDConnectProviders (often denied to CI roles).
# For existing provider usage, derive the ARN deterministically from account/partition.

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

  tags = merge(var.tags, {
    Name = "github-actions-oidc"
  })
}

locals {
  account_id             = data.aws_caller_identity.current.account_id
  region                 = data.aws_region.current.name
  partition              = data.aws_partition.current.partition
  existing_oidc_provider = "arn:${local.partition}:iam::${local.account_id}:oidc-provider/token.actions.githubusercontent.com"
  oidc_provider_arn      = var.create_oidc_provider ? aws_iam_openid_connect_provider.github[0].arn : local.existing_oidc_provider
  name_prefix            = "${var.project_name}-gh-platform-admin"

  # Accept either "repo" or "owner/repo" inputs to avoid trust-policy drift.
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
    Statement = [
      {
        Effect = "Allow"
        Principal = {
          Federated = local.oidc_provider_arn
        }
        Action = "sts:AssumeRoleWithWebIdentity"
        Condition = {
          StringEquals = {
            "token.actions.githubusercontent.com:aud" = "sts.amazonaws.com"
          }
          StringLike = {
            "token.actions.githubusercontent.com:sub" = local.github_sub_claims
          }
        }
      },
    ]
  })

  # NOTE: lifecycle.ignore_changes must be a static list expression in Terraform.
  # Keep assume_role_policy ignored in CI to prevent self-mutation 403s when the
  # currently assumed role does not have iam:UpdateAssumeRolePolicy.
  lifecycle {
    ignore_changes = [
      description,
      assume_role_policy,
    ]
  }

  tags = merge(var.tags, {
    Name = local.name_prefix
  })
}

# -----------------------------------------------------------------------------
# Policy 1: Terraform State + IAM Management
# -----------------------------------------------------------------------------
resource "aws_iam_role_policy" "terraform_and_iam" {
  name = "${local.name_prefix}-terraform-iam"
  role = aws_iam_role.github_actions.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "TerraformState"
        Effect = "Allow"
        Action = [
          "s3:GetObject",
          "s3:PutObject",
          "s3:DeleteObject",
          "s3:ListBucket",
        ]
        Resource = [
          "arn:${local.partition}:s3:::${var.tf_state_bucket}",
          "arn:${local.partition}:s3:::${var.tf_state_bucket}/*",
        ]
      },
      {
        Sid    = "TerraformLock"
        Effect = "Allow"
        Action = [
          "dynamodb:GetItem",
          "dynamodb:PutItem",
          "dynamodb:DeleteItem",
        ]
        Resource = "arn:${local.partition}:dynamodb:${local.region}:${local.account_id}:table/${var.tf_lock_table}"
      },
      {
        Sid    = "IAMManagement"
        Effect = "Allow"
        Action = [
          "iam:CreateRole",
          "iam:DeleteRole",
          "iam:GetRole",
          "iam:UpdateRole",
          "iam:UpdateRoleDescription",
          "iam:UpdateAssumeRolePolicy",
          "iam:PassRole",
          "iam:TagRole",
          "iam:UntagRole",
          "iam:ListRoleTags",
          "iam:ListRolePolicies",
          "iam:ListAttachedRolePolicies",
          "iam:AttachRolePolicy",
          "iam:DetachRolePolicy",
          "iam:PutRolePolicy",
          "iam:GetRolePolicy",
          "iam:DeleteRolePolicy",
          "iam:ListInstanceProfilesForRole",
          "iam:CreatePolicy",
          "iam:DeletePolicy",
          "iam:GetPolicy",
          "iam:GetPolicyVersion",
          "iam:ListPolicyVersions",
          "iam:CreatePolicyVersion",
          "iam:DeletePolicyVersion",
          "iam:CreateOpenIDConnectProvider",
          "iam:GetOpenIDConnectProvider",
          "iam:DeleteOpenIDConnectProvider",
          "iam:TagOpenIDConnectProvider",
          "iam:UpdateOpenIDConnectProviderThumbprint",
        ]
        Resource = "*"
      },
      {
        Sid    = "STSCallerIdentity"
        Effect = "Allow"
        Action = ["sts:GetCallerIdentity"]
        Resource = "*"
      },
    ]
  })
}

# -----------------------------------------------------------------------------
# Policy 2: Compute + Networking (Lambda, API GW, VPC, Step Functions, Cognito)
# -----------------------------------------------------------------------------
resource "aws_iam_role_policy" "compute_networking" {
  name = "${local.name_prefix}-compute-networking"
  role = aws_iam_role.github_actions.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "LambdaManagement"
        Effect = "Allow"
        Action = [
          "lambda:CreateFunction",
          "lambda:DeleteFunction",
          "lambda:GetFunction",
          "lambda:GetFunctionConfiguration",
          "lambda:UpdateFunctionCode",
          "lambda:UpdateFunctionConfiguration",
          "lambda:PublishVersion",
          "lambda:CreateAlias",
          "lambda:UpdateAlias",
          "lambda:DeleteAlias",
          "lambda:GetAlias",
          "lambda:ListVersionsByFunction",
          "lambda:ListAliases",
          "lambda:AddPermission",
          "lambda:RemovePermission",
          "lambda:GetPolicy",
          "lambda:InvokeFunction",
          "lambda:TagResource",
          "lambda:UntagResource",
          "lambda:ListTags",
          "lambda:PutFunctionEventInvokeConfig",
        ]
        Resource = "arn:${local.partition}:lambda:${local.region}:${local.account_id}:function:${var.project_name}-*"
      },
      {
        Sid    = "LambdaWaiters"
        Effect = "Allow"
        Action = [
          "lambda:GetFunction",
          "lambda:GetFunctionConfiguration",
        ]
        Resource = "*"
      },
      {
        Sid    = "APIGateway"
        Effect = "Allow"
        Action = [
          "apigateway:GET",
          "apigateway:POST",
          "apigateway:PUT",
          "apigateway:PATCH",
          "apigateway:DELETE",
          "apigateway:TagResource",
        ]
        Resource = "*"
      },
      {
        Sid    = "CognitoManagement"
        Effect = "Allow"
        Action = [
          "cognito-idp:CreateUserPool",
          "cognito-idp:DeleteUserPool",
          "cognito-idp:DescribeUserPool",
          "cognito-idp:UpdateUserPool",
          "cognito-idp:ListUserPoolClients",
          "cognito-idp:CreateUserPoolClient",
          "cognito-idp:DeleteUserPoolClient",
          "cognito-idp:DescribeUserPoolClient",
          "cognito-idp:UpdateUserPoolClient",
          "cognito-idp:CreateUserPoolDomain",
          "cognito-idp:DeleteUserPoolDomain",
          "cognito-idp:DescribeUserPoolDomain",
          "cognito-idp:CreateGroup",
          "cognito-idp:GetGroup",
          "cognito-idp:ListGroups",
          "cognito-idp:TagResource",
          "cognito-idp:ListTagsForResource",
          "cognito-idp:AdminCreateUser",
          "cognito-idp:AdminGetUser",
          "cognito-idp:AdminInitiateAuth",
          "cognito-idp:AdminSetUserPassword",
        ]
        Resource = "*"
      },
      {
        Sid    = "VPCManagement"
        Effect = "Allow"
        Action = [
          "ec2:CreateVpc",
          "ec2:DeleteVpc",
          "ec2:DescribeVpcs",
          "ec2:ModifyVpcAttribute",
          "ec2:CreateSubnet",
          "ec2:DeleteSubnet",
          "ec2:DescribeSubnets",
          "ec2:CreateInternetGateway",
          "ec2:DeleteInternetGateway",
          "ec2:AttachInternetGateway",
          "ec2:DetachInternetGateway",
          "ec2:DescribeInternetGateways",
          "ec2:CreateNatGateway",
          "ec2:DeleteNatGateway",
          "ec2:DescribeNatGateways",
          "ec2:AllocateAddress",
          "ec2:ReleaseAddress",
          "ec2:DescribeAddresses",
          "ec2:CreateRouteTable",
          "ec2:DeleteRouteTable",
          "ec2:DescribeRouteTables",
          "ec2:CreateRoute",
          "ec2:DeleteRoute",
          "ec2:AssociateRouteTable",
          "ec2:DisassociateRouteTable",
          "ec2:CreateSecurityGroup",
          "ec2:DeleteSecurityGroup",
          "ec2:DescribeSecurityGroups",
          "ec2:AuthorizeSecurityGroupIngress",
          "ec2:AuthorizeSecurityGroupEgress",
          "ec2:RevokeSecurityGroupIngress",
          "ec2:RevokeSecurityGroupEgress",
          "ec2:CreateVpcEndpoint",
          "ec2:DeleteVpcEndpoints",
          "ec2:DescribeVpcEndpoints",
          "ec2:ModifyVpcEndpoint",
          "ec2:DescribeAvailabilityZones",
          "ec2:DescribeNetworkInterfaces",
          "ec2:CreateTags",
          "ec2:DeleteTags",
          "ec2:DescribeTags",
          "ec2:DescribePrefixLists",
        ]
        Resource = "*"
      },
      {
        Sid    = "StepFunctions"
        Effect = "Allow"
        Action = [
          "states:CreateStateMachine",
          "states:DeleteStateMachine",
          "states:DescribeStateMachine",
          "states:UpdateStateMachine",
          "states:TagResource",
          "states:UntagResource",
          "states:ListTagsForResource",
        ]
        Resource = "arn:${local.partition}:states:${local.region}:${local.account_id}:stateMachine:${var.project_name}-*"
      },
    ]
  })
}

# -----------------------------------------------------------------------------
# Policy 3: Observability + Data (SSM, CloudWatch, SNS, DynamoDB)
# -----------------------------------------------------------------------------
resource "aws_iam_role_policy" "observability_data" {
  name = "${local.name_prefix}-observability-data"
  role = aws_iam_role.github_actions.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "DynamoDBManagement"
        Effect = "Allow"
        Action = [
          "dynamodb:CreateTable",
          "dynamodb:DeleteTable",
          "dynamodb:DescribeTable",
          "dynamodb:DescribeContinuousBackups",
          "dynamodb:UpdateContinuousBackups",
          "dynamodb:UpdateTable",
          "dynamodb:ListTagsOfResource",
          "dynamodb:TagResource",
          "dynamodb:UntagResource",
          "dynamodb:DescribeTimeToLive",
          "dynamodb:UpdateTimeToLive",
        ]
        Resource = "arn:${local.partition}:dynamodb:${local.region}:${local.account_id}:table/${var.project_name}-*"
      },
      {
        Sid    = "SSMParameters"
        Effect = "Allow"
        Action = [
          "ssm:GetParameter",
          "ssm:GetParameters",
          "ssm:PutParameter",
          "ssm:DeleteParameter",
          "ssm:DescribeParameters",
          "ssm:AddTagsToResource",
          "ssm:RemoveTagsFromResource",
          "ssm:ListTagsForResource",
          "ssm:GetParametersByPath",
        ]
        Resource = [
          "arn:${local.partition}:ssm:${local.region}:${local.account_id}:parameter/${var.project_name}/*",
          "arn:${local.partition}:ssm:${local.region}:${local.account_id}:parameter/${var.project_name}",
        ]
      },
      {
        Sid    = "SSMDescribe"
        Effect = "Allow"
        Action = ["ssm:DescribeParameters"]
        Resource = "*"
      },
      {
        Sid    = "CloudWatchLogs"
        Effect = "Allow"
        Action = [
          "logs:CreateLogGroup",
          "logs:DeleteLogGroup",
          "logs:DescribeLogGroups",
          "logs:PutRetentionPolicy",
          "logs:DeleteRetentionPolicy",
          "logs:TagResource",
          "logs:UntagResource",
          "logs:ListTagsForResource",
          "logs:ListTagsLogGroup",
        ]
        Resource = "*"
      },
      {
        Sid    = "SNS"
        Effect = "Allow"
        Action = [
          "sns:CreateTopic",
          "sns:DeleteTopic",
          "sns:GetTopicAttributes",
          "sns:SetTopicAttributes",
          "sns:Subscribe",
          "sns:Unsubscribe",
          "sns:ListSubscriptionsByTopic",
          "sns:TagResource",
          "sns:UntagResource",
          "sns:ListTagsForResource",
          "sns:GetSubscriptionAttributes",
        ]
        Resource = "arn:${local.partition}:sns:${local.region}:${local.account_id}:${var.project_name}-*"
      },
      {
        Sid    = "CloudWatchAlarms"
        Effect = "Allow"
        Action = [
          "cloudwatch:PutMetricAlarm",
          "cloudwatch:DeleteAlarms",
          "cloudwatch:DescribeAlarms",
          "cloudwatch:ListTagsForResource",
          "cloudwatch:TagResource",
        ]
        Resource = "*"
      },
    ]
  })
}

# -----------------------------------------------------------------------------
# Policy: S3 + CloudFront (Frontend Hosting)
# -----------------------------------------------------------------------------
resource "aws_iam_role_policy" "frontend_hosting" {
  name = "${local.name_prefix}-frontend-hosting"
  role = aws_iam_role.github_actions.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "S3Frontend"
        Effect = "Allow"
        Action = [
          "s3:CreateBucket",
          "s3:DeleteBucket",
          "s3:GetBucketPolicy",
          "s3:PutBucketPolicy",
          "s3:DeleteBucketPolicy",
          "s3:GetBucketAcl",
          "s3:PutBucketAcl",
          "s3:GetBucketCORS",
          "s3:PutBucketCORS",
          "s3:GetBucketWebsite",
          "s3:PutBucketWebsite",
          "s3:DeleteBucketWebsite",
          "s3:GetBucketVersioning",
          "s3:PutBucketVersioning",
          "s3:GetBucketPublicAccessBlock",
          "s3:PutBucketPublicAccessBlock",
          "s3:GetEncryptionConfiguration",
          "s3:PutEncryptionConfiguration",
          "s3:GetBucketLocation",
          "s3:ListBucket",
          "s3:GetObject",
          "s3:PutObject",
          "s3:DeleteObject",
          "s3:GetBucketTagging",
          "s3:PutBucketTagging",
          "s3:GetLifecycleConfiguration",
          "s3:PutLifecycleConfiguration",
          "s3:GetBucketOwnershipControls",
          "s3:PutBucketOwnershipControls",
          "s3:GetAccelerateConfiguration",
          "s3:GetBucketRequestPayment",
          "s3:GetBucketLogging",
          "s3:GetReplicationConfiguration",
          "s3:GetBucketObjectLockConfiguration",
        ]
        Resource = [
          "arn:${local.partition}:s3:::${var.project_name}-*",
        ]
      },
      {
        Sid    = "CloudFront"
        Effect = "Allow"
        Action = [
          "cloudfront:CreateDistribution",
          "cloudfront:DeleteDistribution",
          "cloudfront:GetDistribution",
          "cloudfront:UpdateDistribution",
          "cloudfront:TagResource",
          "cloudfront:UntagResource",
          "cloudfront:ListTagsForResource",
          "cloudfront:CreateInvalidation",
          "cloudfront:GetInvalidation",
          "cloudfront:CreateOriginAccessControl",
          "cloudfront:DeleteOriginAccessControl",
          "cloudfront:GetOriginAccessControl",
          "cloudfront:UpdateOriginAccessControl",
          "cloudfront:ListOriginAccessControls",
          "cloudfront:CreateCloudFrontOriginAccessIdentity",
          "cloudfront:DeleteCloudFrontOriginAccessIdentity",
          "cloudfront:GetCloudFrontOriginAccessIdentity",
          "cloudfront:ListCloudFrontOriginAccessIdentities",
          "cloudfront:CreateResponseHeadersPolicy",
          "cloudfront:DeleteResponseHeadersPolicy",
          "cloudfront:GetResponseHeadersPolicy",
          "cloudfront:UpdateResponseHeadersPolicy",
        ]
        Resource = "*"
      },
    ]
  })
}

# -----------------------------------------------------------------------------
# Policy: SES Bootstrap (identity management, DKIM, production access)
# -----------------------------------------------------------------------------
resource "aws_iam_role_policy" "ses_bootstrap" {
  name = "${local.name_prefix}-ses-bootstrap"
  role = aws_iam_role.github_actions.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "SESv1"
        Effect = "Allow"
        Action = [
          "ses:GetAccount",
          "ses:GetSendQuota",
          "ses:GetIdentityVerificationAttributes",
          "ses:VerifyEmailIdentity",
        ]
        Resource = "*"
      },
      {
        Sid    = "SESv2"
        Effect = "Allow"
        Action = [
          "sesv2:GetAccount",
          "sesv2:GetEmailIdentity",
          "sesv2:CreateEmailIdentity",
          "sesv2:DeleteEmailIdentity",
          "sesv2:PutAccountDetails",
          "sesv2:PutEmailIdentityDkimSigningAttributes",
          "sesv2:GetSendQuota",
        ]
        Resource = "*"
      },
      {
        Sid    = "Route53DKIM"
        Effect = "Allow"
        Action = [
          "route53:ListHostedZones",
          "route53:ListHostedZonesByName",
          "route53:GetHostedZone",
          "route53:ChangeResourceRecordSets",
          "route53:GetChange",
        ]
        Resource = "*"
      },
    ]
  })
}

# -----------------------------------------------------------------------------
# Policy: Cross-Account Access (STS AssumeRole for data-plane)
# -----------------------------------------------------------------------------
resource "aws_iam_role_policy" "cross_account" {
  count = var.data_plane_role_arn != "" ? 1 : 0
  name  = "${local.name_prefix}-cross-account"
  role  = aws_iam_role.github_actions.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "AssumeDataPlane"
        Effect = "Allow"
        Action = "sts:AssumeRole"
        Resource = var.data_plane_role_arn
      },
    ]
  })
}
