# =============================================================================
# Platform Admin Account — Full Resource Provisioning
# =============================================================================
# Provisions:
#   - VPC + VPC Endpoints (DynamoDB, S3, SSM, STS, Cognito, Lambda, SFN, Logs)
#   - Cognito User Pool (optional)
#   - Account Registry DynamoDB Table
#   - Control-Plane Config DynamoDB Table
#   - Admin Backend Lambda (NestJS API)
#   - Admin Portal Lambda (Frontend serving, optional)
#   - Worker Lambdas: create-infra, delete-infra, poll-infra, setup-rbac, create-admin
#   - Step Functions (create-account, delete-account orchestration)
#   - API Gateway + JWT Authorizer
#   - Frontend S3 + CloudFront (optional)
#   - Monitoring (8 alarms + SNS)
#   - SSM Parameter Store outputs
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

  default_tags {
    tags = {
      Project     = var.project_name
      Environment = var.environment
      ManagedBy   = "terraform"
      Plane       = "platform-admin"
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
# 1. VPC + VPC Endpoints
# =============================================================================
module "vpc" {
  source = "../../modules/vpc"

  name_prefix        = local.name_prefix
  vpc_cidr           = var.vpc_cidr
  az_count           = var.vpc_az_count
  enable_nat_gateway = var.enable_nat_gateway
  tags               = local.common_tags
}

# =============================================================================
# 2a. Post-Confirmation Worker Lambda (must be created before Cognito)
# =============================================================================
# This Lambda is triggered by Cognito after user email confirmation.
# It auto-provisions new signups in DynamoDB with default account/enterprise.
# NOTE: Cognito IAM permissions are added AFTER the Cognito module (see 2c).
module "post_confirmation_worker" {
  source = "../../modules/worker-lambda"

  function_name             = "${local.name_prefix}-post-confirmation"
  description               = "Cognito Post-Confirmation: provisions new users in default account"
  handler                   = "dist/workers/post-confirmation.handler.handler"
  timeout                   = 30
  memory_size               = 256
  package_path              = var.lambda_package_path
  dynamodb_table_arn        = module.control_plane_dynamodb.table_arn
  enable_dynamodb           = true
  enable_cognito            = false  # Added separately below to break circular dep
  enable_cloudwatch_metrics = true
  vpc_subnet_ids            = module.vpc.private_subnet_ids
  vpc_security_group_ids    = [module.vpc.lambda_security_group_id]

  environment_variables = {
    NODE_ENV                 = var.environment
    CONTROL_PLANE_TABLE_NAME = module.control_plane_dynamodb.table_name
    DEFAULT_ACCOUNT_ID       = "a0000000-0000-0000-0000-000000000001"
    DEFAULT_ENTERPRISE_ID    = "00000000-0000-0000-0000-000000000001"
  }

  tags = local.common_tags
}

# =============================================================================
# 2b. Authentication (Cognito) — with post-confirmation trigger
# =============================================================================
module "cognito" {
  source = "../../modules/cognito"

  project_name                    = var.project_name
  environment                     = var.environment
  enable_mfa                      = var.enable_mfa
  enable_advanced_security        = var.enable_advanced_security
  callback_urls                   = var.cognito_callback_urls
  logout_urls                     = var.cognito_logout_urls
  post_confirmation_lambda_arn    = module.post_confirmation_worker.function_arn
  tags                            = local.common_tags
}

# =============================================================================
# 2c. Post-Confirmation: Cognito IAM + invoke permission (breaks circular dep)
# =============================================================================
resource "aws_lambda_permission" "cognito_post_confirmation" {
  statement_id  = "AllowCognitoInvoke"
  action        = "lambda:InvokeFunction"
  function_name = module.post_confirmation_worker.function_name
  principal     = "cognito-idp.amazonaws.com"
  source_arn    = module.cognito.user_pool_arn
}

resource "aws_iam_role_policy" "post_confirmation_cognito" {
  name = "${local.name_prefix}-post-confirmation-cognito"
  role = "${local.name_prefix}-post-confirmation-role"

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect = "Allow"
      Action = [
        "cognito-idp:AdminUpdateUserAttributes",
        "cognito-idp:AdminAddUserToGroup",
      ]
      Resource = module.cognito.user_pool_arn
    }]
  })
}

# =============================================================================
# 3. DynamoDB Tables
# =============================================================================

# Control-Plane Config Table (platform settings, enterprises, products, services)
module "control_plane_dynamodb" {
  source = "../../modules/dynamodb"

  table_name  = "${local.name_prefix}-control-plane"
  enable_pitr = true
  tags        = local.common_tags
}

