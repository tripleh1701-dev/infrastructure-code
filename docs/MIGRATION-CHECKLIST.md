# Migration Checklist — Supabase → AWS (NestJS / Cognito / DynamoDB)

> **How to use**: Work through each phase in order. Check off items as you complete them. Do not proceed to the next phase until all items in the current phase are checked.
>
> **Tip**: Use `git commit` after completing each phase to snapshot progress.
>
> **Cross-references**: Each item links to the relevant step in the execution guide. Click the 🔗 link to jump to detailed instructions.
>
> **Guides**:
> - [PHASE1-END-TO-END-EXECUTION.md](./PHASE1-END-TO-END-EXECUTION.md) — Step-by-step Phase 1 execution (from Lovable download to running platform)
> - [PHASE2-END-TO-END-EXECUTION.md](./PHASE2-END-TO-END-EXECUTION.md) — Step-by-step Phase 2 execution (CI/CD pipeline setup)
> - [PHASE1-SETUP-GUIDE.md](./PHASE1-SETUP-GUIDE.md) — Detailed Phase 1 reference guide
> - [NEXT-STEPS.md](./NEXT-STEPS.md) — Phases 2–6 roadmap
> - [ARCHITECTURE.md](./ARCHITECTURE.md) — Full architecture reference
> - [GITHUB-SECRETS-CHEATSHEET.md](./GITHUB-SECRETS-CHEATSHEET.md) — All secrets in one page

---

## Phase 1 — AWS Foundation

> 📖 **Execution guide**: [PHASE1-END-TO-END-EXECUTION.md](./PHASE1-END-TO-END-EXECUTION.md) (21 steps, ~4–6 hours, **no CloudFront**)
>
> 📖 **Reference guide**: [PHASE1-SETUP-GUIDE.md](./PHASE1-SETUP-GUIDE.md)

### 1.0 Download Code from Lovable

