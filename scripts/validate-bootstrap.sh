#!/usr/bin/env bash
# =============================================================================
# Validate Bootstrap - verifies cross-account access works
# Usage: validate-bootstrap.sh --data-plane-role <ARN> --table-name <TABLE>
# =============================================================================
set -euo pipefail

DATA_PLANE_ROLE=""
TABLE_NAME=""
EXTERNAL_ID=""

while [[ $# -gt 0 ]]; do
  case $1 in
    --data-plane-role) DATA_PLANE_ROLE="$2"; shift 2 ;;
    --table-name) TABLE_NAME="$2"; shift 2 ;;
    --external-id) EXTERNAL_ID="$2"; shift 2 ;;
    *) echo "Unknown option: $1" >&2; exit 1 ;;
  esac
done

if [ -z "${DATA_PLANE_ROLE}" ] || [ -z "${TABLE_NAME}" ]; then
  echo "Usage: validate-bootstrap.sh --data-plane-role <ARN> --table-name <TABLE> [--external-id <ID>]" >&2
  exit 1
fi

echo "Validating cross-account access..."

# Step 1: Assume the data-plane role
echo "  [1/3] Assuming data-plane role..."
ASSUME_CMD="aws sts assume-role --role-arn ${DATA_PLANE_ROLE} --role-session-name bootstrap-validation --duration-seconds 900 --output json"
if [ -n "${EXTERNAL_ID}" ]; then
  ASSUME_CMD="${ASSUME_CMD} --external-id ${EXTERNAL_ID}"
fi

CREDENTIALS=$(eval "${ASSUME_CMD}" 2>&1) || {
  echo "  ✗ Failed to assume data-plane role" >&2
  echo "    ${CREDENTIALS}" >&2
  exit 1
}

export AWS_ACCESS_KEY_ID=$(echo "${CREDENTIALS}" | grep -o '"AccessKeyId": "[^"]*"' | cut -d'"' -f4)
export AWS_SECRET_ACCESS_KEY=$(echo "${CREDENTIALS}" | grep -o '"SecretAccessKey": "[^"]*"' | cut -d'"' -f4)
export AWS_SESSION_TOKEN=$(echo "${CREDENTIALS}" | grep -o '"SessionToken": "[^"]*"' | cut -d'"' -f4)

echo "  ✓ Role assumed successfully"

# Step 2: Verify DynamoDB table exists (with retry for IAM propagation)
echo "  [2/3] Verifying DynamoDB table..."
MAX_RETRIES=6
RETRY_DELAY=10
TABLE_STATUS=""
for i in $(seq 1 ${MAX_RETRIES}); do
  TABLE_STATUS=$(aws dynamodb describe-table \
    --table-name "${TABLE_NAME}" \
    --query "Table.TableStatus" \
    --output text 2>&1) && break
  if [ "${i}" -eq "${MAX_RETRIES}" ]; then
    echo "  ✗ Cannot access DynamoDB table after ${MAX_RETRIES} attempts: ${TABLE_NAME}" >&2
    echo "    ${TABLE_STATUS}" >&2
    exit 1
  fi
  echo "  ⏳ IAM policy propagating, retry ${i}/${MAX_RETRIES} in ${RETRY_DELAY}s..."
  sleep ${RETRY_DELAY}
done
echo "  ✓ DynamoDB table '${TABLE_NAME}' status: ${TABLE_STATUS}"

# Step 3: Test write/read/delete
echo "  [3/3] Testing DynamoDB operations..."
TEST_PK="BOOTSTRAP_VALIDATION"
TEST_SK="test-$(date +%s)"

aws dynamodb put-item \
  --table-name "${TABLE_NAME}" \
  --item "{\"PK\": {\"S\": \"${TEST_PK}\"}, \"SK\": {\"S\": \"${TEST_SK}\"}, \"validated_at\": {\"S\": \"$(date -u +%Y-%m-%dT%H:%M:%SZ)\"}}" \
  --output text >/dev/null

aws dynamodb delete-item \
  --table-name "${TABLE_NAME}" \
  --key "{\"PK\": {\"S\": \"${TEST_PK}\"}, \"SK\": {\"S\": \"${TEST_SK}\"}}" \
  --output text >/dev/null

echo "  ✓ DynamoDB write/delete test passed"

# Clear assumed credentials
unset AWS_ACCESS_KEY_ID AWS_SECRET_ACCESS_KEY AWS_SESSION_TOKEN

echo ""
echo "✓ Cross-account access validation PASSED"
