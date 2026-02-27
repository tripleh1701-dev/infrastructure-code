# Phase 2: End-to-End Execution Guide — CI/CD Pipeline Setup

> **Audience**: Developers setting up automated CI/CD after completing Phase 1.
>
> **Prerequisite**: Phase 1 **fully complete** — infrastructure provisioned, Day-0 bootstrap executed, smoke tests passing. See [PHASE1-END-TO-END-EXECUTION.md](./PHASE1-END-TO-END-EXECUTION.md).
>
> **Time Estimate**: ~2–4 hours
>
> **Outcome**: Terraform state stored remotely in S3, CI/CD IAM user created with least-privilege access, GitHub repository and environment secrets configured, workspace pipeline auto-deploying on push to `main`, frontend deployment pipeline operational via S3 (CloudFront added later when quota is approved).
>
> **⚠️ CloudFront Note**: This guide continues the **no-CloudFront** approach from Phase 1. Frontend deployments use **S3 Static Website Hosting**. CloudFront invalidation steps in the pipeline are gracefully skipped when no distribution ID is configured. A dedicated section at the end describes how to enable CloudFront later.

---

## Table of Contents

1. [Prerequisites Check](#step-1-prerequisites-check)
2. [Create Terraform Remote State Backend](#step-2-create-terraform-remote-state-backend)
3. [Migrate Existing Terraform State to S3](#step-3-migrate-existing-terraform-state-to-s3)
4. [Create CI/CD IAM User](#step-4-create-cicd-iam-user)
5. [Configure GitHub Repository Secrets](#step-5-configure-github-repository-secrets)
6. [Add CI/CD Environment Secrets](#step-6-add-cicd-environment-secrets)
7. [Verify All Secrets](#step-7-verify-all-secrets)
8. [Copy Workflow Files to Repository Root](#step-8-copy-workflow-files-to-repository-root)
9. [Test Workspace Pipeline (Backend)](#step-9-test-workspace-pipeline-backend)
10. [Test Frontend Deployment Pipeline](#step-10-test-frontend-deployment-pipeline)
11. [Test Auto-Trigger on Push](#step-11-test-auto-trigger-on-push)
12. [Set Up QA & Prod Environments](#step-12-set-up-qa--prod-environments)
13. [Configure Nightly Pre-Flight Checks](#step-13-configure-nightly-pre-flight-checks)
14. [Final Verification & Checklist](#step-14-final-verification--checklist)
15. [How to Add CloudFront Later](#how-to-add-cloudfront-later)

---

## Step 1: Prerequisites Check

Before starting Phase 2, verify that Phase 1 is fully complete:

```bash
cd docs/nestjs-backend

# 1. Verify the API is healthy
API_URL=$(terraform -chdir=terraform output -raw api_gateway_stage_url)
curl -s "$API_URL/health" | jq .
# Expected: {"status":"ok"} with HTTP 200

# 2. Verify bootstrap data exists
npm run verify-bootstrap
# Expected: All checks ✅ PASS

# 3. Verify Cognito admin user exists
COGNITO_POOL=$(terraform -chdir=terraform output -raw cognito_user_pool_id)
aws cognito-idp admin-get-user \
  --user-pool-id $COGNITO_POOL \
  --username admin@adminplatform.com \
  --profile platform-admin --region us-east-1
# Expected: User record returned

# 4. Verify GitHub CLI is authenticated
gh auth status
# Expected: Logged in to github.com
```

**📝 Record these values** (you'll need them throughout Phase 2):
```
API_URL:        ____________________________
COGNITO_POOL:   ____________________________
COGNITO_CLIENT: ____________________________
COGNITO_DOMAIN: ____________________________
```

**✅ Checkpoint**: Phase 1 verified — ready to proceed.

---

## Step 2: Create Terraform Remote State Backend

Terraform needs a shared state backend so CI/CD and local runs stay in sync. All resources are created in the **Platform Admin** account.

### 2.1 Create S3 Bucket for State Storage

```bash
export AWS_PROFILE=platform-admin

aws s3api create-bucket \
  --bucket license-portal-terraform-state \
  --region us-east-1
```

> **📝 Note**: For `us-east-1`, no `--create-bucket-configuration` is needed. For other regions, add `--create-bucket-configuration LocationConstraint=<region>`.

### 2.2 Enable Versioning (Protects Against State Corruption)

```bash
aws s3api put-bucket-versioning \
  --bucket license-portal-terraform-state \
  --versioning-configuration Status=Enabled
```

### 2.3 Enable Server-Side Encryption

```bash
aws s3api put-bucket-encryption \
  --bucket license-portal-terraform-state \
  --server-side-encryption-configuration '{
    "Rules": [
      {
        "ApplyServerSideEncryptionByDefault": {
          "SSEAlgorithm": "aws:kms"
        },
        "BucketKeyEnabled": true
      }
    ]
  }'
```

### 2.4 Block All Public Access

```bash
aws s3api put-public-access-block \
  --bucket license-portal-terraform-state \
  --public-access-block-configuration \
    BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true
```

### 2.5 Create DynamoDB Lock Table

```bash
aws dynamodb create-table \
  --table-name license-portal-terraform-locks \
  --attribute-definitions AttributeName=LockID,AttributeType=S \
  --key-schema AttributeName=LockID,KeyType=HASH \
  --billing-mode PAY_PER_REQUEST \
  --region us-east-1 \
  --profile platform-admin
```

### 2.6 Verify Both Resources

```bash
# Verify S3 bucket
aws s3api head-bucket --bucket license-portal-terraform-state --profile platform-admin
echo "✅ S3 state bucket exists"

# Verify versioning
aws s3api get-bucket-versioning \
  --bucket license-portal-terraform-state --profile platform-admin
# Expected: {"Status": "Enabled"}

# Verify encryption
aws s3api get-bucket-encryption \
  --bucket license-portal-terraform-state --profile platform-admin
# Expected: SSEAlgorithm = aws:kms

# Verify public access blocked
aws s3api get-public-access-block \
  --bucket license-portal-terraform-state --profile platform-admin
# Expected: all four = true

# Verify DynamoDB lock table
aws dynamodb describe-table \
  --table-name license-portal-terraform-locks \
  --query 'Table.{Name:TableName,Status:TableStatus}' \
  --profile platform-admin --region us-east-1
# Expected: Status = ACTIVE
```

**📝 Record these values:**
```
TF_STATE_BUCKET:     license-portal-terraform-state
TF_STATE_LOCK_TABLE: license-portal-terraform-locks
```

**✅ Checkpoint**: Remote state backend created and verified.

---

## Step 3: Migrate Existing Terraform State to S3

If you already ran `terraform apply` locally in Phase 1, your state file is stored locally. This step migrates it to S3.

### 3.1 Create Backend Configuration

```bash
cd docs/nestjs-backend/terraform

cat > backend.tf << 'EOF'
terraform {
  backend "s3" {
    bucket         = "license-portal-terraform-state"
    key            = "dev/terraform.tfstate"
    region         = "us-east-1"
    dynamodb_table = "license-portal-terraform-locks"
    encrypt        = true
  }
}
EOF
```

### 3.2 Migrate State

```bash
terraform init -migrate-state
```

Terraform will prompt:
```
Do you want to copy existing state to the new backend?
  Enter a value: yes
```

Type `yes` and press Enter.

### 3.3 Verify Remote State

```bash
# List all resources — should show Phase 1 resources
terraform state list

# Expected output includes:
# module.cognito.aws_cognito_user_pool.main
# module.lambda.aws_lambda_function.api
# module.api_gateway.aws_apigatewayv2_api.main
# ... etc
```

### 3.4 Verify State File in S3

```bash
aws s3 ls s3://license-portal-terraform-state/dev/ --profile platform-admin
# Expected: terraform.tfstate file present
```

### 3.5 (Optional) Remove Local State File

```bash
# Only after confirming remote state works!
rm -f terraform.tfstate terraform.tfstate.backup
```

**✅ Checkpoint**: Terraform state migrated to S3 with DynamoDB locking.

---

## Step 4: Create CI/CD IAM User

> ⚠️ **Never reuse your personal admin credentials for CI/CD.** Create a dedicated user with least-privilege permissions.

### 4.1 Create the IAM User

```bash
aws iam create-user \
  --user-name github-actions-deployer \
  --profile platform-admin
```

### 4.2 Create the Least-Privilege Policy

```bash
cat > /tmp/github-deployer-policy.json << 'POLICY'
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "TerraformStateAccess",
      "Effect": "Allow",
      "Action": [
        "s3:GetObject", "s3:PutObject", "s3:DeleteObject", "s3:ListBucket"
      ],
      "Resource": [
        "arn:aws:s3:::license-portal-terraform-state",
        "arn:aws:s3:::license-portal-terraform-state/*"
      ]
    },
    {
      "Sid": "TerraformLockAccess",
      "Effect": "Allow",
      "Action": [
        "dynamodb:GetItem", "dynamodb:PutItem", "dynamodb:DeleteItem"
      ],
      "Resource": "arn:aws:dynamodb:us-east-1:*:table/license-portal-terraform-locks"
    },
    {
      "Sid": "LambdaDeploy",
      "Effect": "Allow",
      "Action": [
        "lambda:UpdateFunctionCode", "lambda:UpdateFunctionConfiguration",
        "lambda:GetFunction", "lambda:GetFunctionConfiguration",
        "lambda:PublishVersion", "lambda:CreateAlias", "lambda:UpdateAlias",
        "lambda:GetFunctionUrlConfig", "lambda:InvokeFunction",
        "lambda:ListVersionsByFunction"
      ],
      "Resource": "arn:aws:lambda:us-east-1:*:function:license-portal-*"
    },
    {
      "Sid": "LambdaWait",
      "Effect": "Allow",
      "Action": ["lambda:GetFunction"],
      "Resource": "*"
    },
    {
      "Sid": "S3FrontendDeploy",
      "Effect": "Allow",
      "Action": [
        "s3:PutObject", "s3:GetObject", "s3:DeleteObject",
        "s3:ListBucket", "s3:GetBucketVersioning",
        "s3:ListBucketVersions", "s3:GetObjectVersion",
        "s3:CopyObject", "s3:HeadObject", "s3:HeadBucket"
      ],
      "Resource": [
        "arn:aws:s3:::license-portal-*-frontend",
        "arn:aws:s3:::license-portal-*-frontend/*"
      ]
    },
    {
      "Sid": "TerraformInfraManagement",
      "Effect": "Allow",
      "Action": [
        "cognito-idp:*",
        "apigateway:*",
        "execute-api:*",
        "wafv2:*",
        "secretsmanager:*",
        "states:*",
        "events:*",
        "sqs:*",
        "sns:*",
        "ses:*",
        "ssm:*",
        "cloudwatch:*",
        "logs:*",
        "dynamodb:*",
        "iam:PassRole",
        "iam:GetRole",
        "iam:CreateRole",
        "iam:AttachRolePolicy",
        "iam:PutRolePolicy",
        "iam:GetRolePolicy",
        "iam:ListRolePolicies",
        "iam:ListAttachedRolePolicies",
        "iam:DeleteRolePolicy",
        "iam:DeleteRole",
        "iam:DetachRolePolicy",
        "iam:TagRole",
        "iam:UntagRole",
        "iam:ListInstanceProfilesForRole",
        "iam:CreateServiceLinkedRole"
      ],
      "Resource": "*",
      "Condition": {
        "StringEquals": {
          "aws:RequestedRegion": "us-east-1"
        }
      }
    }
  ]
}
POLICY
```

> **📝 Note**: This policy intentionally **excludes** CloudFront permissions since we're not using it yet. When CloudFront is enabled later, add the `CloudFrontInvalidate` statement (see [How to Add CloudFront Later](#how-to-add-cloudfront-later)).

### 4.3 Attach the Policy

```bash
aws iam put-user-policy \
  --user-name github-actions-deployer \
  --policy-name GitHubActionsDeployPolicy \
  --policy-document file:///tmp/github-deployer-policy.json \
  --profile platform-admin
```

### 4.4 Create Access Key

```bash
aws iam create-access-key \
  --user-name github-actions-deployer \
  --profile platform-admin
```

**📝 Save these securely** (you'll need them in Step 5):
```
CI/CD Access Key ID:     AKIA___________________
CI/CD Secret Access Key: ________________________
```

> **🔒 Production Tip**: For production, use [GitHub OIDC federation](https://docs.github.com/en/actions/deployment/security-hardening-your-deployments/configuring-openid-connect-in-amazon-web-services) instead of long-lived access keys. This eliminates key rotation requirements entirely.

### 4.5 Verify the User

```bash
aws iam get-user \
  --user-name github-actions-deployer \
  --profile platform-admin

aws iam list-user-policies \
  --user-name github-actions-deployer \
  --profile platform-admin
# Expected: GitHubActionsDeployPolicy
```

**✅ Checkpoint**: CI/CD IAM user created with least-privilege policy.

---

## Step 5: Configure GitHub Repository Secrets

These are **repository-level** secrets shared across all environments (dev, qa, prod).

> 📋 **See also**: [GITHUB-SECRETS-CHEATSHEET.md](./GITHUB-SECRETS-CHEATSHEET.md) for a single-page reference of all secrets.

### 5.1 Ensure GitHub CLI Is Authenticated

```bash
gh auth status
# If not logged in:
gh auth login
```

### 5.2 Set Repository Secrets

```bash
gh secret set AWS_ACCESS_KEY_ID       --body "AKIA...your-deployer-key..."
gh secret set AWS_SECRET_ACCESS_KEY   --body "wJalr...your-deployer-secret..."
gh secret set AWS_REGION              --body "us-east-1"
gh secret set TF_STATE_BUCKET         --body "license-portal-terraform-state"
gh secret set TF_STATE_LOCK_TABLE     --body "license-portal-terraform-locks"
```

> ⚠️ Replace the placeholder values with the actual CI/CD user credentials from Step 4.4.

### 5.3 Verify Repository Secrets

```bash
gh secret list
# Expected: 5 secrets
# AWS_ACCESS_KEY_ID          Updated <timestamp>
# AWS_SECRET_ACCESS_KEY      Updated <timestamp>
# AWS_REGION                 Updated <timestamp>
# TF_STATE_BUCKET            Updated <timestamp>
# TF_STATE_LOCK_TABLE        Updated <timestamp>
```

**✅ Checkpoint**: 5 repository-level secrets configured.

---

## Step 6: Add CI/CD Environment Secrets

Phase 1 (Step 13) already created GitHub Environments and set the frontend/Cognito secrets. This step adds the **CI/CD-specific** secrets that were not needed during Phase 1.

### 6.1 Set CI/CD Secrets for `dev`

```bash
ENV=dev

# Get values from Terraform outputs
COGNITO_POOL=$(terraform -chdir=docs/nestjs-backend/terraform output -raw cognito_user_pool_id)

gh secret set DYNAMODB_TABLE_NAME      --env $ENV --body "dev_data"
gh secret set COGNITO_USER_POOL_ID     --env $ENV --body "$COGNITO_POOL"
gh secret set BOOTSTRAP_ADMIN_PASSWORD --env $ENV --body "Adminuser@123"

echo "✅ $ENV CI/CD-specific secrets configured"
```

### 6.2 Set the Frontend S3 Bucket Secret

If not already set during Phase 1:

```bash
gh secret set FRONTEND_S3_BUCKET --env $ENV --body "license-portal-dev-frontend"
```

> **📝 Note**: `FRONTEND_CLOUDFRONT_DISTRIBUTION_ID` is intentionally **not set** — the frontend deployment pipeline gracefully skips CloudFront invalidation when this secret is empty.

**✅ Checkpoint**: CI/CD environment secrets added for `dev`.

---

## Step 7: Verify All Secrets

Confirm that all Phase 1 + Phase 2 secrets are present.

### 7.1 Repository Secrets

```bash
gh secret list
# Expected: 5 secrets
```

### 7.2 Environment Secrets

```bash
gh secret list --env dev
```

Expected output (8 secrets total):

| Secret | Source |
|--------|--------|
| `VITE_API_BASE_URL` | Phase 1, Step 13 |
| `VITE_COGNITO_USER_POOL_ID` | Phase 1, Step 13 |
| `VITE_COGNITO_CLIENT_ID` | Phase 1, Step 13 |
| `VITE_COGNITO_DOMAIN` | Phase 1, Step 13 |
| `FRONTEND_S3_BUCKET` | Phase 2, Step 6 |
| `DYNAMODB_TABLE_NAME` | Phase 2, Step 6 |
| `COGNITO_USER_POOL_ID` | Phase 2, Step 6 |
| `BOOTSTRAP_ADMIN_PASSWORD` | Phase 2, Step 6 |

> **📝 Note**: `COGNITO_USER_POOL_ID` and `VITE_COGNITO_USER_POOL_ID` have the same value but different names — one is for backend runtime (bootstrap scripts), the other for frontend build-time injection.

**✅ Checkpoint**: All 13 secrets verified (5 repo + 8 env).

---

## Step 8: Copy Workflow Files to Repository Root

The CI/CD workflow files are in `docs/nestjs-backend/.github/workflows/`. They need to be at the repository root `.github/workflows/` for GitHub Actions to detect them.

### 8.1 Copy Workflow Files

```bash
# From the repository root
mkdir -p .github/workflows

cp docs/nestjs-backend/.github/workflows/workspace-pipeline.yml .github/workflows/
cp docs/nestjs-backend/.github/workflows/deploy-frontend.yml .github/workflows/
cp docs/nestjs-backend/.github/workflows/ci.yml .github/workflows/
cp docs/nestjs-backend/.github/workflows/pr-validation.yml .github/workflows/
cp docs/nestjs-backend/.github/workflows/scheduled.yml .github/workflows/
cp docs/nestjs-backend/.github/workflows/post-deploy-verify.yml .github/workflows/
cp docs/nestjs-backend/.github/workflows/rollback-frontend.yml .github/workflows/
cp docs/nestjs-backend/.github/workflows/destroy-infrastructure.yml .github/workflows/
```

### 8.2 Verify Workflow Files Are in Place

```bash
ls -la .github/workflows/
# Expected: 8 workflow files
```

### 8.3 Commit and Push

```bash
git add .github/workflows/
git commit -m "ci: add CI/CD workflow files for Phase 2"
git push origin main
```

> **📝 Note**: The push to `main` will trigger the `workspace-pipeline.yml` if it detects changes in `docs/nestjs-backend/`. If this is a workflow-only commit, it will only trigger on manual dispatch.

**✅ Checkpoint**: All 8 workflow files committed to `.github/workflows/`.

---

## Step 9: Test Workspace Pipeline (Backend)

The workspace pipeline handles: CI checks → Build Lambda → Terraform Plan/Apply → Deploy Lambda → Smoke Test → Bootstrap Verify.

### 9.1 Trigger Manual Pipeline Run

```bash
gh workflow run "workspace-pipeline.yml" \
  --field workspace=dev \
  --field skip_ci=false \
  --field deploy_infra=true \
  --field deploy_app=true
```

### 9.2 Watch the Run

```bash
gh run watch
```

Or monitor in the GitHub Actions UI: `https://github.com/YOUR-ORG/license-portal/actions`

### 9.3 Expected Job Results

| Job | Expected Result |
|-----|----------------|
| 🔧 Resolve Workspace | `dev`, function name `license-portal-dev-api` |
| ✅ CI Checks | Lint, test, build all pass |
| 📦 Build Lambda Package | Package < 50MB, hash generated |
| 📋 Terraform Plan | Shows existing resources (no changes if Phase 1 just completed) |
| 🏗️ Terraform Apply | Skipped (no changes) or succeeds |
| 🚀 Deploy Lambda | Function updated, version published |
| 🧪 Smoke Test | Health check returns 200 |
| 🔍 Bootstrap Verify | 14+ checks pass |
| 📊 Pipeline Summary | All steps green |

### 9.4 Troubleshooting Common Failures

| Error | Cause | Fix |
|-------|-------|-----|
| `AWS credentials not configured` | Missing repo secrets | Re-run Step 5 |
| `Terraform state lock` | Stale lock from previous run | `terraform force-unlock <LOCK_ID>` |
| `Lambda function not found` | Wrong function name | Check `terraform output lambda_function_name` |
| `npm ci` fails | Missing `package-lock.json` | Run `npm install` locally and commit the lockfile |
| `Smoke test 401` | Expected — unauthenticated endpoints return 401 | 401 is acceptable (means API is running) |

### 9.5 Verify Pipeline Artifacts

```bash
# List recent workflow runs
gh run list --workflow="workspace-pipeline.yml" --limit 3

# Download artifacts from the latest run
RUN_ID=$(gh run list --workflow="workspace-pipeline.yml" --limit 1 --json databaseId -q '.[0].databaseId')
gh run download $RUN_ID
```

**✅ Checkpoint**: Workspace pipeline runs end-to-end successfully.

---

## Step 10: Test Frontend Deployment Pipeline

The frontend pipeline handles: Quality checks → Build Vite → Upload to S3 → CloudFront invalidation (skipped without CloudFront).

### 10.1 Trigger Manual Frontend Deploy

```bash
gh workflow run "deploy-frontend.yml" \
  --field workspace=dev \
  --field skip_tests=false \
  --field invalidate_all=false
```

### 10.2 Watch the Run

```bash
gh run watch
```

### 10.3 Expected Job Results

| Job | Expected Result |
|-----|----------------|
| 🔧 Resolve Workspace | `dev`, S3 bucket derived |
| ✅ Quality Checks | ESLint, TypeScript, tests (warnings OK) |
| 📦 Build | Vite production build succeeds |
| 🚀 Deploy | S3 upload succeeds, CloudFront invalidation **skipped** |

> **📝 Note**: The `CloudFront invalidation` step will show as skipped with a notice: *"FRONTEND_CLOUDFRONT_DISTRIBUTION_ID secret not set"*. This is expected when running without CloudFront.

### 10.4 Verify Frontend Is Live

```bash
# S3 Static Website URL
S3_URL="http://license-portal-dev-frontend.s3-website-us-east-1.amazonaws.com"
curl -s -o /dev/null -w "%{http_code}" "$S3_URL"
# Expected: 200
```

**✅ Checkpoint**: Frontend deployment pipeline runs successfully (S3 only, no CloudFront).

---

## Step 11: Test Auto-Trigger on Push

Verify that pushes to `main` automatically trigger the appropriate pipeline.

### 11.1 Test Backend Auto-Trigger

```bash
# Make a trivial backend change
echo "// CI trigger test $(date +%s)" >> docs/nestjs-backend/src/main.ts
git add . && git commit -m "test: verify backend CI pipeline auto-trigger" && git push

# Wait ~10 seconds, then check
gh run list --workflow="workspace-pipeline.yml" --limit 1
# Expected: A new run triggered by "push"
```

### 11.2 Test Frontend Auto-Trigger

```bash
# Make a trivial frontend change
echo "/* CI trigger test $(date +%s) */" >> src/App.css
git add . && git commit -m "test: verify frontend CI pipeline auto-trigger" && git push

# Wait ~10 seconds, then check
gh run list --workflow="deploy-frontend.yml" --limit 1
# Expected: A new run triggered by "push"
```

### 11.3 Revert Test Changes

```bash
git revert HEAD~2..HEAD --no-edit
git push
```

**✅ Checkpoint**: Auto-triggers working for both backend and frontend.

---

## Step 12: Set Up QA & Prod Environments

Repeat the environment secret configuration for QA and Prod. These environments use separate DynamoDB tables and Cognito pools.

### 12.1 Create QA Infrastructure (If Needed)

```bash
cd docs/nestjs-backend/terraform

# Create QA workspace
terraform workspace new qa

# Apply QA infrastructure
terraform apply -var-file=environments/qa.tfvars
```

### 12.2 Set QA Secrets

```bash
ENV=qa
QA_COGNITO_POOL=$(terraform output -raw cognito_user_pool_id)
QA_COGNITO_CLIENT=$(terraform output -raw cognito_client_id)
QA_COGNITO_DOMAIN=$(terraform output -raw cognito_domain)
QA_API_URL=$(terraform output -raw api_gateway_stage_url)

# Phase 1 equivalents for QA
gh secret set VITE_API_BASE_URL        --env $ENV --body "$QA_API_URL"
gh secret set VITE_COGNITO_USER_POOL_ID --env $ENV --body "$QA_COGNITO_POOL"
gh secret set VITE_COGNITO_CLIENT_ID   --env $ENV --body "$QA_COGNITO_CLIENT"
gh secret set VITE_COGNITO_DOMAIN      --env $ENV --body "$QA_COGNITO_DOMAIN"
gh secret set FRONTEND_S3_BUCKET       --env $ENV --body "license-portal-qa-frontend"

# Phase 2 CI/CD-specific
gh secret set DYNAMODB_TABLE_NAME      --env $ENV --body "qa_data"
gh secret set COGNITO_USER_POOL_ID     --env $ENV --body "$QA_COGNITO_POOL"
gh secret set BOOTSTRAP_ADMIN_PASSWORD --env $ENV --body "Adminuser@123"

echo "✅ QA secrets configured"
```

### 12.3 Set Prod Secrets

Repeat for `prod` (with `prod_data` table and production Cognito pool).

### 12.4 Configure Prod Environment Protection

In GitHub: **Settings → Environments → prod → Protection rules**:

- ✅ **Required reviewers**: Add at least 1 reviewer
- ✅ **Wait timer**: 5 minutes (gives time to cancel accidental deploys)
- ⬜ **Restrict branches**: Only `main` (optional but recommended)

### 12.5 Verify QA Pipeline

```bash
gh workflow run "workspace-pipeline.yml" \
  --field workspace=qa \
  --field skip_ci=true \
  --field deploy_infra=true \
  --field deploy_app=true

gh run watch
```

**✅ Checkpoint**: QA (and optionally Prod) environments configured and tested.

---

## Step 13: Configure Nightly Pre-Flight Checks

The `scheduled.yml` workflow runs nightly pre-flight checks and reports results via SNS and Slack.

### 13.1 Verify Scheduled Workflow

The workflow file (`scheduled.yml`) is already copied in Step 8. It runs on a cron schedule:

```yaml
on:
  schedule:
    - cron: '0 6 * * *'  # 6 AM UTC daily
```

### 13.2 Add SNS Topic ARN (Optional)

If you want pipeline failure notifications via SNS:

```bash
# Get SNS topic ARN from Terraform
SNS_CRITICAL=$(terraform -chdir=docs/nestjs-backend/terraform output -raw sns_critical_topic_arn 2>/dev/null || echo "")

if [ -n "$SNS_CRITICAL" ]; then
  gh secret set SNS_CRITICAL_TOPIC_ARN --env dev --body "$SNS_CRITICAL"
  echo "✅ SNS alert topic configured"
else
  echo "⚠️ No SNS topic found — skipping"
fi
```

### 13.3 Test the Scheduled Workflow Manually

```bash
gh workflow run "scheduled.yml"
gh run watch
```

**✅ Checkpoint**: Nightly pre-flight checks configured.

---

## Step 14: Final Verification & Checklist

### 14.1 Complete Verification Script

Run the full verification across all configured items:

```bash
echo "═══════════════════════════════════════════════════════"
echo " Phase 2 Final Verification"
echo "═══════════════════════════════════════════════════════"

# 1. Remote state
echo -n "1. Terraform remote state... "
aws s3 ls s3://license-portal-terraform-state/dev/ --profile platform-admin > /dev/null 2>&1 && echo "✅" || echo "❌"

# 2. Lock table
echo -n "2. State lock table... "
aws dynamodb describe-table --table-name license-portal-terraform-locks --profile platform-admin --query 'Table.TableStatus' --output text 2>/dev/null | grep -q "ACTIVE" && echo "✅" || echo "❌"

# 3. CI/CD IAM user
echo -n "3. CI/CD IAM user... "
aws iam get-user --user-name github-actions-deployer --profile platform-admin > /dev/null 2>&1 && echo "✅" || echo "❌"

# 4. Repository secrets
echo -n "4. Repository secrets (5)... "
REPO_COUNT=$(gh secret list --json name -q 'length')
[ "$REPO_COUNT" -ge 5 ] && echo "✅ ($REPO_COUNT)" || echo "❌ ($REPO_COUNT)"

# 5. Environment secrets
echo -n "5. Dev environment secrets (8+)... "
ENV_COUNT=$(gh secret list --env dev --json name -q 'length')
[ "$ENV_COUNT" -ge 8 ] && echo "✅ ($ENV_COUNT)" || echo "❌ ($ENV_COUNT)"

# 6. Workflow files
echo -n "6. Workflow files... "
[ -f ".github/workflows/workspace-pipeline.yml" ] && echo "✅" || echo "❌"

# 7. Backend pipeline
echo -n "7. Backend pipeline ran... "
BACKEND_RUNS=$(gh run list --workflow="workspace-pipeline.yml" --limit 1 --json conclusion -q '.[0].conclusion')
[ "$BACKEND_RUNS" == "success" ] && echo "✅" || echo "⚠️ ($BACKEND_RUNS)"

# 8. Frontend pipeline
echo -n "8. Frontend pipeline ran... "
FRONTEND_RUNS=$(gh run list --workflow="deploy-frontend.yml" --limit 1 --json conclusion -q '.[0].conclusion')
[ "$FRONTEND_RUNS" == "success" ] && echo "✅" || echo "⚠️ ($FRONTEND_RUNS)"

echo ""
echo "═══════════════════════════════════════════════════════"
echo " Phase 2 Complete!"
echo "═══════════════════════════════════════════════════════"
```

### 14.2 Summary of What Was Created

| Resource | Location | Purpose |
|----------|----------|---------|
| S3 bucket `license-portal-terraform-state` | Platform Admin account | Terraform state storage |
| DynamoDB table `license-portal-terraform-locks` | Platform Admin account | Terraform state locking |
| `backend.tf` | `docs/nestjs-backend/terraform/` | Remote state configuration |
| IAM user `github-actions-deployer` | Platform Admin account | CI/CD pipeline credentials |
| 5 repository secrets | GitHub | AWS credentials + state config |
| 8+ environment secrets per workspace | GitHub | Workspace-specific config |
| 8 workflow files | `.github/workflows/` | CI/CD pipelines |

### 14.3 What's Next

With Phase 2 complete, you can:

1. **Phase 3**: Migrate the frontend from Supabase Auth to Cognito and refactor hooks to use the NestJS API layer
2. **Phase 4**: Run the data migration from Supabase to DynamoDB
3. **Add CloudFront**: When the service quota is approved (see below)

**✅ Phase 2 Complete — CI/CD pipeline fully operational!**

---

## How to Add CloudFront Later

When your AWS CloudFront service quota increase is approved:

### 1. Update Terraform Variables

```bash
cd docs/nestjs-backend/terraform

# Edit the appropriate tfvars file
# Set: enable_frontend_hosting = true
```

### 2. Apply Terraform

```bash
terraform workspace select dev
terraform apply -var-file=environments/dev.tfvars
```

### 3. Get CloudFront Distribution ID

```bash
CF_DIST=$(terraform output -raw frontend_distribution_id)
echo "CloudFront Distribution ID: $CF_DIST"
```

### 4. Add GitHub Secret

```bash
gh secret set FRONTEND_CLOUDFRONT_DISTRIBUTION_ID --env dev --body "$CF_DIST"
```

### 5. Update IAM Policy (Add CloudFront Permissions)

```bash
# Add this statement to the github-actions-deployer policy:
# {
#   "Sid": "CloudFrontInvalidate",
#   "Effect": "Allow",
#   "Action": [
#     "cloudfront:CreateInvalidation",
#     "cloudfront:GetInvalidation",
#     "cloudfront:GetDistribution",
#     "cloudfront:ListDistributions"
#   ],
#   "Resource": "*"
# }
```

### 6. Re-Run Frontend Pipeline

```bash
gh workflow run "deploy-frontend.yml" \
  --field workspace=dev \
  --field invalidate_all=true

gh run watch
# CloudFront invalidation should now execute instead of being skipped
```

### 7. (Optional) Add Custom Domain Secret

```bash
gh secret set FRONTEND_CUSTOM_DOMAIN --env dev --body "app.example.com"
```

**✅ CloudFront fully integrated — future deploys will automatically invalidate the CDN cache.**

---

> 📖 **Related docs**: [PHASE1-END-TO-END-EXECUTION.md](./PHASE1-END-TO-END-EXECUTION.md) · [MIGRATION-CHECKLIST.md](./MIGRATION-CHECKLIST.md) · [GITHUB-SECRETS-CHEATSHEET.md](./GITHUB-SECRETS-CHEATSHEET.md) · [ARCHITECTURE.md](./ARCHITECTURE.md) · [NEXT-STEPS.md](./NEXT-STEPS.md)
>
> *Document created: 2026-02-09 · Aligned with Phase 1 (no CloudFront) configuration*
