#!/usr/bin/env bash
# =============================================================================
# Control Plane Bootstrap Script
# Idempotent - safe to re-run
# =============================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TERRAFORM_DIR="${SCRIPT_DIR}/../terraform"

echo "============================================="
echo "  CONTROL PLANE BOOTSTRAP"
echo "============================================="

# ---- Pre-checks ----
echo "[1/6] Running pre-checks..."
bash "${SCRIPT_DIR}/../../scripts/prechecks.sh"

# ---- Ensure state backend ----
echo "[2/6] Ensuring Terraform state backend exists..."
if [ -n "${TF_STATE_BUCKET:-}" ] && [ -n "${TF_LOCK_TABLE:-}" ]; then
  bash "${SCRIPT_DIR}/../../scripts/ensure-state-backend.sh" \
    "${TF_STATE_BUCKET}" "${TF_LOCK_TABLE}" "${AWS_REGION:-us-east-1}"
else
  echo "  ⚠ TF_STATE_BUCKET / TF_LOCK_TABLE not set — skipping (using local backend?)"
fi

# ---- Validate AWS identity ----
echo "[3/6] Validating AWS identity..."
ACCOUNT_ID=$(aws sts get-caller-identity --query "Account" --output text)
echo "  Platform Admin Account: ${ACCOUNT_ID}"

CALLER_ARN=$(aws sts get-caller-identity --query "Arn" --output text)
echo "  Caller: ${CALLER_ARN}"

# ---- Terraform init ----
echo "[4/6] Initializing Terraform..."
cd "${TERRAFORM_DIR}"

if [ -f "backend.hcl" ]; then
  terraform init -backend-config=backend.hcl -reconfigure
else
  terraform init -reconfigure
fi

# ---- Terraform plan ----
echo "[5/6] Planning infrastructure..."
terraform plan -out=tfplan

# ---- Terraform apply ----
echo "[6/6] Applying infrastructure..."
terraform apply tfplan
rm -f tfplan

# ---- Output values ----
echo ""
echo "============================================="
echo "  CONTROL PLANE BOOTSTRAP COMPLETE"
echo "============================================="
echo ""
echo "Key Outputs:"
echo "  Cognito User Pool ID: $(terraform output -raw cognito_user_pool_id)"
echo "  Cognito Client ID:    $(terraform output -raw cognito_client_id)"
echo "  API Gateway URL:      $(terraform output -raw api_gateway_url)"
echo "  Frontend URL:         $(terraform output -raw frontend_url)"
echo "  DynamoDB Table:       $(terraform output -raw control_plane_dynamodb_table)"
echo "  SNS Alarm Topic:      $(terraform output -raw sns_alarm_topic_arn)"
echo "  Admin Account ID:     $(terraform output -raw platform_admin_account_id)"
echo ""
echo "Next step: Run data-plane bootstrap"
