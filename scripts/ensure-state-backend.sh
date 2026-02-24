#!/usr/bin/env bash
# =============================================================================
# Ensure Terraform State Backend Exists
# Idempotent — creates S3 bucket + DynamoDB lock table if missing
# =============================================================================
set -euo pipefail

BUCKET="${1:?Usage: ensure-state-backend.sh <bucket> <lock-table> <region>}"
LOCK_TABLE="${2:?Usage: ensure-state-backend.sh <bucket> <lock-table> <region>}"
REGION="${3:-us-east-1}"

echo "🔍 Ensuring Terraform state backend exists..."
echo "   Bucket:     ${BUCKET}"
echo "   Lock Table: ${LOCK_TABLE}"
echo "   Region:     ${REGION}"

# ---- S3 Bucket ----
if aws s3api head-bucket --bucket "${BUCKET}" 2>/dev/null; then
  echo "   ✓ S3 bucket already exists"
else
  echo "   ⏳ Creating S3 bucket: ${BUCKET}"
  if [ "${REGION}" = "us-east-1" ]; then
    aws s3api create-bucket --bucket "${BUCKET}" --region "${REGION}"
  else
    aws s3api create-bucket --bucket "${BUCKET}" --region "${REGION}" \
      --create-bucket-configuration LocationConstraint="${REGION}"
  fi

  # Enable versioning (best practice for TF state)
  aws s3api put-bucket-versioning --bucket "${BUCKET}" \
    --versioning-configuration Status=Enabled

  # Block public access
  aws s3api put-public-access-block --bucket "${BUCKET}" \
    --public-access-block-configuration \
    "BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true"

  # Enable server-side encryption
  aws s3api put-bucket-encryption --bucket "${BUCKET}" \
    --server-side-encryption-configuration \
    '{"Rules":[{"ApplyServerSideEncryptionByDefault":{"SSEAlgorithm":"AES256"},"BucketKeyEnabled":true}]}'

  echo "   ✓ S3 bucket created with versioning, encryption, and public access blocked"
fi

# ---- DynamoDB Lock Table ----
if aws dynamodb describe-table --table-name "${LOCK_TABLE}" --region "${REGION}" >/dev/null 2>&1; then
  echo "   ✓ DynamoDB lock table already exists"
else
  echo "   ⏳ Creating DynamoDB lock table: ${LOCK_TABLE}"
  aws dynamodb create-table \
    --table-name "${LOCK_TABLE}" \
    --attribute-definitions AttributeName=LockID,AttributeType=S \
    --key-schema AttributeName=LockID,KeyType=HASH \
    --billing-mode PAY_PER_REQUEST \
    --region "${REGION}" \
    --tags Key=ManagedBy,Value=terraform Key=Purpose,Value=state-locking

  echo "   ⏳ Waiting for table to become active..."
  aws dynamodb wait table-exists --table-name "${LOCK_TABLE}" --region "${REGION}"
  echo "   ✓ DynamoDB lock table created"
fi

echo "✅ Terraform state backend is ready."
