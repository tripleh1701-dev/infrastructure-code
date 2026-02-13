# Bootstrap Execution Guide

## Overview

This document describes the complete bootstrap sequence for provisioning the two-account AWS SaaS architecture from scratch.

**Architecture:**
- **Platform Admin Account:** Hosts all compute, authentication, APIs, monitoring, and frontend
- **Customer Account:** Hosts ONLY customer DynamoDB tables and a cross-account IAM role

## Prerequisites

1. **Two AWS Accounts** provisioned and accessible
2. **AWS CLI** configured with credentials for both accounts
3. **Terraform** >= 1.5.0 installed
4. **S3 bucket** for Terraform state (in the Platform Admin Account)
5. **DynamoDB table** for Terraform state locking (in the Platform Admin Account)
6. **GitHub OIDC** configured for both accounts (for CI/CD)

## Bootstrap Sequence

### Phase 1: Platform Admin Bootstrap

**What gets created:**
- Cognito User Pool + Client (email auth, custom attributes, OAuth code grant)
- Lambda function (NestJS backend placeholder)
- API Gateway (REST, deployed stage, Lambda proxy, Cognito authorizer)
- DynamoDB table (platform admin configuration)
- S3 bucket + CloudFront (frontend hosting)
- 8 CloudWatch alarms + SNS topic
- SSM Parameters (platform configuration)

**Steps:**

```bash
# 1. Configure variables
cd infra/control-plane/terraform
cp terraform.tfvars.example terraform.tfvars
# Edit terraform.tfvars with your values

# 2. Create backend config for state
cat > backend.hcl <<EOF
bucket         = "your-terraform-state-bucket"
key            = "platform-admin/dev/terraform.tfstate"
region         = "us-east-1"
dynamodb_table = "your-terraform-lock-table"
EOF

# 3. Create Lambda placeholder
echo "placeholder" > lambda-placeholder.txt && zip lambda-placeholder.zip lambda-placeholder.txt

# 4. Run bootstrap
bash ../../infra/control-plane/bootstrap/bootstrap.sh
```

**Or via GitHub Actions:**
1. Set required secrets: `PLATFORM_ADMIN_ROLE_ARN`, `TF_STATE_BUCKET`, `TF_LOCK_TABLE`
2. Trigger: Actions → "Bootstrap Platform Admin" → Run workflow

### Phase 2: Customer Account Bootstrap

**What gets created:**
- DynamoDB table (customer data, tenant-isolated)
- IAM role (assumable by Platform Admin, least-privilege DynamoDB access)

**Steps:**

```bash
# 1. Configure variables
cd infra/data-plane/terraform
cp terraform.tfvars.example terraform.tfvars
# Set platform_admin_account_id and external_id

# 2. Create backend config
cat > backend.hcl <<EOF
bucket         = "your-terraform-state-bucket"
key            = "customer-account/dev/terraform.tfstate"
region         = "us-east-1"
dynamodb_table = "your-terraform-lock-table"
EOF

# 3. Run bootstrap
bash ../../infra/data-plane/bootstrap/bootstrap.sh
```

### Phase 3: Wire Cross-Account Access

After Customer Account bootstrap, update the Platform Admin configuration:

```bash
# 1. Get Customer Account outputs
cd infra/data-plane/terraform
CUSTOMER_ACCOUNT_ROLE=$(terraform output -raw data_plane_role_arn)
TABLE_NAME=$(terraform output -raw customer_dynamodb_table_name)

# 2. Update Platform Admin tfvars
cd ../../control-plane/terraform
# Set in terraform.tfvars:
#   data_plane_role_arn      = "<CUSTOMER_ACCOUNT_ROLE>"
#   data_plane_dynamodb_name = "<TABLE_NAME>"

# 3. Re-apply Platform Admin
terraform plan -out=tfplan && terraform apply tfplan
```

### Phase 4: Validate

```bash
bash scripts/validate-bootstrap.sh \
  --data-plane-role "<CUSTOMER_ACCOUNT_ROLE_ARN>" \
  --table-name "<TABLE_NAME>"
```

## Idempotency

All bootstrap operations are idempotent and safe to re-run:
- Terraform manages state and only applies changes
- Scripts check for existing resources before creating
- Cross-account validation is non-destructive (creates and immediately deletes a test item)

## GitHub Secrets Required

| Secret | Description |
|--------|-------------|
| `PLATFORM_ADMIN_ROLE_ARN` | IAM role ARN for GitHub OIDC in Platform Admin Account |
| `CUSTOMER_ACCOUNT_ROLE_ARN` | IAM role ARN for GitHub OIDC in Customer Account |
| `TF_STATE_BUCKET` | S3 bucket for Terraform state |
| `TF_LOCK_TABLE` | DynamoDB table for Terraform state locking |
| `PLATFORM_ADMIN_ACCOUNT_ID` | Platform Admin AWS Account ID |
| `CROSS_ACCOUNT_EXTERNAL_ID` | External ID for cross-account role assumption |

## GitHub Variables Required

| Variable | Description |
|----------|-------------|
| `PROJECT_NAME` | Project name (default: `license-portal`) |
| `AWS_REGION` | AWS region (default: `us-east-1`) |
| `API_BASE_URL` | API Gateway invoke URL (set after bootstrap) |
| `COGNITO_USER_POOL_ID` | Cognito User Pool ID (set after bootstrap) |
| `COGNITO_CLIENT_ID` | Cognito Client ID (set after bootstrap) |
| `COGNITO_DOMAIN` | Cognito domain (set after bootstrap) |
| `FRONTEND_S3_BUCKET` | Frontend S3 bucket name (set after bootstrap) |
| `CLOUDFRONT_DISTRIBUTION_ID` | CloudFront distribution ID (set after bootstrap) |

## Troubleshooting

### "Access Denied" on cross-account assume role
- Verify `platform_admin_account_id` matches the Platform Admin Account
- Check `external_id` matches between Customer Account tfvars and Platform Admin Lambda config

### Lambda placeholder errors
- Create a valid zip: `echo "placeholder" > p.txt && zip lambda-placeholder.zip p.txt`
- This is replaced during the first `deploy-backend` workflow run

### State lock errors
- Ensure the DynamoDB lock table exists before running Terraform
- If stuck: `terraform force-unlock <LOCK_ID>`