# Account Registry Table (tracks all customer accounts + provisioning state)
module "account_registry_dynamodb" {
  source = "../../modules/dynamodb"

  table_name  = "${local.name_prefix}-account-registry"
  enable_pitr = true
  tags        = local.common_tags
}

# =============================================================================
# 4. Admin Backend Lambda (NestJS API)
# =============================================================================
module "lambda" {
  source = "../../modules/lambda"

  function_name               = "${local.name_prefix}-backend"
  description                 = "NestJS Backend API — Platform Admin"
  project_name                = var.project_name
  environment                 = var.environment
  runtime                     = var.lambda_runtime
  memory_size                 = var.lambda_memory_size
  timeout                     = var.lambda_timeout
  package_path                = var.lambda_package_path
  control_plane_dynamodb_arn  = module.control_plane_dynamodb.table_arn
  control_plane_dynamodb_name = module.control_plane_dynamodb.table_name
  data_plane_role_arn         = var.data_plane_role_arn
  data_plane_dynamodb_name    = var.data_plane_dynamodb_name
  data_plane_region           = var.data_plane_region != "" ? var.data_plane_region : var.aws_region
  cognito_user_pool_arn       = module.cognito.user_pool_arn
  enable_cognito              = true
  enable_sns_publish            = module.monitoring.provisioning_sns_topic_arn != ""
  sns_topic_arn                 = module.monitoring.provisioning_sns_topic_arn
  cfn_template_bucket_arn       = module.frontend.bucket_arn
  enable_cfn_template_bucket    = true
  enable_cloudformation         = true

  environment_variables = {
    COGNITO_USER_POOL_ID             = module.cognito.user_pool_id
    COGNITO_CLIENT_ID                = module.cognito.client_id
    COGNITO_DOMAIN                   = module.cognito.domain
    ACCOUNT_REGISTRY_TABLE_NAME      = module.account_registry_dynamodb.table_name
    CREATE_ACCOUNT_SFN_ARN           = module.step_functions.create_account_state_machine_arn
    DELETE_ACCOUNT_SFN_ARN           = module.step_functions.delete_account_state_machine_arn
    CORS_ALLOWED_ORIGINS             = "https://${module.frontend.cloudfront_domain_name},http://localhost:5173,http://localhost:3000"
    CREDENTIAL_NOTIFICATION_ENABLED  = var.credential_notification_enabled ? "true" : "false"
    SES_SENDER_EMAIL                 = var.ses_sender_email
    PLATFORM_LOGIN_URL               = var.platform_login_url != "" ? var.platform_login_url : "https://${module.frontend.cloudfront_domain_name}/login"
    PLATFORM_NAME                    = var.platform_name
    PLATFORM_SUPPORT_EMAIL           = var.platform_support_email
    SNS_PROVISIONING_TOPIC_ARN       = module.monitoring.provisioning_sns_topic_arn
    CFN_TEMPLATE_BUCKET              = module.frontend.bucket_name
  }

  account_registry_dynamodb_arn = module.account_registry_dynamodb.table_arn
  enable_account_registry       = true
  enable_ses                    = true
  step_functions_arns = [
    module.step_functions.create_account_state_machine_arn,
    module.step_functions.delete_account_state_machine_arn,
  ]

  tags = local.common_tags
}

# =============================================================================
# 5. Worker Lambdas
# =============================================================================

# --- create-infra-worker ---
# Creates DynamoDB item (public tier) or CloudFormation stack (private tier)
module "create_infra_worker" {
  source = "../../modules/worker-lambda"

  function_name             = "${local.name_prefix}-create-infra-worker"
  description               = "Creates account infrastructure (DynamoDB item or CloudFormation stack)"
  handler                   = "dist/workers/dynamodb-provisioner.handler.handler"
  timeout                   = 300
  memory_size               = 256
  package_path              = var.lambda_package_path
  dynamodb_table_arn        = module.account_registry_dynamodb.table_arn
  enable_dynamodb           = true
  customer_account_role_arn = var.data_plane_role_arn
  enable_cloudformation     = true
  ssm_prefix                = "${var.project_name}/${var.environment}"
  vpc_subnet_ids            = module.vpc.private_subnet_ids
  vpc_security_group_ids    = [module.vpc.lambda_security_group_id]

  environment_variables = {
    NODE_ENV                    = var.environment
    ACCOUNT_REGISTRY_TABLE_NAME = module.account_registry_dynamodb.table_name
    CONTROL_PLANE_TABLE_NAME    = module.control_plane_dynamodb.table_name
    DATA_PLANE_ROLE_ARN         = var.data_plane_role_arn
    DATA_PLANE_TABLE_NAME       = var.data_plane_dynamodb_name
    DATA_PLANE_REGION           = var.data_plane_region != "" ? var.data_plane_region : var.aws_region
    SSM_PREFIX                  = local.ssm_prefix
    CFN_TEMPLATE_BUCKET         = module.frontend.bucket_name
  }

