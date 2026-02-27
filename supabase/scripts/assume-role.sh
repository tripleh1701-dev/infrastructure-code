#!/usr/bin/env bash
# =============================================================================
# Assume Role - sets temporary credentials for cross-account access
# Usage: assume-role.sh <ROLE_ARN> [EXTERNAL_ID]
# =============================================================================
set -euo pipefail

ROLE_ARN="${1:?Usage: assume-role.sh <ROLE_ARN> [EXTERNAL_ID]}"
EXTERNAL_ID="${2:-}"
SESSION_NAME="bootstrap-$(date +%s)"

echo "Assuming role: ${ROLE_ARN}"

ASSUME_CMD="aws sts assume-role --role-arn ${ROLE_ARN} --role-session-name ${SESSION_NAME} --duration-seconds 3600"

if [ -n "${EXTERNAL_ID}" ]; then
  ASSUME_CMD="${ASSUME_CMD} --external-id ${EXTERNAL_ID}"
fi

CREDENTIALS=$(eval "${ASSUME_CMD}" --output json)

export AWS_ACCESS_KEY_ID=$(echo "${CREDENTIALS}" | grep -o '"AccessKeyId": "[^"]*"' | cut -d'"' -f4)
export AWS_SECRET_ACCESS_KEY=$(echo "${CREDENTIALS}" | grep -o '"SecretAccessKey": "[^"]*"' | cut -d'"' -f4)
export AWS_SESSION_TOKEN=$(echo "${CREDENTIALS}" | grep -o '"SessionToken": "[^"]*"' | cut -d'"' -f4)

ASSUMED_ACCOUNT=$(aws sts get-caller-identity --query "Account" --output text)
echo "  ✓ Assumed into account: ${ASSUMED_ACCOUNT}"
echo "  ✓ Session: ${SESSION_NAME}"
