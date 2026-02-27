# GitHub Actions — Execution Sequence

Execute workflows in this exact numeric order. Each step depends on the previous.

## Execution Order (8 Workflows)

| # | File | Trigger | Purpose | Depends On |
|---|------|---------|---------|------------|
| **00** | `00-init-prerequisites.yml` | Manual (once) | Create OIDC provider, IAM roles, TF state backend | — |
| **01** | `01-bootstrap-platform-admin.yml` | Manual | Provision Cognito, Lambda, API GW, DynamoDB, S3, Monitoring | 00 |
| **02** | `02-bootstrap-customer-account.yml` | Manual | Provision customer DynamoDB + cross-account IAM role | 00, 01 |
| **03** | `03-ci-pr-validation.yml` | Push / PR | Lint, test, build, security scan, Terraform validate + plan | 01, 02 |
| **04** | `04-deploy-backend.yml` | Push to `main` / Manual | Build NestJS → package → deploy to Lambda | 01 |
| **05** | `05-deploy-frontend.yml` | Push to `main` / Manual | Build Vite → S3 upload → CloudFront invalidation | 01 |
| **06** | `06-verify-and-maintenance.yml` | After deploy / Nightly / Weekly / Manual | Bootstrap verify + auto-heal, pre-flight, security audit | 04, 05 |
| **07** | `07-rollback.yml` | Manual only | Revert backend Lambda or frontend S3 to previous version | 04 or 05 |

## First-Time Setup (Start Here!)

```bash
# ── STEP 0: Set 4 temporary secrets (only time you use static AWS keys) ──
gh secret set AWS_ACCESS_KEY_ID_PLATFORM_ADMIN     --body "AKIA..."   # Platform Admin Account key
gh secret set AWS_SECRET_ACCESS_KEY_PLATFORM_ADMIN --body "wJal..."   # Platform Admin Account secret
gh secret set AWS_ACCESS_KEY_ID_CUSTOMER           --body "AKIA..."   # Customer Account key
gh secret set AWS_SECRET_ACCESS_KEY_CUSTOMER       --body "L7jM..."   # Customer Account secret

# ── STEP 1: Create environments ──
# Go to Settings → Environments → Create: dev, staging, prod

# ── STEP 2: Run Init (creates OIDC, IAM roles, TF state) ──
gh workflow run "00 · Init Prerequisites" \
  -f aws_region=us-east-1 \
  -f project_name=license-portal \
  -f platform_admin_account_id=YOUR_ACCOUNT_2_ID \
  -f customer_account_id=YOUR_ACCOUNT_3_ID \
  -f confirmation=INIT

# ── STEP 3: Copy commands from workflow 00 summary output ──
# Sets: variables, environment secrets, deletes static keys

# ── STEP 4: Bootstrap infrastructure ──
gh workflow run "01 · Bootstrap Platform Admin" -f environment=dev
# Wait ~5 min for completion, then:
gh workflow run "02 · Bootstrap Customer Account" -f environment=dev

# ── STEP 5: Set Terraform output secrets ──
cd infra/control-plane/terraform
ENV=dev
gh secret set VITE_API_BASE_URL         --env $ENV --body "$(terraform output -raw api_gateway_url)"
gh secret set VITE_COGNITO_USER_POOL_ID --env $ENV --body "$(terraform output -raw cognito_user_pool_id)"
gh secret set VITE_COGNITO_CLIENT_ID    --env $ENV --body "$(terraform output -raw cognito_client_id)"
gh secret set VITE_COGNITO_DOMAIN       --env $ENV --body "$(terraform output -raw cognito_domain)"
gh secret set COGNITO_USER_POOL_ID      --env $ENV --body "$(terraform output -raw cognito_user_pool_id)"
gh secret set DYNAMODB_TABLE_NAME       --env $ENV --body "$(terraform output -raw control_plane_dynamodb_table)"

# ── STEP 6: Deploy! ──
gh workflow run "04 · Deploy Backend" -f environment=dev
gh workflow run "05 · Deploy Frontend" -f workspace=dev

# ── DONE! Push code → everything auto from here ──
```

## After Initial Setup — Automatic Triggers

| Event | What Runs |
|-------|-----------|
| Push to any branch | **03 · CI** (lint, test, build, security) |
| PR to main | **03 · CI** + Terraform plan + PR comment |
| Merge to main (backend/) | **04 · Deploy Backend** → **06 · Verify** |
| Merge to main (frontend/) | **05 · Deploy Frontend** → **06 · Verify** |
| Every night 2am UTC | **06 · Verify** (pre-flight + bootstrap check) |
| Every Monday 9am UTC | **06 · Verify** (security audit) |

## Rollback (Manual)

```bash
gh workflow run "07 · Rollback" \
  -f component=backend \
  -f environment=dev \
  -f confirmation=ROLLBACK
```

## Secrets Reference

See [`docs/GITHUB-SECRETS-CHEATSHEET.md`](../docs/GITHUB-SECRETS-CHEATSHEET.md) for the complete guide.