| # | Item | Verify | Exec Guide | ☐ |
|---|------|--------|------------|---|
| 0 | Code downloaded from Lovable (GitHub or ZIP) | `ls docs/nestjs-backend/src/` shows NestJS code | [Step 1](./PHASE1-END-TO-END-EXECUTION.md#step-1-download-code-from-lovable) | ☐ |

### 1.1 Prerequisites — Install Tooling

| # | Item | Verify | Exec Guide | ☐ |
|---|------|--------|------------|---|
| 1 | AWS CLI v2 installed | `aws --version` → `2.x.x` | [Step 3.1](./PHASE1-END-TO-END-EXECUTION.md#31-aws-cli-v2) | ☐ |
| 2 | Terraform >= 1.0.0 installed | `terraform --version` → `1.x.x` | [Step 3.2](./PHASE1-END-TO-END-EXECUTION.md#32-terraform--100) | ☐ |
| 3 | Node.js >= 18.x installed | `node --version` → `18.x` | [Step 3.3](./PHASE1-END-TO-END-EXECUTION.md#33-nodejs--18x) | ☐ |
| 4 | GitHub CLI installed | `gh --version` | [Step 3.4](./PHASE1-END-TO-END-EXECUTION.md#34-git--github-cli) | ☐ |
| 5 | jq installed | `jq --version` | [Step 3.5](./PHASE1-END-TO-END-EXECUTION.md#35-jq-json-processor--used-in-verification-commands) | ☐ |

### 1.2 AWS Account Setup

| # | Item | Verify | Exec Guide | ☐ |
|---|------|--------|------------|---|
| 6 | Platform Admin AWS account created | Can sign in to AWS Console | [Step 4.1](./PHASE1-END-TO-END-EXECUTION.md#41-account-1-platform-admin-control-plane) | ☐ |
| 7 | Customer AWS account created | Can sign in to AWS Console | [Step 4.2](./PHASE1-END-TO-END-EXECUTION.md#42-account-2-customer-data-data-plane) | ☐ |
| 8 | IAM admin users created in both accounts | Access keys saved securely | [Step 4.3](./PHASE1-END-TO-END-EXECUTION.md#43-create-iam-admin-users-in-both-accounts) | ☐ |
| 9 | AWS CLI profiles configured (platform-admin) | `aws sts get-caller-identity --profile platform-admin` | [Step 5](./PHASE1-END-TO-END-EXECUTION.md#step-5-configure-aws-cli-profiles) | ☐ |
| 10 | AWS CLI profiles configured (customer-data) | `aws sts get-caller-identity --profile customer-data` | [Step 5](./PHASE1-END-TO-END-EXECUTION.md#step-5-configure-aws-cli-profiles) | ☐ |

### 1.3 Customer Account — Shared DynamoDB Table

| # | Item | Verify | Exec Guide | ☐ |
|---|------|--------|------------|---|
| 11 | Shared DynamoDB table `dev_data` created in Customer account | `aws dynamodb describe-table --table-name dev_data --profile customer-data` | [Step 6.1](./PHASE1-END-TO-END-EXECUTION.md#61-create-the-table) | ☐ |
| 12 | 3 GSIs created (GSI1, GSI2, GSI3) | Visible in table description output | [Step 6.2](./PHASE1-END-TO-END-EXECUTION.md#62-verify-the-table-30-seconds) | ☐ |
| 13 | Billing mode set to PAY_PER_REQUEST | `BillingModeSummary.BillingMode` = `PAY_PER_REQUEST` | [Step 6.1](./PHASE1-END-TO-END-EXECUTION.md#61-create-the-table) | ☐ |

### 1.4 Cross-Account IAM

| # | Item | Verify | Exec Guide | ☐ |
|---|------|--------|------------|---|
| 14 | Cross-account IAM role created in Customer account | `aws iam get-role --role-name PlatformAdminCrossAccountRole --profile customer-data` | [Step 7.1](./PHASE1-END-TO-END-EXECUTION.md#71-in-customer-data-account--create-the-trust-policy) | ☐ |
| 15 | Trust policy allows Platform Admin account to assume role | Check `AssumeRolePolicyDocument` | [Step 7.1](./PHASE1-END-TO-END-EXECUTION.md#71-in-customer-data-account--create-the-trust-policy) | ☐ |
| 16 | Custom policy `PlatformCrossAccountAccess` attached | DynamoDB + SSM + CloudFormation permissions | [Step 7.2](./PHASE1-END-TO-END-EXECUTION.md#72-create-a-custom-permissions-policy) | ☐ |
| 17 | Role ARN recorded | `arn:aws:iam::<CUSTOMER_ID>:role/PlatformAdminCrossAccountRole` | [Step 7.2](./PHASE1-END-TO-END-EXECUTION.md#72-create-a-custom-permissions-policy) | ☐ |

### 1.5 Terraform — Infrastructure Provisioning

| # | Item | Verify | Exec Guide | ☐ |
|---|------|--------|------------|---|
| 18 | `terraform.tfvars` configured (`enable_frontend_hosting = false`) | Review file contents | [Step 8](./PHASE1-END-TO-END-EXECUTION.md#step-8-prepare-terraform-variables) | ☐ |
| 19 | `terraform init` succeeds | No errors in output | [Step 9.2](./PHASE1-END-TO-END-EXECUTION.md#92-initialize-terraform) | ☐ |
| 20 | `terraform plan` shows ~20+ expected resources (no CloudFront) | Review plan output | [Step 9.4](./PHASE1-END-TO-END-EXECUTION.md#94-plan--preview-resources) | ☐ |
| 21 | `terraform apply` completes successfully | All resources created | [Step 9.5](./PHASE1-END-TO-END-EXECUTION.md#95-apply--create-all-resources) | ☐ |
| 22 | Outputs saved to `terraform-outputs.json` | File exists | [Step 9.6](./PHASE1-END-TO-END-EXECUTION.md#96-save-the-outputs) | ☐ |

### 1.6 Terraform Outputs Verified

| # | Item | Verify | Exec Guide | ☐ |
|---|------|--------|------------|---|
| 23 | Lambda function ARN captured | `terraform output lambda_function_arn` | [Step 10](./PHASE1-END-TO-END-EXECUTION.md#step-10-verify-terraform-outputs) | ☐ |
| 24 | API Gateway URL captured | `terraform output api_gateway_stage_url` | [Step 10](./PHASE1-END-TO-END-EXECUTION.md#step-10-verify-terraform-outputs) | ☐ |
| 25 | Cognito User Pool ID captured | `terraform output cognito_user_pool_id` | [Step 10](./PHASE1-END-TO-END-EXECUTION.md#step-10-verify-terraform-outputs) | ☐ |
| 26 | Cognito Client ID captured | `terraform output cognito_client_id` | [Step 10](./PHASE1-END-TO-END-EXECUTION.md#step-10-verify-terraform-outputs) | ☐ |
| 27 | Resources verified in AWS Console | Cognito, Lambda, API GW, DynamoDB (no CloudFront expected) | [Step 10](./PHASE1-END-TO-END-EXECUTION.md#step-10-verify-terraform-outputs) | ☐ |

### 1.7 SNS & SES (formerly 1.8)

| # | Item | Verify | Exec Guide | ☐ |
|---|------|--------|------------|---|
| 28 | SNS topic subscriptions confirmed | Email confirmation clicked for critical + warning | [Step 11](./PHASE1-END-TO-END-EXECUTION.md#step-11-confirm-sns-email-subscriptions) | ☐ |
| 29 | SES sender identity verified | `VerificationStatus: Success` | [Step 12.1](./PHASE1-END-TO-END-EXECUTION.md#121-verify-sender-email) | ☐ |
| 30 | SES recipient emails verified (sandbox) | Admin + test recipients verified | [Step 12.2](./PHASE1-END-TO-END-EXECUTION.md#122-verify-recipient-emails-sandbox-only) | ☐ |

### 1.8 GitHub Environment Secrets (Phase 1)

> 📖 See also: [GITHUB-SECRETS-CHEATSHEET.md](./GITHUB-SECRETS-CHEATSHEET.md)

| # | Item | Verify | Exec Guide | ☐ |
|---|------|--------|------------|---|
| 31 | GitHub Environments created (`dev`, `qa`, `prod`) | Visible in repo Settings → Environments | [Step 13.1](./PHASE1-END-TO-END-EXECUTION.md#131-create-github-environments) | ☐ |
| 32 | `VITE_API_BASE_URL` set | `gh secret list --env dev` | [Step 13.2](./PHASE1-END-TO-END-EXECUTION.md#132-set-environment-secrets) | ☐ |
| 33 | `VITE_COGNITO_USER_POOL_ID` set | `gh secret list --env dev` | [Step 13.2](./PHASE1-END-TO-END-EXECUTION.md#132-set-environment-secrets) | ☐ |
| 34 | `VITE_COGNITO_CLIENT_ID` set | `gh secret list --env dev` | [Step 13.2](./PHASE1-END-TO-END-EXECUTION.md#132-set-environment-secrets) | ☐ |
| 35 | `VITE_COGNITO_DOMAIN` set | `gh secret list --env dev` | [Step 13.2](./PHASE1-END-TO-END-EXECUTION.md#132-set-environment-secrets) | ☐ |

> **📝 Note**: `FRONTEND_S3_BUCKET` and `FRONTEND_CLOUDFRONT_DISTRIBUTION_ID` will be added later when CloudFront quota is approved.

### 1.9 Backend Build & Deploy

| # | Item | Verify | Exec Guide | ☐ |
|---|------|--------|------------|---|
| 36 | NestJS backend builds successfully | `npm run build` in `docs/nestjs-backend/` | [Step 14.2](./PHASE1-END-TO-END-EXECUTION.md#142-build-the-application) | ☐ |
| 37 | Lambda package created (< 50MB) | `ls -lh lambda-package.zip` | [Step 14.3](./PHASE1-END-TO-END-EXECUTION.md#143-create-lambda-deployment-package) | ☐ |
| 38 | Lambda function code updated | `update-function-code` succeeds | [Step 14.4](./PHASE1-END-TO-END-EXECUTION.md#144-deploy-to-lambda) | ☐ |
| 39 | `.env.migration` created for bootstrap scripts | All 6 vars set | [Step 15.1](./PHASE1-END-TO-END-EXECUTION.md#151-create-envmigration-for-bootstrap-scripts) | ☐ |
| 40 | Lambda environment variables configured | Cross-account role ARN + Cognito vars set | [Step 15.2](./PHASE1-END-TO-END-EXECUTION.md#152-update-lambda-environment) | ☐ |

### 1.10 Day-0 Bootstrap

| # | Item | Verify | Exec Guide | ☐ |
|---|------|--------|------------|---|
| 41 | Bootstrap dry-run passes | `--dry-run` → 14 steps printed, no errors | [Step 16.1](./PHASE1-END-TO-END-EXECUTION.md#161-dry-run-first) | ☐ |
| 42 | Bootstrap executed with Cognito | `--with-cognito` → 14/14 steps succeeded | [Step 16.2](./PHASE1-END-TO-END-EXECUTION.md#162-execute-bootstrap-dynamodb--cognito) | ☐ |
| 43 | Account `ABC` created | ID: `a0000000-0000-0000-0000-000000000001` | [Step 16.2](./PHASE1-END-TO-END-EXECUTION.md#162-execute-bootstrap-dynamodb--cognito) | ☐ |
| 44 | Enterprise `Global` created | ID: `00000000-0000-0000-0000-000000000001` | [Step 16.2](./PHASE1-END-TO-END-EXECUTION.md#162-execute-bootstrap-dynamodb--cognito) | ☐ |
| 45 | Product `Global` created | ID: `00000000-0000-0000-0000-000000000002` | [Step 16.2](./PHASE1-END-TO-END-EXECUTION.md#162-execute-bootstrap-dynamodb--cognito) | ☐ |
| 46 | Service `Global` created | ID: `00000000-0000-0000-0000-000000000003` | [Step 16.2](./PHASE1-END-TO-END-EXECUTION.md#162-execute-bootstrap-dynamodb--cognito) | ☐ |
| 47 | Enterprise → Product linked | Enterprise `Global` → Product `Global` | [Step 16.2](./PHASE1-END-TO-END-EXECUTION.md#162-execute-bootstrap-dynamodb--cognito) | ☐ |
| 48 | Product → Service linked | Product `Global` → Service `Global` | [Step 16.2](./PHASE1-END-TO-END-EXECUTION.md#162-execute-bootstrap-dynamodb--cognito) | ☐ |
| 49 | License created (100 users) | Scoped to Global Enterprise/Product/Service | [Step 16.2](./PHASE1-END-TO-END-EXECUTION.md#162-execute-bootstrap-dynamodb--cognito) | ☐ |
| 50 | Role `Platform Admin` created | Full permissions (0x7FFF) | [Step 16.2](./PHASE1-END-TO-END-EXECUTION.md#162-execute-bootstrap-dynamodb--cognito) | ☐ |
| 51 | Role `Technical Role` created | View-only permissions | [Step 16.2](./PHASE1-END-TO-END-EXECUTION.md#162-execute-bootstrap-dynamodb--cognito) | ☐ |
| 52 | Group `Platform Admin` created | Linked to Platform Admin role | [Step 16.2](./PHASE1-END-TO-END-EXECUTION.md#162-execute-bootstrap-dynamodb--cognito) | ☐ |
| 53 | Group `Technical Group` created | Linked to Technical Role | [Step 16.2](./PHASE1-END-TO-END-EXECUTION.md#162-execute-bootstrap-dynamodb--cognito) | ☐ |
| 54 | Admin user `admin@adminplatform.com` created | In DynamoDB + Cognito | [Step 16.2](./PHASE1-END-TO-END-EXECUTION.md#162-execute-bootstrap-dynamodb--cognito) | ☐ |
| 55 | Workstream `Global` created | ID: `e0000000-0000-0000-0000-000000000001` | [Step 16.2](./PHASE1-END-TO-END-EXECUTION.md#162-execute-bootstrap-dynamodb--cognito) | ☐ |
| 56 | Workstream `Default` created | ID: `e0000000-0000-0000-0000-000000000002` | [Step 16.2](./PHASE1-END-TO-END-EXECUTION.md#162-execute-bootstrap-dynamodb--cognito) | ☐ |

### 1.11 Verification Scripts

| # | Item | Verify | Exec Guide | ☐ |
|---|------|--------|------------|---|
| 57 | `verify-bootstrap.ts` passes | All checks green | [Step 17.1](./PHASE1-END-TO-END-EXECUTION.md#171-run-verification-script) | ☐ |
| 58 | `verify-bootstrap.ts --fix` auto-heals any drift | Re-run shows all green | [Step 17.2](./PHASE1-END-TO-END-EXECUTION.md#172-auto-fix-if-anything-failed) | ☐ |
| 59 | DynamoDB items verified manually | ABC account METADATA item exists | [Step 17.3](./PHASE1-END-TO-END-EXECUTION.md#173-manual-verification--dynamodb) | ☐ |
| 60 | SSM parameters verified | table-name, cloud-type, provisioning-status | [Step 17.4](./PHASE1-END-TO-END-EXECUTION.md#174-verify-ssm-parameters) | ☐ |
| 61 | Cognito admin user verified | `admin-get-user` returns user | [Step 17.5](./PHASE1-END-TO-END-EXECUTION.md#175-verify-cognito-admin-user) | ☐ |
| 62 | `pre-flight-check.ts --phase 1` passes | 30/30 checks green | [Step 18](./PHASE1-END-TO-END-EXECUTION.md#step-18-run-pre-flight-check) | ☐ |

### 1.12 Smoke Test

| # | Item | Verify | Exec Guide | ☐ |
|---|------|--------|------------|---|
| 63 | `GET /health` returns 200 | `curl` succeeds | [Step 19.2](./PHASE1-END-TO-END-EXECUTION.md#192-health-check-unauthenticated) | ☐ |
| 64 | JWT token obtained via Cognito | `initiate-auth` returns access token | [Step 19.3](./PHASE1-END-TO-END-EXECUTION.md#193-get-jwt-token) | ☐ |
| 65 | `GET /api/accounts` with Bearer token | Returns ABC account | [Step 19.4](./PHASE1-END-TO-END-EXECUTION.md#194-test-authenticated-endpoints) | ☐ |
| 66 | `GET /api/enterprises` returns Global enterprise | Correct ID + name | [Step 19.4](./PHASE1-END-TO-END-EXECUTION.md#194-test-authenticated-endpoints) | ☐ |
| 67 | `GET /api/products` returns Global product | Correct ID + name | [Step 19.4](./PHASE1-END-TO-END-EXECUTION.md#194-test-authenticated-endpoints) | ☐ |

### 1.13 Frontend Deploy (Without CloudFront)

> ⚠️ CloudFront is skipped due to service quota limitations. Frontend served via S3 Static Website Hosting or local Vite dev server.

| # | Item | Verify | Exec Guide | ☐ |
|---|------|--------|------------|---|
| 68 | S3 bucket created for static hosting | `aws s3api head-bucket --bucket <bucket>` | [Step 20A.1](./PHASE1-END-TO-END-EXECUTION.md#20a1-create-the-frontend-s3-bucket) | ☐ |
| 69 | Static website hosting enabled | `--index-document index.html --error-document index.html` | [Step 20A.2](./PHASE1-END-TO-END-EXECUTION.md#20a2-enable-static-website-hosting) | ☐ |
| 70 | Bucket policy allows public read | `s3:GetObject` for `"Principal": "*"` | [Step 20A.4](./PHASE1-END-TO-END-EXECUTION.md#20a4-add-a-bucket-policy-for-public-read) | ☐ |
| 71 | Frontend built with AWS env vars | `npx vite build` succeeds | [Step 20A.5](./PHASE1-END-TO-END-EXECUTION.md#20a5-build-the-frontend) | ☐ |
| 72 | Files uploaded to S3 | `aws s3 sync dist/ s3://...` | [Step 20A.6](./PHASE1-END-TO-END-EXECUTION.md#20a6-upload-to-s3) | ☐ |
| 73 | S3 website URL returns 200 | `curl http://<bucket>.s3-website-us-east-1.amazonaws.com` | [Step 20A.7](./PHASE1-END-TO-END-EXECUTION.md#20a7-get-the-website-url-and-test) | ☐ |
| 74 | Cognito callback URLs updated with S3 URL | `update-user-pool-client` succeeds | [Step 20A.8](./PHASE1-END-TO-END-EXECUTION.md#20a8-update-cognito-callback-urls) | ☐ |
| 75 | Login works end-to-end | Admin user can sign in and see dashboard | [Step 21](./PHASE1-END-TO-END-EXECUTION.md#step-21-final-verification--checklist) | ☐ |

> **Alternative**: Use local Vite dev server (`npm run dev` on `localhost:5173`) — see [Step 20B](./PHASE1-END-TO-END-EXECUTION.md#option-b-local-vite-dev-server-solo-development)

**✅ Phase 1 Complete — 75 items** (no CloudFront dependency)

---

## Phase 2 — CI/CD Pipeline Setup

> 📖 **Execution guide**: [PHASE2-END-TO-END-EXECUTION.md](./PHASE2-END-TO-END-EXECUTION.md) (14 steps, ~2–4 hours, **no CloudFront**)
>
> 📖 **Reference guide**: [NEXT-STEPS.md → Phase 2](./NEXT-STEPS.md#phase-2-cicd-pipeline-setup)
>
> **Time Estimate**: 2–4 hours

### 2.0 Prerequisites Check

| # | Item | Verify | Exec Guide | ☐ |
|---|------|--------|------------|---|
| 1 | Phase 1 fully complete | All 75 Phase 1 items checked | [Step 1](./PHASE2-END-TO-END-EXECUTION.md#step-1-prerequisites-check) | ☐ |
| 2 | API health check passes | `curl /health` → 200 | [Step 1](./PHASE2-END-TO-END-EXECUTION.md#step-1-prerequisites-check) | ☐ |
| 3 | Bootstrap verification passes | `npm run verify-bootstrap` → all green | [Step 1](./PHASE2-END-TO-END-EXECUTION.md#step-1-prerequisites-check) | ☐ |
| 4 | GitHub CLI authenticated | `gh auth status` → logged in | [Step 1](./PHASE2-END-TO-END-EXECUTION.md#step-1-prerequisites-check) | ☐ |

### 2.1 Terraform Remote State

| # | Item | Verify | Exec Guide | ☐ |
|---|------|--------|------------|---|
| 5 | S3 bucket `license-portal-terraform-state` created | `aws s3api head-bucket --bucket ...` | [Step 2.1](./PHASE2-END-TO-END-EXECUTION.md#21-create-s3-bucket-for-state-storage) | ☐ |
| 6 | Versioning enabled on state bucket | `get-bucket-versioning` → `Enabled` | [Step 2.2](./PHASE2-END-TO-END-EXECUTION.md#22-enable-versioning-protects-against-state-corruption) | ☐ |
| 7 | Server-side encryption (KMS) enabled | `get-bucket-encryption` → `aws:kms` | [Step 2.3](./PHASE2-END-TO-END-EXECUTION.md#23-enable-server-side-encryption) | ☐ |
| 8 | Public access blocked | `get-public-access-block` → all true | [Step 2.4](./PHASE2-END-TO-END-EXECUTION.md#24-block-all-public-access) | ☐ |
| 9 | DynamoDB lock table created | `describe-table --table-name license-portal-terraform-locks` → ACTIVE | [Step 2.5](./PHASE2-END-TO-END-EXECUTION.md#25-create-dynamodb-lock-table) | ☐ |

### 2.2 State Migration

| # | Item | Verify | Exec Guide | ☐ |
|---|------|--------|------------|---|
| 10 | `backend.tf` created | File exists in `terraform/` | [Step 3.1](./PHASE2-END-TO-END-EXECUTION.md#31-create-backend-configuration) | ☐ |
| 11 | Terraform state migrated to S3 | `terraform init -migrate-state` → success | [Step 3.2](./PHASE2-END-TO-END-EXECUTION.md#32-migrate-state) | ☐ |
| 12 | Remote state verified | `terraform state list` shows Phase 1 resources | [Step 3.3](./PHASE2-END-TO-END-EXECUTION.md#33-verify-remote-state) | ☐ |
| 13 | State file visible in S3 | `aws s3 ls s3://...terraform-state/dev/` | [Step 3.4](./PHASE2-END-TO-END-EXECUTION.md#34-verify-state-file-in-s3) | ☐ |

### 2.3 CI/CD IAM User

| # | Item | Verify | Exec Guide | ☐ |
|---|------|--------|------------|---|
| 14 | IAM user `github-actions-deployer` created | `aws iam get-user --user-name ...` | [Step 4.1](./PHASE2-END-TO-END-EXECUTION.md#41-create-the-iam-user) | ☐ |
| 15 | Least-privilege policy attached (no CloudFront) | `aws iam list-user-policies ...` → `GitHubActionsDeployPolicy` | [Step 4.2–4.3](./PHASE2-END-TO-END-EXECUTION.md#42-create-the-least-privilege-policy) | ☐ |
| 16 | Access key created and saved securely | Keys stored in password manager | [Step 4.4](./PHASE2-END-TO-END-EXECUTION.md#44-create-access-key) | ☐ |

### 2.4 Repository Secrets

| # | Item | Verify | Exec Guide | ☐ |
|---|------|--------|------------|---|
| 17 | `AWS_ACCESS_KEY_ID` set | `gh secret list` | [Step 5.2](./PHASE2-END-TO-END-EXECUTION.md#52-set-repository-secrets) | ☐ |
| 18 | `AWS_SECRET_ACCESS_KEY` set | `gh secret list` | [Step 5.2](./PHASE2-END-TO-END-EXECUTION.md#52-set-repository-secrets) | ☐ |
| 19 | `AWS_REGION` set | `gh secret list` | [Step 5.2](./PHASE2-END-TO-END-EXECUTION.md#52-set-repository-secrets) | ☐ |
| 20 | `TF_STATE_BUCKET` set | `gh secret list` | [Step 5.2](./PHASE2-END-TO-END-EXECUTION.md#52-set-repository-secrets) | ☐ |
| 21 | `TF_STATE_LOCK_TABLE` set | `gh secret list` | [Step 5.2](./PHASE2-END-TO-END-EXECUTION.md#52-set-repository-secrets) | ☐ |

### 2.5 CI/CD Environment Secrets

| # | Item | Verify | Exec Guide | ☐ |
|---|------|--------|------------|---|
| 22 | `DYNAMODB_TABLE_NAME` set for `dev` | `gh secret list --env dev` | [Step 6.1](./PHASE2-END-TO-END-EXECUTION.md#61-set-cicd-secrets-for-dev) | ☐ |
| 23 | `COGNITO_USER_POOL_ID` set for `dev` | `gh secret list --env dev` | [Step 6.1](./PHASE2-END-TO-END-EXECUTION.md#61-set-cicd-secrets-for-dev) | ☐ |
| 24 | `BOOTSTRAP_ADMIN_PASSWORD` set for `dev` | `gh secret list --env dev` | [Step 6.1](./PHASE2-END-TO-END-EXECUTION.md#61-set-cicd-secrets-for-dev) | ☐ |
| 25 | `FRONTEND_S3_BUCKET` set for `dev` | `gh secret list --env dev` | [Step 6.2](./PHASE2-END-TO-END-EXECUTION.md#62-set-the-frontend-s3-bucket-secret) | ☐ |
| 26 | All 13 secrets verified (5 repo + 8 env) | `gh secret list` + `gh secret list --env dev` | [Step 7](./PHASE2-END-TO-END-EXECUTION.md#step-7-verify-all-secrets) | ☐ |

### 2.6 Workflow Files

| # | Item | Verify | Exec Guide | ☐ |
|---|------|--------|------------|---|
| 27 | 8 workflow files copied to `.github/workflows/` | `ls .github/workflows/` → 8 files | [Step 8.1](./PHASE2-END-TO-END-EXECUTION.md#81-copy-workflow-files) | ☐ |
| 28 | Workflow files committed and pushed | `git log --oneline -1` | [Step 8.3](./PHASE2-END-TO-END-EXECUTION.md#83-commit-and-push) | ☐ |

### 2.7 Pipeline Verification

| # | Item | Verify | Exec Guide | ☐ |
|---|------|--------|------------|---|
| 29 | Workspace pipeline runs manually for `dev` | `gh workflow run ...` → all jobs green | [Step 9.1](./PHASE2-END-TO-END-EXECUTION.md#91-trigger-manual-pipeline-run) | ☐ |
| 30 | CI checks pass (lint, test, build) | Green in GitHub Actions | [Step 9.3](./PHASE2-END-TO-END-EXECUTION.md#93-expected-job-results) | ☐ |
| 31 | Terraform plan shows no unexpected changes | Plan output review | [Step 9.3](./PHASE2-END-TO-END-EXECUTION.md#93-expected-job-results) | ☐ |
| 32 | Lambda deployment succeeds | Function updated + version published | [Step 9.3](./PHASE2-END-TO-END-EXECUTION.md#93-expected-job-results) | ☐ |
| 33 | Smoke test returns 200 | Health check in pipeline | [Step 9.3](./PHASE2-END-TO-END-EXECUTION.md#93-expected-job-results) | ☐ |
| 34 | Bootstrap verify passes (14+ checks) | Post-deploy verification green | [Step 9.3](./PHASE2-END-TO-END-EXECUTION.md#93-expected-job-results) | ☐ |
| 35 | Frontend deployment pipeline works (S3 only) | `gh workflow run "deploy-frontend.yml" ...` | [Step 10.1](./PHASE2-END-TO-END-EXECUTION.md#101-trigger-manual-frontend-deploy) | ☐ |
| 36 | CloudFront invalidation gracefully skipped | Pipeline shows "skipped" for CF step | [Step 10.3](./PHASE2-END-TO-END-EXECUTION.md#103-expected-job-results) | ☐ |
| 37 | Auto-trigger on backend push works | Push to `docs/nestjs-backend/` → pipeline triggers | [Step 11.1](./PHASE2-END-TO-END-EXECUTION.md#111-test-backend-auto-trigger) | ☐ |
| 38 | Auto-trigger on frontend push works | Push to `src/` → pipeline triggers | [Step 11.2](./PHASE2-END-TO-END-EXECUTION.md#112-test-frontend-auto-trigger) | ☐ |

### 2.8 Multi-Environment (Optional)

| # | Item | Verify | Exec Guide | ☐ |
|---|------|--------|------------|---|
| 39 | QA environment secrets configured | `gh secret list --env qa` → 8+ secrets | [Step 12.2](./PHASE2-END-TO-END-EXECUTION.md#122-set-qa-secrets) | ☐ |
| 40 | Prod environment protection rules set | Required reviewers + wait timer | [Step 12.4](./PHASE2-END-TO-END-EXECUTION.md#124-configure-prod-environment-protection) | ☐ |
| 41 | QA pipeline verified | Manual run succeeds | [Step 12.5](./PHASE2-END-TO-END-EXECUTION.md#125-verify-qa-pipeline) | ☐ |

### 2.9 Nightly Pre-Flight & Final

| # | Item | Verify | Exec Guide | ☐ |
|---|------|--------|------------|---|
| 42 | Scheduled workflow configured | `scheduled.yml` present in `.github/workflows/` | [Step 13.1](./PHASE2-END-TO-END-EXECUTION.md#131-verify-scheduled-workflow) | ☐ |
| 43 | Nightly pre-flight runs (manual test) | `gh workflow run "scheduled.yml"` → passes | [Step 13.3](./PHASE2-END-TO-END-EXECUTION.md#133-test-the-scheduled-workflow-manually) | ☐ |
| 44 | Final verification script passes | All 8 checks green | [Step 14.1](./PHASE2-END-TO-END-EXECUTION.md#141-complete-verification-script) | ☐ |

**✅ Phase 2 Complete — 44 items** (no CloudFront dependency)

---

## Phase 3 — Frontend Migration

> 📖 Full guide: [NEXT-STEPS.md → Phase 3](./NEXT-STEPS.md#phase-3-frontend-migration)
>
> **Time Estimate**: 3–5 days

### 3.1 Cognito SDK & Auth

| # | Item | Verify | ☐ |
|---|------|--------|---|
| 1 | `amazon-cognito-identity-js` installed | `npm ls amazon-cognito-identity-js` | ☐ |
| 2 | `cognito-client.ts` created and functional | Import resolves without errors | ☐ |
| 3 | `AuthContext.tsx` refactored for dual-mode | `isExternalApi()` branch present | ☐ |
| 4 | Login page works with Cognito | Sign in with `admin@adminplatform.com` returns JWT | ☐ |
| 5 | Forgot password flow works | Email → 6-digit code → new password | ☐ |
| 6 | Token refresh works automatically | No forced re-login after token expiry | ☐ |

### 3.2 Data Hooks Migration

| # | Hook | Dual-Mode | Tested | ☐ |
|---|------|-----------|--------|---|
| 7 | `useAccounts.ts` | `isExternalApi()` branch | CRUD verified | ☐ |
| 8 | `useEnterprises.ts` | `isExternalApi()` branch | List + breadcrumb verified | ☐ |
| 9 | `useLicenses.ts` | `isExternalApi()` branch | CRUD verified | ☐ |
| 10 | `useGroups.ts` | `isExternalApi()` branch | CRUD verified | ☐ |
| 11 | `useRoles.ts` | `isExternalApi()` branch | CRUD verified | ☐ |
| 12 | `useAccessControlUsers.ts` | `isExternalApi()` branch | CRUD verified | ☐ |
| 13 | `useWorkstreams.ts` | `isExternalApi()` branch | CRUD verified | ☐ |
| 14 | `useCredentials.ts` | `isExternalApi()` branch | CRUD + OAuth verified | ☐ |
| 15 | `usePipelines.ts` | `isExternalApi()` branch | CRUD verified | ☐ |
| 16 | `useUserGroups.ts` | `isExternalApi()` branch | Assignment verified | ☐ |
| 17 | `useUserWorkstreams.ts` | `isExternalApi()` branch | Assignment verified | ☐ |
| 18 | `useRolePermissions.ts` | `isExternalApi()` branch | Permission matrix verified | ☐ |
| 19 | `useLicenseCapacity.ts` | `isExternalApi()` branch | Capacity banner verified | ☐ |
| 20 | `useAccountGlobalAccess.ts` | `isExternalApi()` branch | Global access toggle verified | ☐ |
| 21 | `useProvisioningStatus.ts` | `isExternalApi()` branch | Status banner verified | ☐ |

### 3.3 Context Providers

| # | Context | Dual-Mode | Tested | ☐ |
|---|---------|-----------|--------|---|
| 22 | `AuthContext.tsx` | Cognito branch | User object populated | ☐ |
| 23 | `AccountContext.tsx` | API branch | Selector populates correctly | ☐ |
| 24 | `EnterpriseContext.tsx` | API branch | Filtered by active account | ☐ |
| 25 | `PermissionContext.tsx` | API branch | Menu visibility matches role | ☐ |

### 3.4 Component-Level Supabase Calls

| # | Component | Change | ☐ |
|---|-----------|--------|---|
| 26 | `AddEnterpriseForm.tsx` | Routed through API services | ☐ |
| 27 | `EditEnterpriseForm.tsx` | Routed through API services | ☐ |
| 28 | `ProductsServicesManager.tsx` | Routed through API services | ☐ |
| 29 | `AddCredentialDialog.tsx` | Routed through `httpClient` | ☐ |
| 30 | `EditCredentialDialog.tsx` | Routed through `httpClient` | ☐ |
| 31 | `EditAccountForm.tsx` | Routed through `httpClient` | ☐ |
| 32 | `LicenseAddDialog.tsx` | Routed through `httpClient` | ☐ |
| 33 | `EnterpriseSummary.tsx` | Routed through `httpClient` | ☐ |
| 34 | `AddUserDialog.tsx` | `POST /api/users/provision` | ☐ |
| 35 | `ExpiringCredentials.tsx` | `POST /api/credentials/check-expiration` | ☐ |
| 36 | `ExpiringLicenses.tsx` | `POST /api/licenses/send-reminders` | ☐ |
| 37 | `AddConnectorDialog.tsx` | `POST /api/connectors/test` | ☐ |

### 3.5 Final Audit

| # | Item | Verify | ☐ |
|---|------|--------|---|
| 38 | Zero unguarded `supabase.from()` calls | `grep -rn "supabase.from" src/ --include="*.ts" --include="*.tsx"` — only inside `else` branches | ☐ |
| 39 | Zero unguarded `supabase.functions.invoke()` calls | Same grep pattern | ☐ |
| 40 | Zero remaining `supabase.auth.*` calls | Same grep pattern | ☐ |
| 41 | E2E test: Login → Dashboard → CRUD → Logout (all via NestJS) | Manual browser test | ☐ |

**✅ Phase 3 Complete — 41 items**

---

## Phase 4 — Data Migration

> 📖 Full guide: [NEXT-STEPS.md → Phase 4](./NEXT-STEPS.md#phase-4-data-migration)
>
> **Time Estimate**: 1–2 days

### 4.1 Preparation

| # | Item | Verify | ☐ |
|---|------|--------|---|
| 1 | Supabase service role key obtained | Key stored securely | ☐ |
| 2 | `.env.migration` configured | All 5 variables set | ☐ |
| 3 | Cross-account IAM role accessible | `aws sts assume-role ...` succeeds | ☐ |

### 4.2 Migration Execution

| # | Item | Verify | ☐ |
|---|------|--------|---|
| 4 | Dry-run migration completed | `--dry-run` output reviewed, counts match Supabase | ☐ |
| 5 | Data migration executed | `migrate-from-supabase.ts` completes without errors | ☐ |
| 6 | All accounts migrated | DynamoDB scan matches Supabase row count | ☐ |
| 7 | All licenses migrated | License records present with correct scoping | ☐ |
| 8 | All users migrated | Technical user records match | ☐ |
| 9 | All groups, roles, permissions migrated | RBAC chain intact | ☐ |
| 10 | All workstreams + tools migrated | Workstream records + tool assignments | ☐ |
| 11 | All credentials migrated | Credential records present | ☐ |
| 12 | All pipelines migrated | Pipeline records present | ☐ |
| 13 | Products & Services (master data) migrated | `PRODUCT#LIST` and `SERVICE#LIST` partitions populated | ☐ |
| 14 | Enterprise → Product/Service links migrated | Junction records present | ☐ |

### 4.3 Cognito User Reconciliation

| # | Item | Verify | ☐ |
|---|------|--------|---|
| 15 | Cognito users provisioned for all active technical users | `--with-cognito` flag used | ☐ |
| 16 | Custom attributes synced (account_id, enterprise_id, role) | Check Cognito user attributes | ☐ |
| 17 | CognitoSub mapped back to DynamoDB records | `cognitoSub` field populated | ☐ |
| 18 | Credential notification emails sent via SES | SES logs confirm sends | ☐ |

### 4.4 Verification

| # | Item | Verify | ☐ |
|---|------|--------|---|
| 19 | `verify-migration.ts` all green | All row counts match | ☐ |
| 20 | SSM parameters exist for all accounts | `aws ssm get-parameters-by-path ...` | ☐ |
| 21 | GSI1/GSI2/GSI3 data populated correctly | Spot-check DynamoDB queries | ☐ |
| 22 | Manual spot-check: pick 3 accounts, verify all related entities | Browser or CLI | ☐ |

**✅ Phase 4 Complete — 22 items**

---

## Phase 5 — Production Hardening

> 📖 Full guide: [NEXT-STEPS.md → Phase 5](./NEXT-STEPS.md#phase-5-production-hardening)
>
> **Time Estimate**: 1–2 days

### 5.1 Security

| # | Item | Verify | ☐ |
|---|------|--------|---|
| 1 | WAF enabled (`enable_waf = true`) | `terraform output` confirms WAF WebACL | ☐ |
| 2 | WAF SQL injection rules active | Test with SQLi payload → blocked | ☐ |
| 3 | WAF known bad inputs rules active | Test with known attack → blocked | ☐ |
| 4 | Auth rate limiting active (100 req/5min on `/auth/*`) | Load test confirms throttling | ☐ |
| 5 | Cognito MFA enabled (TOTP) | `cognito_enable_mfa = true` in `prod.tfvars` | ☐ |
| 6 | Cognito advanced security (adaptive auth) enabled | `cognito_enable_advanced_security = true` | ☐ |
| 7 | Secrets Manager auto-rotation configured | `secrets_rotation_schedule = "rate(30 days)"` | ☐ |

### 5.2 Orchestration

| # | Item | Verify | ☐ |
|---|------|--------|---|
| 8 | Step Functions enabled (`enable_step_functions = true`) | State machine deployed | ☐ |
| 9 | Test provisioning execution passes | Create test account → Step Functions succeed | ☐ |
| 10 | DLQ alarms configured | CloudWatch alarms on all 4 DLQs | ☐ |

### 5.3 Monitoring & Alerting

| # | Item | Verify | ☐ |
|---|------|--------|---|
| 11 | SNS critical alerts subscription confirmed | Email received on alarm trigger | ☐ |
| 12 | SNS warning alerts subscription confirmed | Email received on alarm trigger | ☐ |
| 13 | CloudWatch dashboard populated (7 rows) | Lambda, DDB, API GW, Cognito, SFn, Workers, DLQ | ☐ |
| 14 | Lambda error alarm triggers correctly | Inject error → alarm fires | ☐ |
| 15 | DynamoDB throttle alarm configured | Alarm present in CloudWatch | ☐ |
| 16 | API Gateway 4XX/5XX alarms configured | Alarms present in CloudWatch | ☐ |

### 5.4 Frontend & Data Protection

| # | Item | Verify | ☐ |
|---|------|--------|---|
| 17 | S3 versioning enabled for frontend bucket | `frontend_enable_versioning = true` | ☐ |
| 18 | Frontend rollback workflow tested | `rollback-frontend.yml` restores previous version | ☐ |
| 19 | DynamoDB deletion protection enabled | All tables have `DeletionProtectionEnabled = true` | ☐ |
| 20 | DynamoDB point-in-time recovery enabled | PITR status = `ENABLED` | ☐ |
| 21 | CloudFront cache configured | Default TTL = 3600, Max TTL = 86400 | ☐ |

**✅ Phase 5 Complete — 21 items**

---

## Phase 6 — Go-Live Cutover

> 📖 Full guide: [NEXT-STEPS.md → Phase 6](./NEXT-STEPS.md#phase-6-go-live-cutover)
>
> **Time Estimate**: 2–4 hours (maintenance window)

### 6.1 Pre-Cutover Validation

| # | Item | Verify | ☐ |
|---|------|--------|---|
| 1 | All Phase 1–5 checklists complete | This document fully checked | ☐ |
| 2 | NestJS Lambda healthy | `curl /health` → 200 | ☐ |
| 3 | Cognito User Pool provisioned | Pool ID + Client ID confirmed | ☐ |
| 4 | Day-0 bootstrap verified | `verify-bootstrap.ts --fix` → 14/14 green | ☐ |
| 5 | DynamoDB shared table exists | `describe-table` succeeds | ☐ |
| 6 | SSM parameters populated | Root account params exist | ☐ |
| 7 | Cross-account IAM role functional | Lambda can assume role | ☐ |
| 8 | Data migration verified | `verify-migration.ts` all green | ☐ |
| 9 | Cognito users provisioned | All active users have Cognito identities | ☐ |
| 10 | WAF + API Gateway rate limits active | Confirmed in AWS Console | ☐ |
| 11 | CloudWatch alarms configured | 4XX/5XX, Lambda errors, DDB throttles | ☐ |
| 12 | DNS / CORS ready | API Gateway custom domain + CORS configured | ☐ |
| 13 | Secrets Manager populated | JWT keys + Cognito config present | ☐ |
| 14 | SES production access granted | Sender domain/email verified | ☐ |
| 15 | Step Functions operational | Test execution passes | ☐ |
| 16 | `pre-flight-check.ts` passes | All 70+ checks green | ☐ |
| 17 | All hooks converted to dual-mode | `grep -rL "isExternalApi" src/hooks/use*.ts` returns empty | ☐ |
| 18 | All contexts converted | 4 contexts branch on `isExternalApi()` | ☐ |
| 19 | All 7 edge function equivalents deployed | NestJS endpoints responding 200 | ☐ |
| 20 | Cognito reconciliation dry-run clean | `POST /api/users/reconcile/cognito?dryRun=true` → zero drift | ☐ |
| 21 | Products & Services seed data present | `/api/products` and `/api/services` return expected data | ☐ |

### 6.2 Edge Function Equivalents

All 7 Supabase Edge Functions must have NestJS equivalents before cutover:

| # | Edge Function | NestJS Equivalent | Responds 200 | ☐ |
|---|---------------|-------------------|---------------|---|
| 22 | `create-admin-user` | Cognito `adminCreateUser` + DynamoDB write | ☐ | ☐ |
| 23 | `create-technical-user` | `POST /api/users/provision` | ☐ | ☐ |
| 24 | `check-credential-expiration` | `POST /api/credentials/check-expiration` | ☐ | ☐ |
| 25 | `send-renewal-reminders` | `POST /api/licenses/send-reminders` | ☐ | ☐ |
| 26 | `update-expired-users` | NestJS cron / Step Function | ☐ | ☐ |
| 27 | `connector-oauth` | `GET/POST /api/connectors/oauth/*` | ☐ | ☐ |
| 28 | `test-connector-connectivity` | `POST /api/connectors/test` | ☐ | ☐ |

### 6.3 Execute Cutover

| # | Item | Verify | ☐ |
|---|------|--------|---|
| 29 | Maintenance window communicated to users | Notification sent | ☐ |
| 30 | On-call team identified | Contact info distributed | ☐ |
| 31 | Final incremental data sync | `migrate-from-supabase.ts --incremental` | ☐ |
| 32 | Frontend built with `VITE_API_PROVIDER=external` | `npm run build` succeeds | ☐ |
| 33 | Frontend deployed to S3 + CloudFront invalidated | Pipeline succeeds | ☐ |
| 34 | Production health check passes | `curl /health` → 200 | ☐ |
| 35 | DNS updated (if custom domain) | `app.example.com` resolves to CloudFront | ☐ |
| 36 | Admin login works | `admin@adminplatform.com` → dashboard loads | ☐ |
| 37 | Sample CRUD operation succeeds | Create → edit → delete a test entity | ☐ |

### 6.4 Post-Cutover (First 24 Hours)

| # | Item | Verify | ☐ |
|---|------|--------|---|
| 38 | Lambda error count = 0 | CloudWatch Metrics check | ☐ |
| 39 | DLQ depth = 0 (all 4 queues) | SQS attribute check | ☐ |
| 40 | No cross-tenant data leakage | Log in as scoped user, verify isolation | ☐ |
| 41 | Token refresh works (no forced re-login) | Stay logged in > 1 hour | ☐ |
| 42 | All scheduled jobs execute | Credential expiry, license reminders, expired user deactivation | ☐ |

**✅ Phase 6 Complete — 42 items**

---

## Post-Cutover Hardening (48h+ After Go-Live)

> Only after **48-hour stabilization window** with no P0/P1 incidents.

| # | Item | Verify | ☐ |
|---|------|--------|---|
| 1 | Remove `@supabase/supabase-js` dependency | `npm uninstall @supabase/supabase-js` | ☐ |
| 2 | Delete `src/integrations/supabase/` | Files removed | ☐ |
| 3 | Remove dual-mode branches (`isExternalApi()` checks) | All 9 categories (A–I) cleaned | ☐ |
| 4 | Remove `ensureDefaultWorkstream` client-side logic | Handled by NestJS | ☐ |
| 5 | Delete `VITE_SUPABASE_*` env vars from all environments | Vars removed | ☐ |
| 6 | Delete `supabase/functions/` directory | 8 edge functions removed | ☐ |
| 7 | Archive/pause Supabase project | Project paused (keep 30 days) | ☐ |
| 8 | Simplify `http-client.ts` to always use Cognito tokens | `API_CONFIG.provider` removed | ☐ |
| 9 | Remove Supabase query paths from all 4 Context Providers | Contexts simplified | ☐ |
| 10 | Remove Supabase-related CI/CD pipeline steps | Workflows updated | ☐ |
| 11 | Run Cognito reconciliation (final) | `/api/users/reconcile/cognito` → zero drift | ☐ |
| 12 | Verify nightly pre-flight checks running | Scheduled CI reports clean | ☐ |
| 13 | Confirm CloudWatch dashboards populated | All 7 metric rows active | ☐ |

**✅ Post-Cutover Complete — 13 items**

---

## Grand Total

| Phase | Items | Execution Guide | Status |
|-------|-------|-----------------|--------|
| Phase 1 — AWS Foundation | 75 | [PHASE1-END-TO-END-EXECUTION.md](./PHASE1-END-TO-END-EXECUTION.md) | ☐ |
| Phase 2 — CI/CD Pipeline | 44 | [PHASE2-END-TO-END-EXECUTION.md](./PHASE2-END-TO-END-EXECUTION.md) | ☐ |
| Phase 3 — Frontend Migration | 41 | [NEXT-STEPS.md → Phase 3](./NEXT-STEPS.md#phase-3-frontend-migration) | ☐ |
| Phase 4 — Data Migration | 22 | [NEXT-STEPS.md → Phase 4](./NEXT-STEPS.md#phase-4-data-migration) | ☐ |
| Phase 5 — Production Hardening | 21 | [NEXT-STEPS.md → Phase 5](./NEXT-STEPS.md#phase-5-production-hardening) | ☐ |
| Phase 6 — Go-Live Cutover | 42 | [NEXT-STEPS.md → Phase 6](./NEXT-STEPS.md#phase-6-go-live-cutover) | ☐ |
| Post-Cutover Hardening | 13 | — | ☐ |
| **Total** | **258** | | |

---

*Document created: 2026-02-08 · Updated: 2026-02-08*
*Cross-linked to: [PHASE1-END-TO-END-EXECUTION.md](./PHASE1-END-TO-END-EXECUTION.md), [PHASE1-SETUP-GUIDE.md](./PHASE1-SETUP-GUIDE.md), [NEXT-STEPS.md](./NEXT-STEPS.md), [ARCHITECTURE.md](./ARCHITECTURE.md), [GITHUB-SECRETS-CHEATSHEET.md](./GITHUB-SECRETS-CHEATSHEET.md)*