  tags = local.common_tags
}

# --- delete-infra-worker ---
# Deletes DynamoDB item (public tier) or CloudFormation stack (private tier)
module "delete_infra_worker" {
  source = "../../modules/worker-lambda"

  function_name             = "${local.name_prefix}-delete-infra-worker"
  description               = "Deletes account infrastructure"
  handler                   = "dist/workers/delete-infra.handler.handler"
  timeout                   = 300
  memory_size               = 256
  package_path              = var.lambda_package_path
  dynamodb_table_arn        = module.account_registry_dynamodb.table_arn
  enable_dynamodb           = true
  customer_account_role_arn = var.data_plane_role_arn
  enable_cloudformation     = true
  ssm_prefix                = "${var.project_name}/${var.environment}"
  vpc_subnet_ids            = module.vpc.private_subnet_ids
  vpc_security_group_ids    = [module.vpc.lambda_security_group_id]

  environment_variables = {
    NODE_ENV                    = var.environment
    ACCOUNT_REGISTRY_TABLE_NAME = module.account_registry_dynamodb.table_name
    DATA_PLANE_ROLE_ARN         = var.data_plane_role_arn
    DATA_PLANE_TABLE_NAME       = var.data_plane_dynamodb_name
    DATA_PLANE_REGION           = var.data_plane_region != "" ? var.data_plane_region : var.aws_region
    SSM_PREFIX                  = local.ssm_prefix
  }

  tags = local.common_tags
}

# --- poll-infra-worker ---
# Polls CloudFormation stack status or DynamoDB item status
module "poll_infra_worker" {
  source = "../../modules/worker-lambda"

  function_name                  = "${local.name_prefix}-poll-infra-worker"
  description                    = "Polls account infrastructure provisioning status"
  handler                        = "dist/workers/poll-infra.handler.handler"
  timeout                        = 60
  memory_size                    = 128
  package_path                   = var.lambda_package_path
  dynamodb_table_arn             = module.account_registry_dynamodb.table_arn
  enable_dynamodb                = true
  customer_account_role_arn      = var.data_plane_role_arn
  enable_cloudformation          = true
  enable_step_functions_callback = true
  ssm_prefix                     = "${var.project_name}/${var.environment}"
  vpc_subnet_ids                 = module.vpc.private_subnet_ids
  vpc_security_group_ids         = [module.vpc.lambda_security_group_id]

  environment_variables = {
    NODE_ENV                    = var.environment
    ACCOUNT_REGISTRY_TABLE_NAME = module.account_registry_dynamodb.table_name
    DATA_PLANE_ROLE_ARN         = var.data_plane_role_arn
    DATA_PLANE_REGION           = var.data_plane_region != "" ? var.data_plane_region : var.aws_region
    SSM_PREFIX                  = local.ssm_prefix
  }

  tags = local.common_tags
}

# --- setup-rbac-worker ---
# Configures RBAC (groups, roles, permissions) for a new account
module "setup_rbac_worker" {
  source = "../../modules/worker-lambda"

  function_name          = "${local.name_prefix}-setup-rbac-worker"
  description            = "Sets up RBAC groups, roles, and permissions for new accounts"
  handler                = "dist/workers/setup-rbac.handler.handler"
  timeout                = 120
  memory_size            = 256
  package_path           = var.lambda_package_path
  dynamodb_table_arn     = module.control_plane_dynamodb.table_arn
  enable_dynamodb        = true
  ssm_prefix             = "${var.project_name}/${var.environment}"
  vpc_subnet_ids         = module.vpc.private_subnet_ids
  vpc_security_group_ids = [module.vpc.lambda_security_group_id]

  environment_variables = {
    NODE_ENV                 = var.environment
    CONTROL_PLANE_TABLE_NAME = module.control_plane_dynamodb.table_name
    COGNITO_USER_POOL_ID     = module.cognito.user_pool_id
    SSM_PREFIX               = local.ssm_prefix
  }

  tags = local.common_tags
}

# --- create-admin-worker ---
# Creates Cognito admin user + DynamoDB user record for new accounts
module "create_admin_worker" {
  source = "../../modules/worker-lambda"

