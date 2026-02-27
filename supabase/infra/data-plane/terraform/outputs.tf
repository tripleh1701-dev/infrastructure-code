output "customer_dynamodb_table_name" {
  description = "Customer DynamoDB table name (account-admin-public-{workspace})"
  value       = module.customer_dynamodb.table_name
}

output "customer_dynamodb_table_arn" {
  value = module.customer_dynamodb.table_arn
}

output "customer_account_role_arn" {
  description = "IAM role ARN for cross-account access from Platform Admin"
  value       = aws_iam_role.customer_account_access.arn
}

output "cloudformation_execution_role_arn" {
  description = "CloudFormation execution role for private-tier stacks"
  value       = aws_iam_role.cloudformation_execution.arn
}

output "customer_account_id" {
  value = data.aws_caller_identity.current.account_id
}

data "aws_caller_identity" "current" {}
