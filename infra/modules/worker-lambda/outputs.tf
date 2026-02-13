output "function_name" {
  value = aws_lambda_function.worker.function_name
}

output "function_arn" {
  value = aws_lambda_function.worker.arn
}

output "invoke_arn" {
  value = aws_lambda_function.worker.invoke_arn
}

output "role_arn" {
  value = aws_iam_role.worker.arn
}
