# GitHub Setup — Complete Guide

> **After checking out this repo, follow these steps. That's it.**

---

## The Full Flow (Start to Finish)

```
┌─────────────────────────────────────────────────────────┐
│  YOU DO ONCE (5 minutes)                                │
│                                                         │
│  1. Create 3 GitHub Environments (dev, staging, prod)   │
│  2. Set 4 repository secrets (AWS keys for 2 accounts)  │
│  3. Run workflow "00 · Init Prerequisites"              │
│  4. Copy-paste commands from workflow output             │
│  5. Delete the 4 static key secrets                     │
│  6. Run "01 · Bootstrap Platform Admin"                 │
│  7. Run "02 · Bootstrap Customer Account"               │
│  8. Set 6 secrets from Terraform outputs                │
│                                                         │
│  EVERYTHING ELSE IS AUTOMATIC                           │
│  Push code → CI → Deploy → Verify → Done                │
└─────────────────────────────────────────────────────────┘
```

---

## Step 1: Create GitHub Environments

> **Settings → Environments → New environment**

| Environment | Protection Rules |
|-------------|-----------------|
| `dev` | None |
| `staging` | Optional: require reviewer |
| `prod` | Required: reviewer(s) |

---

## Step 2: Set 4 Repository Secrets

> **Settings → Secrets and variables → Actions → New repository secret**
>
> These are temporary — you'll delete them after Step 4.

| Secret | What It Is | Where to Get It |
|--------|-----------|-----------------|
| `AWS_ACCESS_KEY_ID_PLATFORM_ADMIN` | Access Key for Platform Admin Account (Account 2) | IAM → Users → Security credentials → Create access key |
| `AWS_SECRET_ACCESS_KEY_PLATFORM_ADMIN` | Secret Key for Platform Admin Account | Same as above |
| `AWS_ACCESS_KEY_ID_CUSTOMER` | Access Key for Customer Account (Account 3) | IAM → Users → Security credentials → Create access key |
| `AWS_SECRET_ACCESS_KEY_CUSTOMER` | Secret Key for Customer Account | Same as above |

> **⚠️ Use an admin or power-user IAM user for each account.** These keys are only used once.

---

## Step 3: Run Workflow 00

> **Actions → "00 · Init Prerequisites" → Run workflow**

Fill in the form:

| Field | Value |
|-------|-------|
| AWS Region | `us-east-1` |
| Project name | `license-portal` |
| Platform Admin Account ID | Your Account 2 ID |
| Customer Account ID | Your Account 3 ID |
| Confirmation | `INIT` |

**This automatically creates:**
- ✅ OIDC Identity Provider (GitHub → AWS trust)
- ✅ Platform Admin IAM Role (Account 2)
- ✅ Customer Account IAM Role (Account 3, trusted by Account 2)
- ✅ S3 bucket for Terraform state
- ✅ DynamoDB table for Terraform locking

---

## Step 4: Copy-Paste from Workflow Output

When workflow 00 completes, open the **Summary** tab. It gives you exact `gh` CLI commands:

```bash
# Set repository variables
gh variable set PROJECT_NAME --body "license-portal"
gh variable set AWS_REGION   --body "us-east-1"

# Set environment secrets for dev (repeat for staging/prod)
ENV=dev
gh secret set PLATFORM_ADMIN_ROLE_ARN    --env $ENV --body "arn:aws:iam::XXXX:role/license-portal-gh-platform-admin"
gh secret set CUSTOMER_ACCOUNT_ROLE_ARN  --env $ENV --body "arn:aws:iam::YYYY:role/license-portal-gh-customer-account"
gh secret set TF_STATE_BUCKET            --env $ENV --body "license-portal-terraform-state"
gh secret set TF_LOCK_TABLE              --env $ENV --body "license-portal-terraform-locks"
gh secret set PLATFORM_ADMIN_ACCOUNT_ID  --env $ENV --body "XXXX"
gh secret set CROSS_ACCOUNT_EXTERNAL_ID  --env $ENV --body "license-portal-xaccount-2025"
gh secret set BOOTSTRAP_ADMIN_PASSWORD   --env $ENV --body "YourStrongPassword@2025"

# DELETE static keys — never needed again!
gh secret delete AWS_ACCESS_KEY_ID_PLATFORM_ADMIN
gh secret delete AWS_SECRET_ACCESS_KEY_PLATFORM_ADMIN
gh secret delete AWS_ACCESS_KEY_ID_CUSTOMER
gh secret delete AWS_SECRET_ACCESS_KEY_CUSTOMER
```

---

## Step 5: Run Bootstrap Workflows

```bash
# Creates Cognito, Lambda, API Gateway, S3, DynamoDB in Platform Admin Account
gh workflow run "01 · Bootstrap Platform Admin" -f environment=dev

# Wait for completion (~5 min), then:
# Creates DynamoDB + cross-account IAM in Customer Account
gh workflow run "02 · Bootstrap Customer Account" -f environment=dev
```

---

## Step 6: Set Terraform Output Secrets

After bootstrapping, Terraform creates resources whose IDs you need as secrets:

```bash
cd infra/control-plane/terraform
ENV=dev

gh secret set VITE_API_BASE_URL         --env $ENV --body "$(terraform output -raw api_gateway_url)"
gh secret set VITE_COGNITO_USER_POOL_ID --env $ENV --body "$(terraform output -raw cognito_user_pool_id)"
gh secret set VITE_COGNITO_CLIENT_ID    --env $ENV --body "$(terraform output -raw cognito_client_id)"
gh secret set VITE_COGNITO_DOMAIN       --env $ENV --body "$(terraform output -raw cognito_domain)"
gh secret set COGNITO_USER_POOL_ID      --env $ENV --body "$(terraform output -raw cognito_user_pool_id)"
gh secret set DYNAMODB_TABLE_NAME       --env $ENV --body "$(terraform output -raw control_plane_dynamodb_table)"
```

