#!/usr/bin/env bash
# =============================================================================
# Data Plane Bootstrap Script
# Idempotent - safe to re-run
# =============================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TERRAFORM_DIR="${SCRIPT_DIR}/../terraform"

echo "============================================="
echo "  DATA PLANE BOOTSTRAP"
echo "============================================="

# ---- Pre-checks ----
echo "[1/6] Running pre-checks..."
bash "${SCRIPT_DIR}/../../scripts/prechecks.sh"

# ---- Assume role into customer account ----
echo "[2/6] Assuming role into customer account..."
if [ -n "${DATA_PLANE_ROLE_ARN:-}" ]; then
  echo "  Using role: ${DATA_PLANE_ROLE_ARN}"
  bash "${SCRIPT_DIR}/../../scripts/assume-role.sh" "${DATA_PLANE_ROLE_ARN}" "${EXTERNAL_ID:-}"
else
  echo "  Using current credentials (direct access)"
fi

# ---- Validate AWS identity ----
echo "[3/6] Validating AWS identity..."
ACCOUNT_ID=$(aws sts get-caller-identity --query "Account" --output text)
echo "  Customer Account: ${ACCOUNT_ID}"

# ---- Terraform init ----
echo "[4/6] Initializing Terraform..."
cd "${TERRAFORM_DIR}"

if [ -f "backend.hcl" ]; then
  terraform init -backend-config=backend.hcl -reconfigure
else
  terraform init -reconfigure
fi

# ---- Terraform apply ----
echo "[5/6] Applying data-plane infrastructure..."
terraform plan -out=tfplan
terraform apply tfplan
rm -f tfplan

# ---- Validate cross-account access ----
echo "[6/6] Validating cross-account access..."
DATA_PLANE_ROLE=$(terraform output -raw data_plane_role_arn)
TABLE_NAME=$(terraform output -raw customer_dynamodb_table_name)

echo "  Data Plane Role ARN:  ${DATA_PLANE_ROLE}"
echo "  DynamoDB Table:       ${TABLE_NAME}"

VALIDATE_CMD="bash \"${SCRIPT_DIR}/../../scripts/validate-bootstrap.sh\" --data-plane-role \"${DATA_PLANE_ROLE}\" --table-name \"${TABLE_NAME}\""
if [ -n "${EXTERNAL_ID:-}" ]; then
  VALIDATE_CMD="${VALIDATE_CMD} --external-id \"${EXTERNAL_ID}\""
fi
eval ${VALIDATE_CMD}

echo ""
echo "============================================="
echo "  DATA PLANE BOOTSTRAP COMPLETE"
echo "============================================="
echo ""
echo "Key Outputs:"
echo "  DynamoDB Table:     ${TABLE_NAME}"
echo "  Data Plane Role:    ${DATA_PLANE_ROLE}"
echo "  Customer Account:   ${ACCOUNT_ID}"
echo ""
echo "Next step: Update control-plane terraform.tfvars with:"
echo "  data_plane_role_arn      = \"${DATA_PLANE_ROLE}\""
echo "  data_plane_dynamodb_name = \"${TABLE_NAME}\""
echo "Then re-apply control-plane to wire cross-account access."
