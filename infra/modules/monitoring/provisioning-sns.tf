# =============================================================================
# Provisioning Notifications SNS Topic
# =============================================================================
# Separate SNS topic for provisioning lifecycle events (completion / failure).
# Subscribers receive formatted emails when accounts are provisioned or
# deprovisioned. Independent of the alarm topic to allow different recipients.
#
# Supports three subscription tiers via filter policies:
#   1. All events       — provisioning_notification_emails (no filter)
#   2. Failures only    — provisioning_failure_only_emails
#   3. Specific cloud   — provisioning_cloud_type_emails  (map of email → cloud types)
#
# SNS MessageAttributes used for filtering:
#   status    : "completed" | "failed"
#   cloudType : "public" | "private"
# =============================================================================

locals {
  # Merge the legacy single-email variable with the list variable, dedup
  _legacy             = var.provisioning_notification_email != "" ? [var.provisioning_notification_email] : []
  provisioning_emails = distinct(concat(local._legacy, var.provisioning_notification_emails))

  all_emails = distinct(concat(
    local.provisioning_emails,
    var.provisioning_failure_only_emails,
    keys(var.provisioning_cloud_type_emails),
  ))
  enable_provisioning_sns = length(local.all_emails) > 0
}

# ── Topic ────────────────────────────────────────────────────────────────────

resource "aws_sns_topic" "provisioning" {
  count = local.enable_provisioning_sns ? 1 : 0
  name  = "${var.project_name}-${var.environment}-provisioning-notifications"
  tags  = var.tags
}

# ── Tier 1: All events (no filter) ──────────────────────────────────────────

resource "aws_sns_topic_subscription" "provisioning_all" {
  count     = local.enable_provisioning_sns ? length(local.provisioning_emails) : 0
  topic_arn = aws_sns_topic.provisioning[0].arn
  protocol  = "email"
  endpoint  = local.provisioning_emails[count.index]
}

# ── Tier 2: Failure-only subscribers ────────────────────────────────────────

resource "aws_sns_topic_subscription" "provisioning_failures" {
  count     = local.enable_provisioning_sns ? length(var.provisioning_failure_only_emails) : 0
  topic_arn = aws_sns_topic.provisioning[0].arn
  protocol  = "email"
  endpoint  = var.provisioning_failure_only_emails[count.index]

  filter_policy = jsonencode({
    status = ["failed"]
  })

  filter_policy_scope = "MessageAttributes"
}

# ── Tier 3: Cloud-type filtered subscribers ─────────────────────────────────

resource "aws_sns_topic_subscription" "provisioning_cloud_type" {
  for_each  = local.enable_provisioning_sns ? var.provisioning_cloud_type_emails : {}
  topic_arn = aws_sns_topic.provisioning[0].arn
  protocol  = "email"
  endpoint  = each.key

  filter_policy = jsonencode({
    cloudType = each.value
  })

  filter_policy_scope = "MessageAttributes"
}
