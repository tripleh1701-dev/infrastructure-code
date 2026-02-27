#!/usr/bin/env bash
# =============================================================================
# Pre-flight checks - validates toolchain before bootstrap
# =============================================================================
set -euo pipefail

echo "Running pre-flight checks..."

# Check AWS CLI
if ! command -v aws &>/dev/null; then
  echo "ERROR: AWS CLI is not installed" >&2
  exit 1
fi
echo "  ✓ AWS CLI: $(aws --version 2>&1 | head -1)"

# Check Terraform
if ! command -v terraform &>/dev/null; then
  echo "ERROR: Terraform is not installed" >&2
  exit 1
fi
echo "  ✓ Terraform: $(terraform version -json | grep -o '"terraform_version":"[^"]*"' | cut -d'"' -f4)"

# Check AWS credentials
if ! aws sts get-caller-identity &>/dev/null; then
  echo "ERROR: AWS credentials not configured or expired" >&2
  exit 1
fi

ACCOUNT_ID=$(aws sts get-caller-identity --query "Account" --output text)
CALLER_ARN=$(aws sts get-caller-identity --query "Arn" --output text)
echo "  ✓ AWS Account: ${ACCOUNT_ID}"
echo "  ✓ Caller ARN:  ${CALLER_ARN}"

# Check jq (optional but recommended)
if command -v jq &>/dev/null; then
  echo "  ✓ jq: $(jq --version)"
else
  echo "  ⚠ jq not found (optional, but recommended)"
fi

echo "Pre-flight checks passed."
