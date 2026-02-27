# Phase 1: End-to-End Execution Guide — From Lovable Download to Running Platform

> **Audience**: Developers executing Phase 1 for the first time. Every single step is documented.
>
> **Time Estimate**: ~4–6 hours
>
> **Outcome**: Code downloaded, two AWS accounts provisioned, infrastructure live (without CloudFront), platform bootstrapped, API responding, frontend served via S3 static hosting or local dev server.
>
> **⚠️ CloudFront Note**: This guide **intentionally skips CloudFront** (CDN) due to service quota limitations. The frontend is served either via **S3 Static Website Hosting** (for team access) or **local Vite dev server** (for solo dev). CloudFront can be added later in Phase 2+ once the quota is approved.

---

## Table of Contents

1. [Download Code from Lovable](#step-1-download-code-from-lovable)
2. [Understand the Repository Structure](#step-2-understand-the-repository-structure)
3. [Install Prerequisites](#step-3-install-prerequisites)
4. [Create Two AWS Accounts](#step-4-create-two-aws-accounts)
5. [Configure AWS CLI Profiles](#step-5-configure-aws-cli-profiles)
6. [Create the Shared DynamoDB Table (Customer Account)](#step-6-create-the-shared-dynamodb-table-customer-account)
7. [Set Up Cross-Account IAM Role](#step-7-set-up-cross-account-iam-role)
8. [Prepare Terraform Variables](#step-8-prepare-terraform-variables)
9. [Run Terraform (Platform Admin Account)](#step-9-run-terraform-platform-admin-account)
10. [Verify Terraform Outputs](#step-10-verify-terraform-outputs)
11. [Confirm SNS Email Subscriptions](#step-11-confirm-sns-email-subscriptions)
12. [Verify & Configure AWS SES](#step-12-verify--configure-aws-ses)
13. [Configure GitHub Environment Secrets](#step-13-configure-github-environment-secrets)
14. [Build & Deploy the NestJS Backend to Lambda](#step-14-build--deploy-the-nestjs-backend-to-lambda)
15. [Configure Lambda Environment Variables](#step-15-configure-lambda-environment-variables)
16. [Run Day-0 Bootstrap](#step-16-run-day-0-bootstrap)
17. [Verify Bootstrap](#step-17-verify-bootstrap)
18. [Run Pre-Flight Check](#step-18-run-pre-flight-check)
19. [Smoke-Test the API](#step-19-smoke-test-the-api)
20. [Deploy Frontend (Without CloudFront)](#step-20-deploy-frontend-without-cloudfront)
21. [Final Verification & Checklist](#step-21-final-verification--checklist)

---

## Step 1: Download Code from Lovable

### Option A: Connect GitHub Repository (Recommended)

This gives you a synced Git repo that tracks all Lovable changes.

1. In Lovable, click the **project name** (top-left) → **Settings**
2. Go to the **GitHub** tab under **"Connectors"**
3. Click **"Connect to GitHub"** and authorize the Lovable GitHub App
4. Choose an existing repo or create a new one (e.g., `my-org/license-portal`)
5. Lovable will push the entire codebase to the `main` branch

```bash
# Clone the repo to your local machine
git clone https://github.com/YOUR-ORG/license-portal.git
cd license-portal

# Verify the code is there
ls -la docs/nestjs-backend/
# You should see: src/ terraform/ scripts/ package.json tsconfig.json etc.
```

### Option B: Download as ZIP

If you prefer not to connect GitHub:

1. In Lovable, click the **project name** (top-left) → **Settings**
2. Look for the **"Download"** or **"Export"** option
3. Download the ZIP file
4. Extract it to a working directory

```bash
# After extracting
cd license-portal
ls -la docs/nestjs-backend/
```

### Option C: Use Lovable Code Editor to Copy Files

1. In Lovable, switch to **Code Editor View** (top-left toggle)
2. Browse the file tree and copy the `docs/nestjs-backend/` directory contents manually

> **📝 Important**: The backend code, Terraform modules, CI/CD workflows, and migration scripts are all in `docs/nestjs-backend/`. The frontend React code is in the root `src/` directory.

---

## Step 2: Understand the Repository Structure

```
license-portal/
├── src/                          ← React/Vite Frontend (runs on Lovable today)
│   ├── components/               ← UI components
│   ├── contexts/                 ← Auth, Account, Enterprise, Permission contexts
│   ├── hooks/                    ← Data hooks (dual-mode: Supabase + NestJS)
│   ├── lib/
│   │   ├── api/                  ← NestJS HTTP client & service layer
│   │   └── auth/                 ← Cognito auth client
│   └── pages/                    ← Route pages
│
├── docs/nestjs-backend/          ← EVERYTHING for AWS deployment
│   ├── src/                      ← NestJS backend application
│   │   ├── auth/                 ← Cognito JWT guards, decorators
│   │   ├── accounts/             ← Account CRUD
│   │   ├── enterprises/          ← Enterprise management
│   │   ├── licenses/             ← License enforcement
│   │   ├── users/                ← User CRUD + Cognito provisioning
│   │   ├── groups/               ← Group management
│   │   ├── roles/                ← Roles + permissions
│   │   ├── workstreams/          ← Workstream management
│   │   ├── products/             ← Master data
│   │   ├── services/             ← Master data
│   │   ├── pipelines/            ← Pipeline CRUD
│   │   ├── provisioning/         ← Account provisioning lifecycle
│   │   ├── bootstrap/            ← Day-0 bootstrap controller
│   │   ├── workers/              ← Step Functions worker handlers
│   │   └── common/               ← DynamoDB router, secrets, events, metrics
│   │
│   ├── scripts/                  ← Operational scripts
│   │   ├── bootstrap-day0.ts     ← Platform initialization (14 steps)
│   │   ├── verify-bootstrap.ts   ← Bootstrap verification + auto-fix
│   │   ├── pre-flight-check.ts   ← 70+ infrastructure health checks
│   │   ├── migrate-from-supabase.ts ← Data migration (Phase 4)
│   │   └── seed-sample-data.ts   ← Sample data for testing
│   │
│   ├── terraform/                ← Infrastructure as Code
│   │   ├── main.tf               ← Root module composition
│   │   ├── variables.tf          ← All variable declarations
│   │   ├── outputs.tf            ← Output values
│   │   ├── versions.tf           ← Provider versions
│   │   ├── environments/         ← Per-environment tfvars
│   │   │   ├── dev.tfvars
│   │   │   ├── qa.tfvars
│   │   │   ├── staging.tfvars
│   │   │   └── prod.tfvars
│   │   └── modules/              ← Terraform modules
│   │       ├── cognito/          ← User Pool, Client, Groups
│   │       ├── lambda/           ← NestJS Lambda + IAM
│   │       ├── api-gateway/      ← REST API + stage
│   │       ├── dynamodb/         ← Control plane config table
│   │       ├── frontend-hosting/ ← S3 + CloudFront CDN (SKIPPED in Phase 1)
│   │       ├── monitoring/       ← CloudWatch alarms + SNS
│   │       ├── waf/              ← Web Application Firewall
│   │       ├── secrets-manager/  ← Secrets rotation
│   │       ├── step-functions/   ← Provisioning orchestrator
│   │       ├── worker-lambdas/   ← Step Functions workers
│   │       ├── eventbridge/      ← Provisioning events
│   │       ├── autoscaling/      ← DynamoDB + Lambda scaling
│   │       └── account-provisioning/ ← Private account setup
│   │
│   ├── .github/workflows/        ← CI/CD pipelines
│   │   ├── workspace-pipeline.yml  ← Main deploy pipeline
│   │   ├── deploy-frontend.yml     ← Frontend-only deploy
│   │   ├── infrastructure.yml      ← Terraform-only apply
│   │   ├── ci.yml                  ← Lint, test, build
│   │   ├── pr-validation.yml       ← PR checks
│   │   ├── scheduled.yml           ← Nightly pre-flight
│   │   ├── rollback-frontend.yml   ← Frontend rollback
│   │   ├── destroy-infrastructure.yml ← Safe teardown
│   │   └── post-deploy-verify.yml  ← Post-deploy validation
│   │
│   └── cloudformation/           ← Private account DynamoDB template
│       └── private-account-dynamodb.yaml
│
├── docs/
│   ├── ARCHITECTURE.md           ← Full architecture reference
│   ├── PHASE1-SETUP-GUIDE.md     ← Detailed Phase 1 guide
│   ├── NEXT-STEPS.md             ← Phases 2–6 roadmap
│   ├── MIGRATION-CHECKLIST.md    ← Progress tracking checklist
│   └── GITHUB-SECRETS-CHEATSHEET.md ← All secrets reference
│
└── supabase/                     ← Legacy Supabase (being migrated away)
    └── functions/                ← Edge functions (to be replaced)
```

---

## Step 3: Install Prerequisites

### 3.1 AWS CLI v2

```bash
# macOS
brew install awscli

# Linux
curl "https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip" -o "awscliv2.zip"
unzip awscliv2.zip && sudo ./aws/install

# Windows → Download MSI from https://aws.amazon.com/cli/

# Verify
aws --version
# Expected: aws-cli/2.x.x
```

### 3.2 Terraform (>= 1.0.0)

```bash
# macOS
brew tap hashicorp/tap && brew install hashicorp/tap/terraform

# Linux/Windows → https://developer.hashicorp.com/terraform/downloads

# Verify
terraform --version
# Expected: Terraform v1.x.x
```

### 3.3 Node.js (>= 18.x)

```bash
# Using nvm (recommended)
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash
nvm install 18 && nvm use 18

# Verify
node --version   # >= 18.x
npm --version    # >= 9.x
```

### 3.4 Git & GitHub CLI

```bash
# macOS
brew install git gh

# Verify
git --version
gh --version

# Authenticate GitHub CLI (needed for secrets in Step 13)
gh auth login
```

### 3.5 jq (JSON processor — used in verification commands)

```bash
# macOS
brew install jq

# Linux
sudo apt-get install jq    # Debian/Ubuntu
sudo yum install jq        # RHEL/CentOS

# Verify
jq --version
```

**✅ Checkpoint**: All five tools installed and verified.

---

## Step 4: Create Two AWS Accounts

You need **two separate AWS accounts** for Control Plane / Data Plane isolation.

### 4.1 Account 1: Platform Admin (Control Plane)

Hosts: Backend API, Cognito auth, monitoring, alerting.

1. Go to [https://aws.amazon.com](https://aws.amazon.com) → **"Create an AWS Account"**
2. Enter your email, choose account name (e.g., `my-platform-admin`)
3. Complete billing info and phone verification
4. Choose **Basic (Free)** support plan
5. Sign in to the console

**📝 Write down:**
```
Platform Admin Account ID: _____________ (12-digit, top-right → Account)
Root Email:                _____________
```

### 4.2 Account 2: Customer Data (Data Plane)

Hosts: **Only** DynamoDB tables for customer data.

1. Open **incognito browser** → [https://aws.amazon.com](https://aws.amazon.com)
2. **"Create an AWS Account"** with a **different email**
3. Account name: `my-customer-data`

**📝 Write down:**
```
Customer Data Account ID:  _____________ (12-digit)
Root Email:                _____________
```

### 4.3 Create IAM Admin Users in Both Accounts

> ⚠️ **Never use root credentials for daily work.**

#### In Platform Admin Account:

1. AWS Console → **IAM** → **Users** → **Create user**
2. User name: `platform-admin-terraform`
3. Attach policy: `AdministratorAccess`
4. **Security credentials** → **Create access key** → **CLI** → Create

**📝 Save securely:**
```
Platform Admin Access Key ID:     AKIA___________________
Platform Admin Secret Access Key: ________________________
```

#### In Customer Data Account:

1. Repeat with user name: `customer-data-terraform`
2. Attach `AdministratorAccess`
3. Create access key for CLI

**📝 Save securely:**
```
Customer Data Access Key ID:      AKIA___________________
Customer Data Secret Access Key:  ________________________
```

**✅ Checkpoint**: Two AWS accounts created, two IAM users with access keys.

---

## Step 5: Configure AWS CLI Profiles

```bash
# Profile for Platform Admin Account
aws configure --profile platform-admin
#   AWS Access Key ID:     <Platform Admin Key>
#   AWS Secret Access Key: <Platform Admin Secret>
#   Default region:        us-east-1
#   Default output:        json

# Profile for Customer Data Account
aws configure --profile customer-data
#   AWS Access Key ID:     <Customer Data Key>
#   AWS Secret Access Key: <Customer Data Secret>
#   Default region:        us-east-1
#   Default output:        json
```

### Verify Both Profiles

```bash
aws sts get-caller-identity --profile platform-admin
# Should show Platform Admin Account ID

aws sts get-caller-identity --profile customer-data
# Should show Customer Data Account ID
```

**✅ Checkpoint**: Both CLI profiles working.

---

## Step 6: Create the Shared DynamoDB Table (Customer Account)

> 🔑 **Critical manual step**: The Customer Data Account needs a shared DynamoDB table for Public Cloud customers.

### 6.1 Create the Table

```bash
aws dynamodb create-table \
  --table-name dev_data \
  --attribute-definitions \
    AttributeName=PK,AttributeType=S \
    AttributeName=SK,AttributeType=S \
    AttributeName=GSI1PK,AttributeType=S \
    AttributeName=GSI1SK,AttributeType=S \
    AttributeName=GSI2PK,AttributeType=S \
    AttributeName=GSI2SK,AttributeType=S \
    AttributeName=GSI3PK,AttributeType=S \
    AttributeName=GSI3SK,AttributeType=S \
  --key-schema \
    AttributeName=PK,KeyType=HASH \
    AttributeName=SK,KeyType=RANGE \
  --global-secondary-indexes \
    '[
      {
        "IndexName": "GSI1",
        "KeySchema": [
          {"AttributeName":"GSI1PK","KeyType":"HASH"},
          {"AttributeName":"GSI1SK","KeyType":"RANGE"}
        ],
        "Projection": {"ProjectionType":"ALL"}
      },
      {
        "IndexName": "GSI2",
        "KeySchema": [
          {"AttributeName":"GSI2PK","KeyType":"HASH"},
          {"AttributeName":"GSI2SK","KeyType":"RANGE"}
        ],
        "Projection": {"ProjectionType":"ALL"}
      },
      {
        "IndexName": "GSI3",
        "KeySchema": [
          {"AttributeName":"GSI3PK","KeyType":"HASH"},
          {"AttributeName":"GSI3SK","KeyType":"RANGE"}
        ],
        "Projection": {"ProjectionType":"ALL"}
      }
    ]' \
  --billing-mode PAY_PER_REQUEST \
  --stream-specification StreamEnabled=true,StreamViewType=NEW_AND_OLD_IMAGES \
  --sse-specification Enabled=true \
  --tags \
    Key=Environment,Value=dev \
    Key=Project,Value=license-portal \
    Key=ManagedBy,Value=manual \
    Key=Purpose,Value="Shared multi-tenant table for public cloud accounts" \
  --region us-east-1 \
  --profile customer-data
```

### 6.2 Verify the Table (~30 seconds)

```bash
aws dynamodb describe-table \
  --table-name dev_data \
  --query 'Table.{Name:TableName,Status:TableStatus,ItemCount:ItemCount,GSIs:GlobalSecondaryIndexes[*].IndexName}' \
  --profile customer-data \
  --region us-east-1
```

Expected:
```json
{
    "Name": "dev_data",
    "Status": "ACTIVE",
    "ItemCount": 0,
    "GSIs": ["GSI1", "GSI2", "GSI3"]
}
```

**✅ Checkpoint**: `dev_data` table active with 3 GSIs.

---

## Step 7: Set Up Cross-Account IAM Role

The Platform Admin Lambda needs to access DynamoDB in the Customer Account.

### 7.1 In Customer Data Account — Create the Trust Policy

1. AWS Console → **IAM** → **Roles** → **Create role**
2. Trusted entity: **Another AWS account** → Enter **Platform Admin Account ID**
3. Click **Next**

### 7.2 Create a Custom Permissions Policy

Click **Create policy** → **JSON** → paste:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "DynamoDBFullTableAccess",
      "Effect": "Allow",
      "Action": [
        "dynamodb:GetItem",
        "dynamodb:PutItem",
        "dynamodb:UpdateItem",
        "dynamodb:DeleteItem",
        "dynamodb:Query",
        "dynamodb:Scan",
        "dynamodb:BatchGetItem",
        "dynamodb:BatchWriteItem",
        "dynamodb:DescribeTable",
        "dynamodb:CreateTable",
        "dynamodb:DeleteTable",
        "dynamodb:UpdateTable",
        "dynamodb:TagResource",
        "dynamodb:UntagResource",
        "dynamodb:ListTagsOfResource",
        "dynamodb:UpdateContinuousBackups",
        "dynamodb:DescribeContinuousBackups",
        "dynamodb:UpdateTimeToLive",
        "dynamodb:DescribeTimeToLive"
      ],
      "Resource": [
        "arn:aws:dynamodb:us-east-1:*:table/dev_data",
        "arn:aws:dynamodb:us-east-1:*:table/dev_data/index/*",
        "arn:aws:dynamodb:us-east-1:*:table/license-portal-dev-account-*",
        "arn:aws:dynamodb:us-east-1:*:table/license-portal-dev-account-*/index/*"
      ]
    },
    {
      "Sid": "SSMParameterAccess",
      "Effect": "Allow",
      "Action": [
        "ssm:PutParameter",
        "ssm:GetParameter",
        "ssm:GetParameters",
        "ssm:GetParametersByPath",
        "ssm:DeleteParameter",
        "ssm:AddTagsToResource"
      ],
      "Resource": [
        "arn:aws:ssm:us-east-1:*:parameter/accounts/*",
        "arn:aws:ssm:us-east-1:*:parameter/platform/*"
      ]
    },
    {
      "Sid": "CloudFormationForPrivateAccounts",
      "Effect": "Allow",
      "Action": [
        "cloudformation:CreateStack",
        "cloudformation:UpdateStack",
        "cloudformation:DeleteStack",
        "cloudformation:DescribeStacks",
        "cloudformation:DescribeStackEvents",
        "cloudformation:DescribeStackResources",
        "cloudformation:GetTemplate"
      ],
      "Resource": "arn:aws:cloudformation:us-east-1:*:stack/license-portal-dev-account-*/*"
    }
  ]
}
```

4. Name the policy: `PlatformCrossAccountAccess`
5. Back to role creation → attach `PlatformCrossAccountAccess`
6. Name the role: `PlatformAdminCrossAccountRole`
7. Click **Create role**

**📝 Write down the Role ARN:**
```
arn:aws:iam::<CUSTOMER_ACCOUNT_ID>:role/PlatformAdminCrossAccountRole
```

**✅ Checkpoint**: Cross-account role created and ARN recorded.

---

## Step 8: Prepare Terraform Variables

### 8.1 Navigate to Terraform Directory

```bash
cd docs/nestjs-backend/terraform
```

### 8.2 Copy and Edit Config

```bash
cp terraform.tfvars.example terraform.tfvars
```

Edit `terraform.tfvars` — set these critical values:

```hcl
# Core
project_name = "license-portal"
environment  = "dev"
aws_region   = "us-east-1"

# DynamoDB (Control Plane config table — NOT the shared data table)
table_prefix                  = "dev_"
dynamodb_billing_mode         = "PAY_PER_REQUEST"
enable_point_in_time_recovery = false
enable_deletion_protection    = false

# Lambda
lambda_memory_size  = 256
lambda_timeout      = 30
lambda_runtime      = "nodejs20.x"
lambda_architecture = "arm64"
lambda_package_path = "../lambda-package.zip"     # ← Built in Step 14

# API Gateway
api_gateway_stage_name             = "dev"
enable_api_gateway_logging         = true
api_gateway_throttling_rate_limit  = 100
api_gateway_throttling_burst_limit = 200

# Cognito
cognito_callback_urls = [
  "http://localhost:5173/callback",
  "http://localhost:3000/callback"
]
cognito_logout_urls = [
  "http://localhost:5173",
  "http://localhost:3000"
]
cognito_enable_mfa               = false   # Enable for production
cognito_enable_advanced_security = false

# Monitoring — ⚠️ CHANGE THIS EMAIL
monitoring_alert_email = "your-email@company.com"
log_retention_days     = 7
enable_xray_tracing    = false
enable_lambda_insights = false

# Account Provisioning
enable_account_provisioning          = true
account_provisioning_enable_alarms   = false
default_private_account_billing_mode = "PAY_PER_REQUEST"

# ═══════════════════════════════════════════════════════════════
# ⚠️ FRONTEND HOSTING DISABLED — No CloudFront quota
# ═══════════════════════════════════════════════════════════════
# CloudFront is NOT being provisioned in Phase 1.
# The frontend will be served via:
#   Option A: S3 Static Website Hosting (public endpoint)
#   Option B: Local Vite dev server (http://localhost:5173)
# CloudFront can be added later once the service quota is approved.
enable_frontend_hosting = false

# Disabled for dev
enable_waf             = false
enable_secrets_manager = false
enable_vpc             = false

additional_tags = {
  CostCenter = "development"
  Team       = "platform"
}
```

> **⚠️ Key Difference**: `enable_frontend_hosting = false` — this skips creation of the S3 bucket and CloudFront distribution via Terraform. We'll create a standalone S3 bucket for static hosting manually in Step 20.

**✅ Checkpoint**: `terraform.tfvars` configured with your values (no CloudFront).

---

## Step 9: Run Terraform (Platform Admin Account)

### 9.1 Set AWS Profile

```bash
export AWS_PROFILE=platform-admin
```

### 9.2 Initialize Terraform

```bash
cd docs/nestjs-backend/terraform
terraform init
```

Expected: `Terraform has been successfully initialized!`

### 9.3 Create Workspace (Optional)

```bash
terraform workspace new dev
```

### 9.4 Plan — Preview Resources

```bash
terraform plan -var-file="environments/dev.tfvars" -out=plan.tfplan
```

Review the plan. Expected ~20+ resources (fewer than with CloudFront):

| Resource | Description |
|----------|-------------|
| `aws_cognito_user_pool` | User Pool with custom attributes |
| `aws_cognito_user_pool_client` | App client with OAuth flows |
| `aws_lambda_function` | NestJS backend |
| `aws_api_gateway_rest_api` | REST API + stage |
| `aws_dynamodb_table` | Control plane config table |
| `aws_cloudwatch_metric_alarm` | 8+ monitoring alarms |
| `aws_sns_topic` | Alert notifications |
| `aws_ssm_parameter` | Platform config parameters |

> **📝 Note**: No S3 bucket or CloudFront distribution will appear — this is expected.

### 9.5 Apply — Create All Resources

```bash
terraform apply plan.tfplan
```

Takes **2–5 minutes** (faster without CloudFront).

### 9.6 Save the Outputs

```bash
terraform output -json > terraform-outputs.json
```

**✅ Checkpoint**: Terraform apply succeeded, outputs saved.

---

## Step 10: Verify Terraform Outputs

```bash
# Core outputs
terraform output api_gateway_url
terraform output cognito_user_pool_id
terraform output cognito_client_id
terraform output lambda_function_name
terraform output dynamodb_table_name
```

> **📝 Note**: No `frontend_bucket_name`, `frontend_distribution_id`, or `frontend_url` outputs — CloudFront is disabled. This is expected.

**📝 Record all these values** — you'll need them in Steps 13, 15, and 20.

### Verify in AWS Console

| Service | What to Check |
|---------|---------------|
| **Cognito** | User Pool exists with custom attributes (`account_id`, `enterprise_id`, `role`) |
| **Lambda** | Function exists |
| **API Gateway** | REST API with deployed stage |
| **DynamoDB** | Control plane config table exists |

**✅ Checkpoint**: All infrastructure resources verified in console (no CloudFront expected).

---

## Step 11: Confirm SNS Email Subscriptions

Terraform created SNS topics for alerts. You must confirm the subscription emails.

### 11.1 Check Your Email Inbox

Look for **"AWS Notification — Subscription Confirmation"** emails from `no-reply@sns.amazonaws.com`. Click **"Confirm subscription"** in each (you should have 2: critical + warning).

### 11.2 Verify

```bash
CRITICAL_TOPIC_ARN=$(terraform output -raw monitoring_critical_alerts_topic_arn)

aws sns list-subscriptions-by-topic \
  --topic-arn "$CRITICAL_TOPIC_ARN" \
  --query 'Subscriptions[*].{Endpoint:Endpoint,Status:SubscriptionArn}' \
  --profile platform-admin --region us-east-1
# Status should NOT be "PendingConfirmation"
```

**✅ Checkpoint**: SNS subscriptions confirmed.

---

## Step 12: Verify & Configure AWS SES

The platform sends credential notification emails. SES starts in Sandbox Mode.

### 12.1 Verify Sender Email

```bash
# Use any email you control for dev
aws ses verify-email-identity \
  --email-address "your-email@gmail.com" \
  --profile platform-admin --region us-east-1

echo "📧 Check inbox and click the SES verification link"
```

### 12.2 Verify Recipient Emails (Sandbox Only)

In Sandbox Mode, both sender and recipient must be verified:

```bash
# Verify the bootstrap admin email
aws ses verify-email-identity \
  --email-address "admin@adminplatform.com" \
  --profile platform-admin --region us-east-1
```

### 12.3 Confirm Verification

```bash
aws ses get-identity-verification-attributes \
  --identities "your-email@gmail.com" "admin@adminplatform.com" \
  --profile platform-admin --region us-east-1
# Both should show: "VerificationStatus": "Success"
```

**✅ Checkpoint**: SES sender and recipient emails verified.

---

## Step 13: Configure GitHub Environment Secrets

> 📋 Full reference: [GITHUB-SECRETS-CHEATSHEET.md](./GITHUB-SECRETS-CHEATSHEET.md)

### 13.1 Create GitHub Environments

1. GitHub repo → **Settings** → **Environments**
2. Create: **`dev`**, **`qa`**, **`prod`**
3. For `prod`: Enable required reviewers + restrict to `main` branch

### 13.2 Set Environment Secrets

```bash
ENV=dev

# Get values from Terraform
API_URL=$(terraform output -raw api_gateway_stage_url)
COGNITO_POOL=$(terraform output -raw cognito_user_pool_id)
COGNITO_CLIENT=$(terraform output -raw cognito_client_id)
COGNITO_DOMAIN=$(terraform output -raw cognito_domain)

# Set GitHub Environment secrets (no CloudFront secrets needed yet)
gh secret set VITE_API_BASE_URL                       --env $ENV --body "$API_URL"
gh secret set VITE_COGNITO_USER_POOL_ID               --env $ENV --body "$COGNITO_POOL"
gh secret set VITE_COGNITO_CLIENT_ID                  --env $ENV --body "$COGNITO_CLIENT"
gh secret set VITE_COGNITO_DOMAIN                     --env $ENV --body "$COGNITO_DOMAIN"

echo "✅ GitHub Environment secrets configured for $ENV"
```

> **📝 Note**: `FRONTEND_S3_BUCKET` and `FRONTEND_CLOUDFRONT_DISTRIBUTION_ID` are **not set** — they'll be added when CloudFront is provisioned later.

### 13.3 Verify

```bash
gh secret list --env dev
# Expected: 4 secrets listed (no S3/CloudFront secrets)
```

**✅ Checkpoint**: GitHub environment secrets configured.

---

## Step 14: Build & Deploy the NestJS Backend to Lambda

### 14.1 Install Backend Dependencies

```bash
cd docs/nestjs-backend
npm install
```

> **📝 Important**: The `package.json` includes all required AWS SDK packages (`@aws-sdk/client-cognito-identity-provider`, `@aws-sdk/client-ssm`, `@aws-sdk/client-cloudformation`, etc.), `@supabase/supabase-js` (for migration scripts), and `@types/jsonwebtoken`. Running `npm install` will fetch them all.

### 14.2 Build the Application

```bash
npm run build
```

> **📝 Note**: The `tsconfig.json` excludes the `scripts/` directory from the build because standalone scripts (bootstrap, migration, pre-flight) import additional packages and use relaxed type checking. Scripts are run separately via `ts-node` using `tsconfig.scripts.json`. All `package.json` script commands (`npm run bootstrap`, `npm run pre-flight`, etc.) already include the `--project tsconfig.scripts.json` flag, so you can use them directly:
> ```bash
> npm run bootstrap -- --dry-run
> # Equivalent to: npx ts-node --project tsconfig.scripts.json scripts/bootstrap-day0.ts --dry-run
> ```

### 14.3 Create Lambda Deployment Package

```bash
cd dist
zip -r ../lambda-package.zip .
cd ..
zip -ur lambda-package.zip node_modules
```

### 14.4 Deploy to Lambda

```bash
FUNC_NAME=$(terraform -chdir=terraform output -raw lambda_function_name)

aws lambda update-function-code \
  --function-name $FUNC_NAME \
  --zip-file fileb://lambda-package.zip \
  --profile platform-admin \
  --region us-east-1

# Wait for update to complete
aws lambda wait function-updated \
  --function-name $FUNC_NAME \
  --profile platform-admin \
  --region us-east-1

echo "✅ Lambda function updated"
```

**✅ Checkpoint**: NestJS backend deployed to Lambda.

---

## Step 15: Configure Lambda Environment Variables

### 15.1 Create `.env.migration` for Bootstrap Scripts

```bash
cat > .env.migration << 'EOF'
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=AKIA...your-platform-admin-key...
AWS_SECRET_ACCESS_KEY=wJalr...your-platform-admin-secret...

DYNAMODB_TABLE_NAME=dev_data
COGNITO_USER_POOL_ID=us-east-1_XXXXXXXXX

SSM_PREFIX=/accounts
CROSS_ACCOUNT_ROLE_ARN=arn:aws:iam::<CUSTOMER_ACCOUNT_ID>:role/PlatformAdminCrossAccountRole
EOF
```

> ⚠️ Replace all placeholder values with your actual values from Steps 4, 5, and 10.

### 15.2 Update Lambda Environment

```bash
FUNC_NAME=$(terraform -chdir=terraform output -raw lambda_function_name)
COGNITO_POOL=$(terraform -chdir=terraform output -raw cognito_user_pool_id)
COGNITO_CLIENT=$(terraform -chdir=terraform output -raw cognito_client_id)

aws lambda update-function-configuration \
  --function-name $FUNC_NAME \
  --environment Variables="{
    NODE_ENV=dev,
    AWS_REGION=us-east-1,
    DYNAMODB_TABLE_PREFIX=dev_,
    DYNAMODB_SHARED_TABLE=dev_data,
    COGNITO_USER_POOL_ID=${COGNITO_POOL},
    COGNITO_CLIENT_ID=${COGNITO_CLIENT},
    COGNITO_REGION=us-east-1,
    CROSS_ACCOUNT_ROLE_ARN=arn:aws:iam::<CUSTOMER_ACCOUNT_ID>:role/PlatformAdminCrossAccountRole
  }" \
  --profile platform-admin \
  --region us-east-1
```

> ⚠️ Replace `<CUSTOMER_ACCOUNT_ID>` with your actual Customer Data Account ID.

**✅ Checkpoint**: Lambda configured with all environment variables.

---

## Step 16: Run Day-0 Bootstrap

The bootstrap creates the root platform data: ABC account, Global enterprise, admin user, roles, groups, workstreams.

### 16.1 Dry Run First

```bash
cd docs/nestjs-backend

npm run bootstrap -- --dry-run
```

Review the output — all 14 steps should print without errors.

### 16.2 Execute Bootstrap (DynamoDB + Cognito)

```bash
npm run bootstrap -- --with-cognito
```

Expected output:
```
[1/14]  ✅ Account 'ABC' created (a0000000-0000-0000-0000-000000000001)
[2/14]  ✅ Enterprise 'Global' created
[3/14]  ✅ Product 'Global' created
[4/14]  ✅ Service 'Global' created
[5/14]  ✅ Enterprise 'Global' linked to Product 'Global'
[6/14]  ✅ Product 'Global' linked to Service 'Global'
[7/14]  ✅ License created (100 users, Global scope)
[8/14]  ✅ Role 'Platform Admin' created (permissions: 0x7FFF)
[9/14]  ✅ Role 'Technical Role' created (permissions: view-only)
[10/14] ✅ Group 'Platform Admin' created → Platform Admin role
[11/14] ✅ Group 'Technical Group' created → Technical Role role
[12/14] ✅ User 'admin@adminplatform.com' created in DynamoDB + Cognito
[13/14] ✅ Workstream 'Global' created
[14/14] ✅ Workstream 'Default' created

🎉 Bootstrap complete! 14/14 steps succeeded.

Admin credentials: admin@adminplatform.com / Adminuser@123
```

**✅ Checkpoint**: Platform bootstrapped with all core data.

---

## Step 17: Verify Bootstrap

### 17.1 Run Verification Script

```bash
npm run verify-bootstrap
```

All checks should show `✅ PASS`.

### 17.2 Auto-Fix (If Anything Failed)

```bash
npm run verify-bootstrap -- --fix
```

### 17.3 Manual Verification — DynamoDB

```bash
aws dynamodb get-item \
  --table-name dev_data \
  --key '{"PK": {"S": "ACCOUNT#a0000000-0000-0000-0000-000000000001"}, "SK": {"S": "METADATA"}}' \
  --profile customer-data --region us-east-1
```

### 17.4 Verify SSM Parameters

```bash
aws ssm get-parameters-by-path \
  --path "/accounts/a0000000-0000-0000-0000-000000000001/" \
  --recursive \
  --profile customer-data --region us-east-1
# Expected: table-name=dev_data, cloud-type=public, provisioning-status=completed
```

### 17.5 Verify Cognito Admin User

```bash
COGNITO_POOL=$(terraform -chdir=terraform output -raw cognito_user_pool_id)

aws cognito-idp admin-get-user \
  --user-pool-id $COGNITO_POOL \
  --username admin@adminplatform.com \
  --profile platform-admin --region us-east-1
```

**✅ Checkpoint**: Bootstrap verified — all data present.

---

## Step 18: Run Pre-Flight Check

The automated validation script performs 70+ checks across all infrastructure.

```bash
npm run pre-flight -- --phase 1 --verbose
```

Expected:
```
╔════════════════════════════════════════════════════════════════╗
║  Result: 30/30 checks passed ✅                               ║
╚════════════════════════════════════════════════════════════════╝
```

If any fail:
- **Bootstrap data missing** → `npm run bootstrap -- --force --with-cognito`
- **Infrastructure issues** → `terraform apply`
- **Cognito user missing** → Re-run with `--with-cognito`

**✅ Checkpoint**: Pre-flight check all green.

---

## Step 19: Smoke-Test the API

### 19.1 Get API URL

```bash
export API_URL=$(terraform -chdir=terraform output -raw api_gateway_url)
echo "API URL: $API_URL"
```

### 19.2 Health Check (Unauthenticated)

```bash
curl -s $API_URL/health | jq .
# Expected: {"status": "ok"} or similar 200 response
```

### 19.3 Get JWT Token

```bash
COGNITO_CLIENT=$(terraform -chdir=terraform output -raw cognito_client_id)

TOKEN=$(aws cognito-idp initiate-auth \
  --auth-flow USER_PASSWORD_AUTH \
  --client-id $COGNITO_CLIENT \
  --auth-parameters USERNAME=admin@adminplatform.com,PASSWORD=Adminuser@123 \
  --query 'AuthenticationResult.AccessToken' \
  --output text \
  --profile platform-admin --region us-east-1)

echo "Token: ${TOKEN:0:50}..."
```

### 19.4 Test Authenticated Endpoints

```bash
# List accounts
curl -s -H "Authorization: Bearer $TOKEN" $API_URL/api/accounts | jq .
# Expected: {"data": [{"id": "a0000000-...", "name": "ABC", ...}]}

# List enterprises
curl -s -H "Authorization: Bearer $TOKEN" $API_URL/api/enterprises | jq .

# List products
curl -s -H "Authorization: Bearer $TOKEN" $API_URL/api/products | jq .
```

**✅ Checkpoint**: API responding to both unauthenticated and authenticated requests.

---

## Step 20: Deploy Frontend (Without CloudFront)

Since CloudFront is not available, you have **two options** to serve the frontend.

### Option A: S3 Static Website Hosting (Recommended for Team Access)

This creates a publicly accessible S3 website endpoint — no CloudFront required.

#### 20A.1 Create the Frontend S3 Bucket

```bash
BUCKET_NAME="license-portal-dev-frontend-$(date +%s)"
echo "Bucket: $BUCKET_NAME"

aws s3api create-bucket \
  --bucket $BUCKET_NAME \
  --region us-east-1 \
  --profile platform-admin
```

#### 20A.2 Enable Static Website Hosting

```bash
aws s3 website "s3://${BUCKET_NAME}/" \
  --index-document index.html \
  --error-document index.html \
  --profile platform-admin
```

#### 20A.3 Disable Block Public Access (Required for Website Hosting)

```bash
aws s3api put-public-access-block \
  --bucket $BUCKET_NAME \
  --public-access-block-configuration \
    BlockPublicAcls=false,IgnorePublicAcls=false,BlockPublicPolicy=false,RestrictPublicBuckets=false \
  --profile platform-admin
```

#### 20A.4 Add a Bucket Policy for Public Read

```bash
cat > /tmp/bucket-policy.json << EOF
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "PublicReadGetObject",
      "Effect": "Allow",
      "Principal": "*",
      "Action": "s3:GetObject",
      "Resource": "arn:aws:s3:::${BUCKET_NAME}/*"
    }
  ]
}
EOF

aws s3api put-bucket-policy \
  --bucket $BUCKET_NAME \
  --policy file:///tmp/bucket-policy.json \
  --profile platform-admin
```

#### 20A.5 Build the Frontend

```bash
# Go back to the project root
cd /path/to/license-portal

npm install

# Set build-time environment variables
export VITE_API_PROVIDER=nestjs
export VITE_API_BASE_URL=$(terraform -chdir=docs/nestjs-backend/terraform output -raw api_gateway_stage_url)
export VITE_COGNITO_USER_POOL_ID=$(terraform -chdir=docs/nestjs-backend/terraform output -raw cognito_user_pool_id)
export VITE_COGNITO_CLIENT_ID=$(terraform -chdir=docs/nestjs-backend/terraform output -raw cognito_client_id)
export VITE_COGNITO_DOMAIN=$(terraform -chdir=docs/nestjs-backend/terraform output -raw cognito_domain)
export VITE_APP_ENVIRONMENT=dev

npx vite build
```

#### 20A.6 Upload to S3

```bash
# Upload everything
aws s3 sync dist/ "s3://${BUCKET_NAME}/" \
  --profile platform-admin

echo "✅ Frontend uploaded to s3://${BUCKET_NAME}/"
```

#### 20A.7 Get the Website URL and Test

```bash
WEBSITE_URL="http://${BUCKET_NAME}.s3-website-us-east-1.amazonaws.com"
echo "🌐 Frontend URL: $WEBSITE_URL"

HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$WEBSITE_URL")
echo "Frontend HTTP Status: $HTTP_STATUS"
# Expected: 200
```

#### 20A.8 Update Cognito Callback URLs

The Cognito callback URLs must include the S3 website URL:

```bash
COGNITO_POOL=$(terraform -chdir=docs/nestjs-backend/terraform output -raw cognito_user_pool_id)
COGNITO_CLIENT_ID=$(terraform -chdir=docs/nestjs-backend/terraform output -raw cognito_client_id)

aws cognito-idp update-user-pool-client \
  --user-pool-id $COGNITO_POOL \
  --client-id $COGNITO_CLIENT_ID \
  --callback-urls \
    "http://localhost:5173/callback" \
    "http://localhost:3000/callback" \
    "${WEBSITE_URL}/callback" \
  --logout-urls \
    "http://localhost:5173" \
    "http://localhost:3000" \
    "${WEBSITE_URL}" \
  --profile platform-admin --region us-east-1

echo "✅ Cognito callback URLs updated with S3 website endpoint"
```

> **⚠️ Security Note**: S3 static website endpoints use **HTTP only** (not HTTPS). This is acceptable for dev/testing but **not for production**. For HTTPS, you'll need CloudFront (Phase 2+) or an ALB.

> **📝 Save this value:**
> ```
> Frontend S3 Bucket:  ________________
> Frontend URL:        http://<bucket>.s3-website-us-east-1.amazonaws.com
> ```

---

### Option B: Local Vite Dev Server (Solo Development)

This is the fastest approach if you're the only developer.

#### 20B.1 Create a Local `.env.local`

```bash
cd /path/to/license-portal

cat > .env.local << EOF
VITE_API_PROVIDER=nestjs
VITE_API_BASE_URL=$(terraform -chdir=docs/nestjs-backend/terraform output -raw api_gateway_stage_url)
VITE_COGNITO_USER_POOL_ID=$(terraform -chdir=docs/nestjs-backend/terraform output -raw cognito_user_pool_id)
VITE_COGNITO_CLIENT_ID=$(terraform -chdir=docs/nestjs-backend/terraform output -raw cognito_client_id)
VITE_COGNITO_DOMAIN=$(terraform -chdir=docs/nestjs-backend/terraform output -raw cognito_domain)
VITE_APP_ENVIRONMENT=dev
EOF
```

#### 20B.2 Start the Dev Server

```bash
npm install
npm run dev
```

Expected:
```
  VITE v5.x.x  ready in 500ms

  ➜  Local:   http://localhost:5173/
  ➜  Network: http://192.168.x.x:5173/
```

#### 20B.3 Test in Browser

Open `http://localhost:5173` — you should see the login page. Log in with:
- **Email**: `admin@adminplatform.com`
- **Password**: `Adminuser@123`

**✅ Checkpoint**: Frontend accessible and connecting to the AWS backend.

---

## Step 21: Final Verification & Checklist

| # | Item | Verify | ☐ |
|---|------|--------|---|
| 1 | AWS CLI installed | `aws --version` → 2.x | ☐ |
| 2 | Terraform installed | `terraform --version` → 1.x | ☐ |
| 3 | Node.js installed | `node --version` → 18+ | ☐ |
| 4 | Platform Admin AWS account created | `aws sts get-caller-identity --profile platform-admin` | ☐ |
| 5 | Customer Data AWS account created | `aws sts get-caller-identity --profile customer-data` | ☐ |
| 6 | IAM users with access keys | Both CLI profiles work | ☐ |
| 7 | Shared DynamoDB table (`dev_data`) created | `describe-table` → ACTIVE, 3 GSIs | ☐ |
| 8 | DynamoDB Streams enabled | `StreamEnabled = true` | ☐ |
| 9 | Cross-account IAM role created | Role ARN recorded | ☐ |
| 10 | `terraform init` successful | No errors | ☐ |
| 11 | `terraform plan` shows ~20+ resources | Resource list reviewed (no CloudFront) | ☐ |
| 12 | `terraform apply` succeeded | All resources created | ☐ |
| 13 | Cognito User Pool created | Pool ID in output | ☐ |
| 14 | Lambda function deployed | Function name in output | ☐ |
| 15 | API Gateway stage active | URL in output | ☐ |
| 16 | SNS email subscriptions confirmed | Not `PendingConfirmation` | ☐ |
| 17 | SES sender email verified | `VerificationStatus: Success` | ☐ |
| 18 | GitHub Environment secrets configured | `gh secret list --env dev` → 4 secrets | ☐ |
| 19 | Lambda package built and deployed | `update-function-code` succeeded | ☐ |
| 20 | Lambda environment variables configured | Cross-account role ARN set | ☐ |
| 21 | Bootstrap dry-run passed | 14 steps, no errors | ☐ |
| 22 | Bootstrap executed with Cognito | 14/14 steps succeeded | ☐ |
| 23 | `verify-bootstrap.ts` all green | All categories `✅ PASS` | ☐ |
| 24 | Pre-flight check passed | `--phase 1` → 30/30 ✅ | ☐ |
| 25 | API health check passes | `curl /health` → 200 | ☐ |
| 26 | Authenticated API calls work | Bearer token returns ABC account data | ☐ |
| 27 | Frontend accessible | S3 website URL or `localhost:5173` loads login page | ☐ |
| 28 | Login works end-to-end | Admin user can sign in and see dashboard | ☐ |

---

## 🎉 Phase 1 Complete!

You now have:

- ✅ **Two AWS accounts** (Control Plane + Data Plane)
- ✅ **Core infrastructure** (Cognito, Lambda, API Gateway, DynamoDB)
- ✅ **Platform bootstrapped** (ABC account, Global enterprise, admin user, roles, groups)
- ✅ **API responding** (health + authenticated endpoints)
- ✅ **Frontend accessible** via S3 static hosting or local dev server

### What's Skipped (To Be Added Later)

| Item | When | Prerequisite |
|------|------|-------------|
| CloudFront CDN | Phase 2+ | CloudFront service quota approval |
| HTTPS on frontend | With CloudFront | CloudFront or ALB |
| API Proxy via CDN | With CloudFront | CloudFront origin config |
| Cache invalidation pipeline | With CloudFront | CloudFront distribution ID |
| WAF protection | Phase 2+ | `enable_waf = true` in tfvars |

### How to Add CloudFront Later

Once your CloudFront service quota is approved:

1. Update `terraform.tfvars`:
   ```hcl
   enable_frontend_hosting = true
   ```
2. Run `terraform plan` and `terraform apply`
3. Update Cognito callback URLs to include the CloudFront domain
4. Upload frontend to the Terraform-managed S3 bucket
5. Invalidate the CloudFront cache
6. Update GitHub secrets with `FRONTEND_S3_BUCKET` and `FRONTEND_CLOUDFRONT_DISTRIBUTION_ID`

### What's Next?

➡️ **Phase 2: CI/CD Pipeline Setup** — See [NEXT-STEPS.md](./NEXT-STEPS.md#phase-2-cicd-pipeline-setup)

This sets up GitHub Actions for automated Terraform applies, Lambda deployments, and frontend deploys with promotion gates (dev → qa → prod).

---

## Troubleshooting

| Problem | Solution |
|---------|----------|
| `terraform init` fails | Ensure you're in `docs/nestjs-backend/terraform/`. Run `terraform init -upgrade` |
| DynamoDB `Table already exists` | Expected if re-running. Verify with `describe-table` |
| Bootstrap `ConditionalCheckFailedException` | Already ran. Use `--force` flag |
| Cognito user creation fails | Check `COGNITO_USER_POOL_ID` in `.env.migration` matches `terraform output` |
| Cross-account access denied | Verify trust policy on Customer Account role includes Platform Admin Account ID |
| Lambda cold start timeout | Increase `lambda_timeout` to 60 in `terraform.tfvars`, re-apply |
| S3 website returns 403 | Verify bucket policy allows `s3:GetObject` for `"Principal": "*"` and block public access is disabled |
| S3 website returns 404 on refresh | SPA routing: set `--error-document index.html` on the S3 website config |
| CORS errors in browser | API Gateway needs `Access-Control-Allow-Origin` header. Check Lambda CORS middleware |
| `gh secret set` fails | Run `gh auth login` first. Ensure repo is connected |