  function_name          = "${local.name_prefix}-create-admin-worker"
  description            = "Creates admin user in Cognito + DynamoDB for new accounts"
  handler                = "dist/workers/create-admin.handler.handler"
  timeout                = 120
  memory_size            = 256
  package_path           = var.lambda_package_path
  dynamodb_table_arn     = module.control_plane_dynamodb.table_arn
  enable_dynamodb        = true
  cognito_user_pool_arn  = module.cognito.user_pool_arn
  enable_cognito         = true
  enable_ses             = var.credential_notification_enabled
  enable_cloudwatch_metrics = true
  ssm_prefix             = "${var.project_name}/${var.environment}"
  vpc_subnet_ids         = module.vpc.private_subnet_ids
  vpc_security_group_ids = [module.vpc.lambda_security_group_id]

  environment_variables = {
    NODE_ENV                         = var.environment
    CONTROL_PLANE_TABLE_NAME         = module.control_plane_dynamodb.table_name
    COGNITO_USER_POOL_ID             = module.cognito.user_pool_id
    COGNITO_CLIENT_ID                = module.cognito.client_id
    SSM_PREFIX                       = local.ssm_prefix
    CREDENTIAL_NOTIFICATION_ENABLED  = var.credential_notification_enabled ? "true" : "false"
    SES_SENDER_EMAIL                 = var.ses_sender_email
    PLATFORM_LOGIN_URL               = var.platform_login_url != "" ? var.platform_login_url : "https://${module.frontend.cloudfront_domain_name}/login"
    PLATFORM_NAME                    = var.platform_name
    PLATFORM_SUPPORT_EMAIL           = var.platform_support_email
  }

  tags = local.common_tags
}


# =============================================================================
# 5b. Pipeline Executor Lambda (Build Execution Engine)
# =============================================================================
module "pipeline_executor" {
  source = "../../modules/pipeline-executor"

  function_name       = "${local.name_prefix}-pipeline-executor"
  description         = "YAML-driven pipeline execution engine"
  memory_size         = 1024
  timeout             = 600 # 10 minutes
  log_retention_days  = 7   # Cost optimization
  package_path        = var.lambda_package_path
  dynamodb_table_arn  = module.control_plane_dynamodb.table_arn
  dynamodb_table_name = module.control_plane_dynamodb.table_name

  environment_variables = {
    NODE_ENV                 = var.environment
    COGNITO_USER_POOL_ID     = module.cognito.user_pool_id
    COGNITO_CLIENT_ID        = module.cognito.client_id
  }

  tags = local.common_tags
}

# =============================================================================
# 5c. Verify Provisioning Worker Lambda
# =============================================================================
module "verify_provisioning_worker" {
  source = "../../modules/worker-lambda"

  function_name          = "${local.name_prefix}-verify-provisioning-worker"
  description            = "Validates all provisioned resources are accessible and correctly configured"
  handler                = "dist/workers/provisioning-verifier.handler.handler"
  timeout                = 120
  memory_size            = 256
  package_path           = var.lambda_package_path
  dynamodb_table_arn     = module.control_plane_dynamodb.table_arn
  enable_dynamodb        = true
  enable_cognito         = true
  cognito_user_pool_arn  = module.cognito.user_pool_arn
  enable_cloudwatch_metrics = true
  ssm_prefix             = "${var.project_name}/${var.environment}"
  vpc_subnet_ids         = module.vpc.private_subnet_ids
  vpc_security_group_ids = [module.vpc.lambda_security_group_id]

  environment_variables = {
    NODE_ENV                 = var.environment
    CONTROL_PLANE_TABLE_NAME = module.control_plane_dynamodb.table_name
    COGNITO_USER_POOL_ID     = module.cognito.user_pool_id
    SSM_PREFIX               = local.ssm_prefix
  }

  tags = local.common_tags
}

# =============================================================================
# 6. Step Functions (Orchestration)
# =============================================================================
module "step_functions" {
  source = "../../modules/step-functions"

  name_prefix = local.name_prefix

  worker_lambda_arns = [
    module.create_infra_worker.function_arn,
    module.delete_infra_worker.function_arn,
    module.poll_infra_worker.function_arn,
    module.setup_rbac_worker.function_arn,
    module.create_admin_worker.function_arn,
    module.verify_provisioning_worker.function_arn,
  ]

  create_infra_worker_arn        = module.create_infra_worker.function_arn
  delete_infra_worker_arn        = module.delete_infra_worker.function_arn
  poll_infra_worker_arn          = module.poll_infra_worker.function_arn
  setup_rbac_worker_arn          = module.setup_rbac_worker.function_arn
  create_admin_worker_arn        = module.create_admin_worker.function_arn
  verify_provisioning_worker_arn = module.verify_provisioning_worker.function_arn

  tags = local.common_tags
}

