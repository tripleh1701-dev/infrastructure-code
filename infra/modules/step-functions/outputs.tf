output "create_account_state_machine_arn" {
  value = aws_sfn_state_machine.create_account.arn
}

output "delete_account_state_machine_arn" {
  value = aws_sfn_state_machine.delete_account.arn
}

output "step_functions_role_arn" {
  value = aws_iam_role.step_functions.arn
}
