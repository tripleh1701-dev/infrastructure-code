# =============================================================================
# Step Functions Module - Infrastructure Orchestration
# =============================================================================
# Orchestrates: create-infra → poll-infra → setup-rbac → create-admin
# Also: delete-infra workflow
# =============================================================================

# ---- IAM Role for Step Functions ----
resource "aws_iam_role" "step_functions" {
  name = "${var.name_prefix}-sfn-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Action    = "sts:AssumeRole"
      Principal = { Service = "states.amazonaws.com" }
    }]
  })

  tags = var.tags
}

resource "aws_iam_role_policy" "sfn_invoke_lambda" {
  name = "${var.name_prefix}-sfn-invoke-lambda"
  role = aws_iam_role.step_functions.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect   = "Allow"
        Action   = "lambda:InvokeFunction"
        Resource = var.worker_lambda_arns
      },
      {
        Effect   = "Allow"
        Action   = ["logs:CreateLogDelivery", "logs:GetLogDelivery", "logs:UpdateLogDelivery", "logs:DeleteLogDelivery", "logs:ListLogDeliveries", "logs:PutResourcePolicy", "logs:DescribeResourcePolicies", "logs:DescribeLogGroups"]
        Resource = "*"
      }
    ]
  })
}

# ---- Create Account State Machine ----
resource "aws_sfn_state_machine" "create_account" {
  name     = "${var.name_prefix}-create-account"
  role_arn = aws_iam_role.step_functions.arn

  definition = jsonencode({
    Comment = "Orchestrate new account provisioning"
    StartAt = "CreateInfrastructure"
    States = {
      CreateInfrastructure = {
        Type     = "Task"
        Resource = var.create_infra_worker_arn
        Next     = "WaitForInfra"
        Retry = [{
          ErrorEquals     = ["States.TaskFailed"]
          IntervalSeconds = 10
          MaxAttempts     = 2
          BackoffRate     = 2.0
        }]
        Catch = [{
          ErrorEquals = ["States.ALL"]
          Next        = "ProvisioningFailed"
          ResultPath  = "$.error"
        }]
      }
      WaitForInfra = {
        Type    = "Wait"
        Seconds = 30
        Next    = "PollInfraStatus"
      }
      PollInfraStatus = {
        Type     = "Task"
        Resource = var.poll_infra_worker_arn
        Next     = "CheckInfraReady"
        Retry = [{
          ErrorEquals     = ["States.TaskFailed"]
          IntervalSeconds = 5
          MaxAttempts     = 3
          BackoffRate     = 1.5
        }]
      }
      CheckInfraReady = {
        Type = "Choice"
        Choices = [
          {
            Variable     = "$.status"
            StringEquals = "READY"
            Next         = "SetupRBAC"
          },
          {
            Variable     = "$.status"
            StringEquals = "FAILED"
            Next         = "ProvisioningFailed"
          }
        ]
        Default = "WaitForInfra"
      }
      SetupRBAC = {
        Type     = "Task"
        Resource = var.setup_rbac_worker_arn
        Next     = "CreateAdminUser"
        Retry = [{
          ErrorEquals     = ["States.TaskFailed"]
          IntervalSeconds = 5
          MaxAttempts     = 2
          BackoffRate     = 2.0
        }]
        Catch = [{
          ErrorEquals = ["States.ALL"]
          Next        = "ProvisioningFailed"
          ResultPath  = "$.error"
        }]
      }
      CreateAdminUser = {
        Type     = "Task"
        Resource = var.create_admin_worker_arn
        Next     = "VerifyProvisioning"
        Retry = [{
          ErrorEquals     = ["States.TaskFailed"]
          IntervalSeconds = 5
          MaxAttempts     = 2
          BackoffRate     = 2.0
        }]
        Catch = [{
          ErrorEquals = ["States.ALL"]
          Next        = "ProvisioningFailed"
          ResultPath  = "$.error"
        }]
      }
      VerifyProvisioning = {
        Type     = "Task"
        Resource = var.verify_provisioning_worker_arn
        Next     = "CheckVerification"
        Retry = [{
          ErrorEquals     = ["States.TaskFailed"]
          IntervalSeconds = 5
          MaxAttempts     = 2
          BackoffRate     = 2.0
        }]
        Catch = [{
          ErrorEquals = ["States.ALL"]
          Next        = "ProvisioningFailed"
          ResultPath  = "$.error"
        }]
      }
      CheckVerification = {
        Type = "Choice"
        Choices = [
          {
            Variable      = "$.verified"
            BooleanEquals = true
            Next          = "ProvisioningComplete"
          }
        ]
        Default = "ProvisioningFailed"
      }
      ProvisioningComplete = {
        Type = "Succeed"
      }
      ProvisioningFailed = {
        Type  = "Fail"
        Error = "ProvisioningError"
        Cause = "Account provisioning failed — check worker logs"
      }
    }
  })

  logging_configuration {
    log_destination        = "${aws_cloudwatch_log_group.sfn.arn}:*"
    include_execution_data = true
    level                  = "ERROR"
  }

  tags = var.tags
}

# ---- Delete Account State Machine ----
resource "aws_sfn_state_machine" "delete_account" {
  name     = "${var.name_prefix}-delete-account"
  role_arn = aws_iam_role.step_functions.arn

  definition = jsonencode({
    Comment = "Orchestrate account teardown"
    StartAt = "DeleteInfrastructure"
    States = {
      DeleteInfrastructure = {
        Type     = "Task"
        Resource = var.delete_infra_worker_arn
        Next     = "WaitForDeletion"
        Retry = [{
          ErrorEquals     = ["States.TaskFailed"]
          IntervalSeconds = 10
          MaxAttempts     = 2
          BackoffRate     = 2.0
        }]
        Catch = [{
          ErrorEquals = ["States.ALL"]
          Next        = "DeletionFailed"
          ResultPath  = "$.error"
        }]
      }
      WaitForDeletion = {
        Type    = "Wait"
        Seconds = 30
        Next    = "PollDeletionStatus"
      }
      PollDeletionStatus = {
        Type     = "Task"
        Resource = var.poll_infra_worker_arn
        Next     = "CheckDeletionComplete"
        Retry = [{
          ErrorEquals     = ["States.TaskFailed"]
          IntervalSeconds = 5
          MaxAttempts     = 3
          BackoffRate     = 1.5
        }]
      }
      CheckDeletionComplete = {
        Type = "Choice"
        Choices = [
          {
            Variable     = "$.status"
            StringEquals = "DELETED"
            Next         = "DeletionComplete"
          },
          {
            Variable     = "$.status"
            StringEquals = "FAILED"
            Next         = "DeletionFailed"
          }
        ]
        Default = "WaitForDeletion"
      }
      DeletionComplete = {
        Type = "Succeed"
      }
      DeletionFailed = {
        Type  = "Fail"
        Error = "DeletionError"
        Cause = "Account deletion failed — check worker logs"
      }
    }
  })

  logging_configuration {
    log_destination        = "${aws_cloudwatch_log_group.sfn.arn}:*"
    include_execution_data = true
    level                  = "ERROR"
  }

  tags = var.tags
}

resource "aws_cloudwatch_log_group" "sfn" {
  name              = "/aws/states/${var.name_prefix}"
  retention_in_days = var.log_retention_days
  tags              = var.tags

  lifecycle {
    ignore_changes = [name]
  }
}