# =============================================================================
# 7. API Gateway + JWT Authorizer
# =============================================================================
module "api_gateway" {
  source = "../../modules/api-gateway"

  project_name          = var.project_name
  environment           = var.environment
  lambda_invoke_arn     = module.lambda.invoke_arn
  lambda_function_name  = module.lambda.function_name
  enable_cognito_auth   = var.enable_cognito_auth
  cognito_user_pool_arn = module.cognito.user_pool_arn
  tags                  = local.common_tags
}

# =============================================================================
# 8. Frontend Hosting (S3 + CloudFront, optional)
# =============================================================================
module "frontend" {
  source = "../../modules/s3"

  project_name  = var.project_name
  environment   = var.environment
  force_destroy = var.environment != "prod"
  tags          = local.common_tags
}

# =============================================================================
# 9. Monitoring (8 alarms + SNS)
# =============================================================================
module "monitoring" {
  source = "../../modules/monitoring"

  project_name                     = var.project_name
  environment                      = var.environment
  alarm_email                      = var.alarm_email
  provisioning_notification_email  = var.provisioning_notification_email
  provisioning_notification_emails = var.provisioning_notification_emails
  provisioning_failure_only_emails = var.provisioning_failure_only_emails
  provisioning_cloud_type_emails   = var.provisioning_cloud_type_emails
  lambda_function_name             = module.lambda.function_name
  api_gateway_name                 = "${var.project_name}-${var.environment}-api"
  dynamodb_table_name              = module.control_plane_dynamodb.table_name
  cognito_user_pool_id             = module.cognito.user_pool_id
  cognito_client_id                = module.cognito.client_id
  tags                             = local.common_tags
}

# =============================================================================
# 10. SSM Parameters (Platform Configuration Outputs)
# =============================================================================

resource "aws_ssm_parameter" "cognito_user_pool_id" {
  name  = "${local.ssm_prefix}/cognito/user-pool-id"
  type  = "String"
  value = module.cognito.user_pool_id
  tags  = local.common_tags
}

resource "aws_ssm_parameter" "cognito_client_id" {
  name  = "${local.ssm_prefix}/cognito/client-id"
  type  = "String"
  value = module.cognito.client_id
  tags  = local.common_tags
}

resource "aws_ssm_parameter" "cognito_domain" {
  name  = "${local.ssm_prefix}/cognito/domain"
  type  = "String"
  value = module.cognito.domain
  tags  = local.common_tags
}

resource "aws_ssm_parameter" "api_base_url" {
  name  = "${local.ssm_prefix}/api/base-url"
  type  = "String"
  value = module.api_gateway.invoke_url
  tags  = local.common_tags
}

resource "aws_ssm_parameter" "frontend_url" {
  name  = "${local.ssm_prefix}/frontend/url"
  type  = "String"
  value = module.frontend.cloudfront_url
  tags  = local.common_tags
}

resource "aws_ssm_parameter" "control_plane_table" {
  name  = "${local.ssm_prefix}/dynamodb/control-plane-table"
  type  = "String"
  value = module.control_plane_dynamodb.table_name
  tags  = local.common_tags
}

resource "aws_ssm_parameter" "account_registry_table" {
  name  = "${local.ssm_prefix}/dynamodb/account-registry-table"
  type  = "String"
  value = module.account_registry_dynamodb.table_name
  tags  = local.common_tags
}

resource "aws_ssm_parameter" "data_plane_role_arn" {
  name  = "${local.ssm_prefix}/cross-account/data-plane-role-arn"
  type  = "String"
  value = var.data_plane_role_arn != "" ? var.data_plane_role_arn : "NOT_CONFIGURED"
  tags  = local.common_tags
}

resource "aws_ssm_parameter" "sns_alarm_topic" {
  name  = "${local.ssm_prefix}/monitoring/sns-alarm-topic-arn"
  type  = "String"
  value = module.monitoring.sns_topic_arn
  tags  = local.common_tags
}

resource "aws_ssm_parameter" "vpc_id" {
  name  = "${local.ssm_prefix}/vpc/vpc-id"
  type  = "String"
  value = module.vpc.vpc_id
  tags  = local.common_tags
}

resource "aws_ssm_parameter" "create_account_sfn" {
  name  = "${local.ssm_prefix}/step-functions/create-account-arn"
  type  = "String"
  value = module.step_functions.create_account_state_machine_arn
  tags  = local.common_tags
}

resource "aws_ssm_parameter" "delete_account_sfn" {
  name  = "${local.ssm_prefix}/step-functions/delete-account-arn"
  type  = "String"
  value = module.step_functions.delete_account_state_machine_arn
  tags  = local.common_tags
}
