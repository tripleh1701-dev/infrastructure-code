# --- VPC ---
output "vpc_id" {
  value = module.vpc.vpc_id
}

output "private_subnet_ids" {
  value = module.vpc.private_subnet_ids
}

# --- Cognito ---
output "cognito_user_pool_id" {
  value = module.cognito.user_pool_id
}

output "cognito_client_id" {
  value = module.cognito.client_id
}

output "cognito_domain" {
  value = module.cognito.domain
}

output "cognito_hosted_ui_url" {
  value = module.cognito.hosted_ui_url
}

# --- API Gateway ---
output "api_gateway_url" {
  value = module.api_gateway.invoke_url
}

# --- Backend Lambda ---
output "lambda_function_name" {
  value = module.lambda.function_name
}

output "lambda_function_arn" {
  value = module.lambda.function_arn
}

# --- DynamoDB ---
output "control_plane_dynamodb_table" {
  value = module.control_plane_dynamodb.table_name
}

output "control_plane_dynamodb_arn" {
  value = module.control_plane_dynamodb.table_arn
}

output "account_registry_dynamodb_table" {
  value = module.account_registry_dynamodb.table_name
}

output "account_registry_dynamodb_arn" {
  value = module.account_registry_dynamodb.table_arn
}

# --- Worker Lambdas ---
output "create_infra_worker_arn" {
  value = module.create_infra_worker.function_arn
}

output "delete_infra_worker_arn" {
  value = module.delete_infra_worker.function_arn
}

output "poll_infra_worker_arn" {
  value = module.poll_infra_worker.function_arn
}

output "setup_rbac_worker_arn" {
  value = module.setup_rbac_worker.function_arn
}

output "create_admin_worker_arn" {
  value = module.create_admin_worker.function_arn
}

output "verify_provisioning_worker_arn" {
  value = module.verify_provisioning_worker.function_arn
}

# --- Step Functions ---
output "create_account_sfn_arn" {
  value = module.step_functions.create_account_state_machine_arn
}

output "delete_account_sfn_arn" {
  value = module.step_functions.delete_account_state_machine_arn
}

# --- Frontend ---
output "frontend_bucket" {
  value = module.frontend.bucket_name
}

output "frontend_cloudfront_id" {
  value = module.frontend.cloudfront_distribution_id
}

output "frontend_url" {
  value = module.frontend.cloudfront_url
}

# --- Monitoring ---
output "sns_alarm_topic_arn" {
  value = module.monitoring.sns_topic_arn
}

output "alarm_names" {
  value = module.monitoring.alarm_names
}

# --- Account ---
output "platform_admin_account_id" {
  value = data.aws_caller_identity.current.account_id
}

data "aws_caller_identity" "current" {}