---

## ✅ Done! Everything Is Automatic Now

| What Happens | Trigger | Workflow |
|-------------|---------|----------|
| Code pushed to branch | `git push` | **03 · CI** runs lint, test, build, security |
| PR opened | Pull request | **03 · CI** + Terraform plan + PR summary |
| Merged to main (backend/) | Auto | **04 · Deploy Backend** → Lambda |
| Merged to main (frontend/) | Auto | **05 · Deploy Frontend** → S3 + CloudFront |
| After any deploy | Auto | **06 · Verify** runs post-deploy checks |
| Every night 2am UTC | Cron | **06 · Verify** runs pre-flight + bootstrap check |
| Every Monday 9am UTC | Cron | **06 · Verify** runs security audit |
| Something breaks | Manual | **07 · Rollback** (type ROLLBACK to confirm) |

---

## Complete Secrets Reference

### Repository Variables (2)

| Variable | Value |
|----------|-------|
| `PROJECT_NAME` | `license-portal` |
| `AWS_REGION` | `us-east-1` |

### Environment Secrets per env (13 total)

| # | Secret | Set When | Source |
|---|--------|----------|--------|
| 1 | `PLATFORM_ADMIN_ROLE_ARN` | After workflow 00 | Workflow 00 output |
| 2 | `CUSTOMER_ACCOUNT_ROLE_ARN` | After workflow 00 | Workflow 00 output |
| 3 | `TF_STATE_BUCKET` | After workflow 00 | Workflow 00 output |
| 4 | `TF_LOCK_TABLE` | After workflow 00 | Workflow 00 output |
| 5 | `PLATFORM_ADMIN_ACCOUNT_ID` | After workflow 00 | Your Account 2 ID |
| 6 | `CROSS_ACCOUNT_EXTERNAL_ID` | After workflow 00 | Workflow 00 output |
| 7 | `BOOTSTRAP_ADMIN_PASSWORD` | After workflow 00 | You choose |
| 8 | `VITE_API_BASE_URL` | After workflow 01 | `terraform output` |
| 9 | `VITE_COGNITO_USER_POOL_ID` | After workflow 01 | `terraform output` |
| 10 | `VITE_COGNITO_CLIENT_ID` | After workflow 01 | `terraform output` |
| 11 | `VITE_COGNITO_DOMAIN` | After workflow 01 | `terraform output` |
| 12 | `COGNITO_USER_POOL_ID` | After workflow 01 | `terraform output` |
| 13 | `DYNAMODB_TABLE_NAME` | After workflow 01 | `terraform output` |

### Optional Secrets (add when needed)

| Secret | Purpose |
|--------|---------|
| `FRONTEND_S3_BUCKET` | Override auto-derived bucket name |
| `FRONTEND_CLOUDFRONT_DISTRIBUTION_ID` | Enable CloudFront invalidation |
| `FRONTEND_CUSTOM_DOMAIN` | Custom domain health checks |
| `SNS_CRITICAL_TOPIC_ARN` | SNS critical alerts |
| `SNS_WARNING_TOPIC_ARN` | SNS warning alerts |
| `SLACK_PREFLIGHT_WEBHOOK_URL` | Slack notifications |
| `SNYK_TOKEN` | Security scanning |

---

## Workflow → Secrets Matrix

| Workflow | Secrets Used |
|----------|-------------|
| **00 · Init** | `AWS_ACCESS_KEY_ID_PLATFORM_ADMIN`, `AWS_SECRET_ACCESS_KEY_PLATFORM_ADMIN`, `AWS_ACCESS_KEY_ID_CUSTOMER`, `AWS_SECRET_ACCESS_KEY_CUSTOMER` |
| **01 · Bootstrap Platform Admin** | `PLATFORM_ADMIN_ROLE_ARN`, `TF_STATE_BUCKET`, `TF_LOCK_TABLE` |
| **02 · Bootstrap Customer Account** | `PLATFORM_ADMIN_ROLE_ARN`, `CUSTOMER_ACCOUNT_ROLE_ARN`, `TF_STATE_BUCKET`, `TF_LOCK_TABLE`, `PLATFORM_ADMIN_ACCOUNT_ID`, `CROSS_ACCOUNT_EXTERNAL_ID` |
| **03 · CI** | `PLATFORM_ADMIN_ROLE_ARN`, `TF_STATE_BUCKET`, `TF_LOCK_TABLE` |
| **04 · Deploy Backend** | `PLATFORM_ADMIN_ROLE_ARN` |
| **05 · Deploy Frontend** | `PLATFORM_ADMIN_ROLE_ARN`, `VITE_*` (4 secrets) |
| **06 · Verify** | `PLATFORM_ADMIN_ROLE_ARN`, `DYNAMODB_TABLE_NAME`, `COGNITO_USER_POOL_ID`, `BOOTSTRAP_ADMIN_PASSWORD` |
| **07 · Rollback** | `PLATFORM_ADMIN_ROLE_ARN` |

---

## Verify Setup

```bash
gh variable list                    # → PROJECT_NAME, AWS_REGION
gh secret list --env dev            # → 13 secrets
gh workflow list                    # → 8 workflows (00–07)
```

---

> 📖 **Related**: [ARCHITECTURE.md](./ARCHITECTURE.md) · [REPO-STRUCTURE.md](./REPO-STRUCTURE.md)
