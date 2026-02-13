# Phase 1: AWS Foundation — Complete Step-by-Step Setup Guide

> **Audience**: First-time AWS users. Every command and click is documented.
>
> **Time Estimate**: ~3–4 hours (mostly waiting for Terraform apply and CloudFront distribution)
>
> **Outcome**: Two AWS accounts fully provisioned with all infrastructure (Cognito, DynamoDB, Lambda, API Gateway, CloudFront, S3, etc.) and the platform bootstrapped with a default admin.

---

## Table of Contents

1. [Prerequisites — Install Tooling](#1-prerequisites--install-tooling)
2. [Create Two AWS Accounts](#2-create-two-aws-accounts)
3. [Configure AWS CLI Profiles](#3-configure-aws-cli-profiles)
4. [Create the Shared DynamoDB Table in Customer Account](#4-create-the-shared-dynamodb-table-in-customer-account)
5. [Set Up Cross-Account IAM Role](#5-set-up-cross-account-iam-role)
6. [Prepare Terraform Variables](#6-prepare-terraform-variables)
7. [Run Terraform (Platform Admin Account)](#7-run-terraform-platform-admin-account)
8. [Verify Terraform Outputs](#8-verify-terraform-outputs)
9. [Verify Frontend Hosting (S3 + CloudFront)](#9-verify-frontend-hosting-s3--cloudfront)
10. [Confirm SNS Email Subscriptions](#10-confirm-sns-email-subscriptions)
11. [Verify & Configure AWS SES (Email Notifications)](#11-verify--configure-aws-ses-email-notifications)
12. [Configure GitHub Environment Secrets](#12-configure-github-environment-secrets)
13. [Build & Package the NestJS Backend](#13-build--package-the-nestjs-backend)
14. [Configure Environment Variables](#14-configure-environment-variables)
15. [Run Day-0 Bootstrap](#15-run-day-0-bootstrap)
16. [Verify Bootstrap](#16-verify-bootstrap)
17. [Run Pre-Flight Check (Phase 1 Validation)](#17-run-pre-flight-check-phase-1-validation)
18. [Smoke-Test the API](#18-smoke-test-the-api)
19. [Deploy Frontend to CloudFront](#19-deploy-frontend-to-cloudfront)
20. [(Optional) Enable Advanced Modules](#20-optional-enable-advanced-modules)
21. [(Optional) Configure Custom Domain & DNS](#21-optional-configure-custom-domain--dns)
22. [Checklist Summary](#22-checklist-summary)

---

## 1. Prerequisites — Install Tooling

Before starting, install these tools on your machine:

### 1.1 Install AWS CLI v2

```bash
# macOS
brew install awscli

# Windows (download MSI from https://aws.amazon.com/cli/)
# Linux
curl "https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip" -o "awscliv2.zip"
unzip awscliv2.zip
sudo ./aws/install

# Verify
aws --version
# Expected: aws-cli/2.x.x ...
```

### 1.2 Install Terraform (>= 1.0.0)

```bash
# macOS
brew tap hashicorp/tap
brew install hashicorp/tap/terraform

# Windows / Linux — see https://developer.hashicorp.com/terraform/downloads

# Verify
terraform --version
# Expected: Terraform v1.x.x
```

### 1.3 Install Node.js (>= 18.x)

```bash
# Using nvm (recommended)
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash
nvm install 18
nvm use 18

# Verify
node --version
npm --version
```

### 1.4 Install Git

```bash
# macOS
brew install git

# Verify
git --version
```

---

## 2. Create Two AWS Accounts

You need **two separate AWS accounts**. This is the Control Plane / Data Plane separation.

### 2.1 Account 1: Platform Admin (Control Plane)

This hosts your backend API, authentication, monitoring, and alerting.

1. Go to [https://aws.amazon.com](https://aws.amazon.com) → click **"Create an AWS Account"**
2. Enter your email, choose an account name (e.g., `my-platform-admin`)
3. Complete billing information and phone verification
4. Choose the **Basic (Free)** support plan
5. Sign in to the console once created

**📝 Write down:**
- Account ID (12-digit number, find it at top-right → "Account" dropdown)
- Root email address

### 2.2 Account 2: Customer Data (Data Plane)

This hosts **only** DynamoDB tables for customer data.

1. Open a new browser window (or incognito) → go to [https://aws.amazon.com](https://aws.amazon.com)
2. Click **"Create an AWS Account"** again with a **different email address**
3. Account name example: `my-customer-data`
4. Complete setup same as above

**📝 Write down:**
- Account ID (12-digit number)
- Root email address

> **Why two accounts?** Security isolation. If the data plane is compromised, the control plane (auth, API) remains safe. This is AWS Well-Architected best practice.

### 2.3 Create IAM Users in Both Accounts

> ⚠️ **Never use root credentials for daily work.** Create IAM admin users.

#### In Platform Admin Account:

1. Sign in to **Platform Admin** AWS Console
2. Go to **IAM** → **Users** → **Create user**
3. User name: `platform-admin-terraform`
4. Check: **Provide user access to the AWS Management Console** (optional)
5. Click **Next**
6. Select **Attach policies directly** → search and check `AdministratorAccess`
7. Click **Create user**
8. Go to the user → **Security credentials** tab → **Create access key**
9. Choose **Command Line Interface (CLI)** → check the acknowledgement → **Next** → **Create access key**

**📝 Save these securely:**
```
Platform Admin Access Key ID:     AKIA...............
Platform Admin Secret Access Key: wJalr..................
```

#### In Customer Data Account:

1. Sign in to **Customer Data** AWS Console
2. Repeat the same IAM user creation:
   - User name: `customer-data-terraform`
   - Attach `AdministratorAccess`
   - Create access key for CLI

**📝 Save these securely:**
```
Customer Data Access Key ID:     AKIA...............
Customer Data Secret Access Key: wJalr..................
```

---

## 3. Configure AWS CLI Profiles

Set up named profiles so you can easily switch between accounts.

```bash
# Profile for Platform Admin Account
aws configure --profile platform-admin
# Prompted:
#   AWS Access Key ID: <paste Platform Admin Access Key>
#   AWS Secret Access Key: <paste Platform Admin Secret Key>
#   Default region name: us-east-1
#   Default output format: json

# Profile for Customer Data Account
aws configure --profile customer-data
# Prompted:
#   AWS Access Key ID: <paste Customer Data Access Key>
#   AWS Secret Access Key: <paste Customer Data Secret Key>
#   Default region name: us-east-1
#   Default output format: json
```

### Verify Both Profiles

```bash
# Should return Platform Admin account info
aws sts get-caller-identity --profile platform-admin

# Should return Customer Data account info
aws sts get-caller-identity --profile customer-data
```

Expected output:

```json
{
    "UserId": "AIDA...",
    "Account": "123456789012",
    "Arn": "arn:aws:iam::123456789012:user/platform-admin-terraform"
}
```

---

## 4. Create the Shared DynamoDB Table in Customer Account

> 🔑 **This is the critical step that was missing from previous guides.**
>
> The Customer Data Account needs a **shared DynamoDB table** (`app_data` or `dev_data`) 
> for **Public Cloud** customers. This table is where all public-cloud-type accounts 
> store their data using PK/SK-based tenant isolation.

### 4.1 Understanding What You're Creating

```
Customer AWS Account (Data Plane)
├── Shared DynamoDB Table: dev_data (or app_data for prod)
│   ├── Primary Key: PK (String) + SK (String)
│   ├── GSI1: GSI1PK + GSI1SK  → Entity type queries
│   ├── GSI2: GSI2PK + GSI2SK  → Tenant/relationship queries
│   └── GSI3: GSI3PK + GSI3SK  → Status/date queries
│
└── (Private Cloud tables will be auto-created later via CloudFormation)
```

### 4.2 Create the Table via AWS CLI

Run this command using the **customer-data** profile:

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

> **For Production**: Replace `dev_data` with `app_data` (or use the `table_prefix` from your Terraform config + `data` suffix, e.g., `prod_data`).

### 4.3 Verify the Table Was Created

```bash
# Wait ~30 seconds, then check status
aws dynamodb describe-table \
  --table-name dev_data \
  --query 'Table.{Name:TableName,Status:TableStatus,ItemCount:ItemCount,GSIs:GlobalSecondaryIndexes[*].IndexName}' \
  --profile customer-data \
  --region us-east-1
```

Expected output:

```json
{
    "Name": "dev_data",
    "Status": "ACTIVE",
    "ItemCount": 0,
    "GSIs": ["GSI1", "GSI2", "GSI3"]
}
```

### 4.4 (Optional) Enable Point-in-Time Recovery

For production, enable PITR for backup protection:

```bash
aws dynamodb update-continuous-backups \
  --table-name dev_data \
  --point-in-time-recovery-specification PointInTimeRecoveryEnabled=true \
  --profile customer-data \
  --region us-east-1
```

### 4.5 (Optional) Enable Deletion Protection (Production Only)

```bash
aws dynamodb update-table \
  --table-name dev_data \
  --deletion-protection-enabled \
  --profile customer-data \
  --region us-east-1
```

---

## 5. Set Up Cross-Account IAM Role

The Platform Admin Lambda needs to access DynamoDB tables in the Customer Account. This requires a **cross-account IAM role**.

### 5.1 In the Customer Data Account — Create the Trust Role

1. Sign in to the **Customer Data** AWS Console
2. Go to **IAM** → **Roles** → **Create role**
3. Select **Another AWS Account** as the trusted entity
4. Enter the **Platform Admin Account ID** (the 12-digit number from Step 2.1)
5. Click **Next**

#### Attach these permissions (create a custom policy):

Click **Create policy** → **JSON** tab → paste:

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

6. Name the policy: `PlatformCrossAccountAccess`
7. Go back to role creation → attach `PlatformCrossAccountAccess`
8. Name the role: `PlatformAdminCrossAccountRole`
9. Click **Create role**

**📝 Write down the Role ARN:**
```
arn:aws:iam::<CUSTOMER_ACCOUNT_ID>:role/PlatformAdminCrossAccountRole
```

### 5.2 In the Platform Admin Account — Allow AssumeRole

The Lambda execution role (created by Terraform) will need permission to assume the cross-account role. This is handled automatically by the Terraform `lambda` module's environment variables. You'll configure the role ARN in Step 6.

---

## 6. Prepare Terraform Variables

### 6.1 Navigate to the Terraform Directory

```bash
cd docs/nestjs-backend/terraform
```

### 6.2 Copy the Example Config

```bash
cp terraform.tfvars.example terraform.tfvars
```

### 6.3 Edit `terraform.tfvars`

Open `terraform.tfvars` in your editor and set these values:

```hcl
# =============================================================================
# Core Configuration
# =============================================================================
project_name = "license-portal"
environment  = "dev"
aws_region   = "us-east-1"

# =============================================================================
# DynamoDB — This creates the CONTROL PLANE's config table
# (The SHARED DATA PLANE table was created manually in Step 4)
# =============================================================================
table_prefix                  = "dev_"
dynamodb_billing_mode         = "PAY_PER_REQUEST"
enable_point_in_time_recovery = false
enable_deletion_protection    = false

# =============================================================================
# Lambda
# =============================================================================
lambda_memory_size  = 256
lambda_timeout      = 30
lambda_runtime      = "nodejs20.x"
lambda_architecture = "arm64"
lambda_package_path = "../lambda-package.zip"    # We'll build this in Step 9

# =============================================================================
# API Gateway
# =============================================================================
api_gateway_stage_name             = "dev"
enable_api_gateway_logging         = true
api_gateway_throttling_rate_limit  = 100
api_gateway_throttling_burst_limit = 200

# =============================================================================
# Cognito
# =============================================================================
cognito_callback_urls = [
  "http://localhost:5173/callback",
  "http://localhost:3000/callback",
  "https://YOUR-PRODUCTION-DOMAIN.com/callback"   # ← update later
]
cognito_logout_urls = [
  "http://localhost:5173",
  "http://localhost:3000",
  "https://YOUR-PRODUCTION-DOMAIN.com"             # ← update later
]
cognito_enable_mfa               = false   # Enable for production
cognito_enable_advanced_security = false   # Enable for production

# =============================================================================
# Monitoring
# =============================================================================
monitoring_alert_email = "your-email@company.com"   # ← CHANGE THIS
log_retention_days     = 7
enable_xray_tracing    = false
enable_lambda_insights = false

# =============================================================================
# Account Provisioning (Multi-Tenant DynamoDB)
# =============================================================================
enable_account_provisioning          = true
account_provisioning_enable_alarms   = false
default_private_account_billing_mode = "PAY_PER_REQUEST"

# =============================================================================
# Frontend Hosting — S3 + CloudFront CDN
# =============================================================================
enable_frontend_hosting    = true          # Creates S3 bucket + CloudFront
frontend_force_destroy     = true          # Allow easy teardown in dev
frontend_enable_versioning = false         # Enable for prod (rollback support)
frontend_price_class       = "PriceClass_100"  # US/EU only for dev
frontend_default_cache_ttl = 60            # 1 minute cache for rapid iteration
frontend_max_cache_ttl     = 3600          # 1 hour max
frontend_enable_api_proxy  = true          # Proxy /api/* to API Gateway

# No custom domain for dev — use CloudFront default (d123abc.cloudfront.net)
# frontend_domain_name     = "dev.app.example.com"
# frontend_route53_zone_id = "Z0123456789ABCDEF"

# =============================================================================
# WAF — Disabled for dev
# =============================================================================
enable_waf = false

# =============================================================================
# Secrets Manager — Disabled for dev
# =============================================================================
enable_secrets_manager = false

# =============================================================================
# VPC — Disabled for dev
# =============================================================================
enable_vpc = false

# =============================================================================
# Tags
# =============================================================================
additional_tags = {
  CostCenter = "development"
  Team       = "platform"
}
```

---

## 7. Run Terraform (Platform Admin Account)

### 7.1 Set the AWS Profile

Terraform runs against the **Platform Admin** account:

```bash
export AWS_PROFILE=platform-admin
```

### 7.2 Initialize Terraform

```bash
cd docs/nestjs-backend/terraform
terraform init
```

Expected output:
```
Terraform has been successfully initialized!
```

### 7.3 Create a Workspace (Optional)

```bash
terraform workspace new dev
```

### 7.4 Plan — Preview What Will Be Created

```bash
terraform plan -var-file="environments/dev.tfvars" -out=plan.tfplan
```

**Review the plan carefully.** You should see resources being created for:

| # | Resource Type | Count | Description |
|---|---------------|-------|-------------|
| 1 | `aws_cognito_user_pool` | 1 | User Pool with custom attributes |
| 2 | `aws_cognito_user_pool_client` | 1 | App client with OAuth flows |
| 3 | `aws_cognito_user_pool_domain` | 1 | Hosted UI domain |
| 4 | `aws_cognito_user_group` | 3 | admin, manager, user groups |
| 5 | `aws_dynamodb_table` | 1 | Control plane config table |
| 6 | `aws_lambda_function` | 1 | NestJS backend |
| 7 | `aws_api_gateway_rest_api` | 1 | REST API |
| 8 | `aws_iam_role` | 2+ | Lambda exec role, provisioner role |
| 9 | `aws_s3_bucket` | 2 | CloudFormation templates + **Frontend assets** |
| 10 | `aws_ssm_parameter` | 5 | Platform config parameters |
| 11 | `aws_cloudwatch_log_group` | 1+ | Lambda/API Gateway logs |
| 12 | `aws_cloudwatch_metric_alarm` | 8+ | Monitoring alarms |
| 13 | `aws_sns_topic` | 1+ | Alert notifications |
| 14 | `aws_cloudfront_distribution` | 1 | **Frontend CDN** (global edge distribution) |
| 15 | `aws_cloudfront_origin_access_control` | 1 | **S3 OAC** (secure S3 access) |
| 16 | `aws_cloudfront_response_headers_policy` | 1 | **Security headers** (CSP, HSTS, etc.) |

### 7.5 Apply — Create All Resources

```bash
terraform apply plan.tfplan
```

Type `yes` when prompted. This takes **3-10 minutes**.

### 7.6 Save the Outputs

```bash
terraform output -json > terraform-outputs.json
```

---

## 8. Verify Terraform Outputs

After Terraform completes, verify the key outputs:

```bash
# Get API Gateway URL
terraform output api_gateway_url

# Get Cognito User Pool ID
terraform output cognito_user_pool_id

# Get Cognito Client ID
terraform output cognito_client_id

# Get Lambda function name
terraform output lambda_function_name

# Get DynamoDB table name (control plane)
terraform output dynamodb_table_name

# Get Frontend hosting outputs (NEW)
terraform output frontend_bucket_name
terraform output frontend_distribution_id
terraform output frontend_distribution_domain
terraform output frontend_url
```

**📝 Record these values — you'll need them for Steps 10 and 12.**

### Verify in AWS Console

1. **Cognito**: Go to AWS Console → Cognito → User Pools → Confirm the pool exists with custom attributes (`account_id`, `enterprise_id`, `role`)
2. **Lambda**: Go to Lambda → Confirm function exists
3. **API Gateway**: Go to API Gateway → Confirm REST API with stage
4. **DynamoDB**: Go to DynamoDB → Tables → Confirm the control plane config table
5. **S3 (Frontend)**: Go to S3 → Confirm the `license-portal-dev-frontend` bucket exists
6. **CloudFront**: Go to CloudFront → Distributions → Confirm the distribution is **Deployed** status

---

## 9. Verify Frontend Hosting (S3 + CloudFront)

> This step verifies that the frontend hosting infrastructure provisioned by Terraform is working correctly before you deploy any code.

### 9.1 Verify the S3 Bucket

```bash
# Check the bucket exists and is accessible
aws s3api head-bucket \
  --bucket $(terraform -chdir=terraform output -raw frontend_bucket_name) \
  --profile platform-admin \
  --region us-east-1

echo "✅ Frontend S3 bucket exists"
```

### 9.2 Check S3 Bucket Configuration

```bash
BUCKET_NAME=$(terraform -chdir=terraform output -raw frontend_bucket_name)

# Verify the bucket is NOT public (CloudFront OAC handles access)
aws s3api get-public-access-block \
  --bucket $BUCKET_NAME \
  --profile platform-admin \
  --region us-east-1
```

Expected: All four public access settings should be `true`:
```json
{
    "PublicAccessBlockConfiguration": {
        "BlockPublicAcls": true,
        "IgnorePublicAcls": true,
        "BlockPublicPolicy": true,
        "RestrictPublicBuckets": true
    }
}
```

### 9.3 Check S3 Versioning Status

```bash
aws s3api get-bucket-versioning \
  --bucket $BUCKET_NAME \
  --profile platform-admin \
  --region us-east-1
```

> **Note**: Versioning may be `Suspended` or absent for dev. For production (`frontend_enable_versioning = true`), it should show `"Status": "Enabled"`. Versioning is required for the rollback workflow.

### 9.4 Verify CloudFront Distribution

```bash
DISTRIBUTION_ID=$(terraform -chdir=terraform output -raw frontend_distribution_id)
CF_DOMAIN=$(terraform -chdir=terraform output -raw frontend_distribution_domain)

echo "Distribution ID: $DISTRIBUTION_ID"
echo "CloudFront Domain: $CF_DOMAIN"

# Check distribution status
aws cloudfront get-distribution \
  --id $DISTRIBUTION_ID \
  --query 'Distribution.{Status:Status, DomainName:DomainName, Origins:DistributionConfig.Origins.Items[*].DomainName}' \
  --profile platform-admin
```

Expected:
```json
{
    "Status": "Deployed",
    "DomainName": "d123abc456def.cloudfront.net",
    "Origins": ["license-portal-dev-frontend.s3.us-east-1.amazonaws.com"]
}
```

### 9.5 Test CloudFront Response (Before Code Deploy)

```bash
# CloudFront should return a 403 (no index.html uploaded yet) — that's expected!
HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "https://${CF_DOMAIN}")
echo "CloudFront response: HTTP $HTTP_STATUS"

# Expected: 403 (Access Denied — bucket is empty)
# This confirms CloudFront is operational and pointing at the S3 bucket
```

### 9.6 Verify API Proxy (If Enabled)

If `frontend_enable_api_proxy = true`, CloudFront proxies `/api/*` to API Gateway:

```bash
# This should forward to your API Gateway backend
curl -s -o /dev/null -w "%{http_code}" "https://${CF_DOMAIN}/api/health"

# Expected: 200 (if Lambda is deployed) or 403/502 (if Lambda is not deployed yet)
```

**📝 Record these values for Step 10:**
```
Frontend S3 Bucket:       license-portal-dev-frontend
CloudFront Distribution:  E1234567890ABC
CloudFront Domain:        d123abc456def.cloudfront.net
Frontend URL:             https://d123abc456def.cloudfront.net
```

---

## 10. Confirm SNS Email Subscriptions

> **Why?** Terraform created SNS topics for monitoring alerts (Critical + Warning). If you set `monitoring_alert_email` in your `terraform.tfvars`, AWS sent a confirmation email. **You must click the confirmation link** in that email for alerts to work.

### 10.1 Check Your Email Inbox

Look for emails with subject **"AWS Notification — Subscription Confirmation"** from `no-reply@sns.amazonaws.com`.

You should have received **two** emails (one for critical alerts, one for warnings). Click **"Confirm subscription"** in each.

### 10.2 Verify Subscription Status

```bash
# Get the Critical Alerts topic ARN
CRITICAL_TOPIC_ARN=$(terraform -chdir=terraform output -raw monitoring_critical_alerts_topic_arn)

# List subscriptions
aws sns list-subscriptions-by-topic \
  --topic-arn "$CRITICAL_TOPIC_ARN" \
  --query 'Subscriptions[*].{Endpoint:Endpoint,Protocol:Protocol,Status:SubscriptionArn}' \
  --profile platform-admin \
  --region us-east-1
```

Expected:
```json
[
  {
    "Endpoint": "your-email@company.com",
    "Protocol": "email",
    "Status": "arn:aws:sns:us-east-1:123456789012:..."  // ← Confirmed (not "PendingConfirmation")
  }
]
```

> **If status shows "PendingConfirmation"**: Check your spam folder or re-subscribe:
> ```bash
> aws sns subscribe \
>   --topic-arn "$CRITICAL_TOPIC_ARN" \
>   --protocol email \
>   --notification-endpoint "your-email@company.com" \
>   --profile platform-admin \
>   --region us-east-1
> ```

---

## 11. Verify & Configure AWS SES (Email Notifications)

> **Why?** The platform sends **credential notification emails** to technical users when their accounts are provisioned (via the SES Notification Worker Lambda). AWS SES starts in **Sandbox Mode**, which only allows sending to verified email addresses.

### 11.1 Check SES Sandbox Status

```bash
aws ses get-account-sending-enabled \
  --profile platform-admin \
  --region us-east-1
```

Expected: `{ "Enabled": true }` — but you're still in **Sandbox** unless you've requested production access.

### 11.2 Verify Sender Email (Required)

The platform sends emails "from" a configured address. Verify the sender email:

```bash
# Verify the sender email identity
aws ses verify-email-identity \
  --email-address "noreply@your-domain.com" \
  --profile platform-admin \
  --region us-east-1

echo "📧 Check your inbox and click the verification link for noreply@your-domain.com"
```

> **Tip for dev**: If you don't have a custom domain, use any email you have access to:
> ```bash
> aws ses verify-email-identity \
>   --email-address "your-personal-email@gmail.com" \
>   --profile platform-admin \
>   --region us-east-1
> ```

### 11.3 Verify Recipient Emails (Sandbox Only)

In Sandbox Mode, **both sender AND recipient** must be verified. Verify the admin user's email:

```bash
# Verify the default admin user email
aws ses verify-email-identity \
  --email-address "admin@adminplatform.com" \
  --profile platform-admin \
  --region us-east-1

# Verify any other test recipient emails
aws ses verify-email-identity \
  --email-address "test-user@your-domain.com" \
  --profile platform-admin \
  --region us-east-1
```

### 11.4 List Verified Identities

```bash
aws ses list-identities \
  --identity-type EmailAddress \
  --profile platform-admin \
  --region us-east-1
```

### 11.5 Check Verification Status

```bash
aws ses get-identity-verification-attributes \
  --identities "noreply@your-domain.com" "admin@adminplatform.com" \
  --profile platform-admin \
  --region us-east-1
```

Expected:
```json
{
  "VerificationAttributes": {
    "noreply@your-domain.com": {
      "VerificationStatus": "Success"
    },
    "admin@adminplatform.com": {
      "VerificationStatus": "Success"
    }
  }
}
```

### 11.6 (Production) Request SES Production Access

> ⚠️ **Skip this for dev environments.** Only needed before go-live.

1. Go to AWS Console → **SES** → **Account Dashboard**
2. Click **"Request production access"**
3. Provide:
   - **Mail type**: Transactional
   - **Website URL**: Your application URL
   - **Use case description**: "Automated credential provisioning emails for enterprise SaaS platform users. Low volume (< 100 emails/day). All recipients are verified business users who have been onboarded by an administrator."
4. AWS typically approves within 24 hours

### 11.7 Update Lambda Environment with SES Sender

If using a custom sender address, update the Lambda environment:

```bash
# Add SES_SENDER_EMAIL to Lambda environment
# (This will be merged with existing environment variables)
FUNC_NAME=$(terraform -chdir=terraform output -raw lambda_function_name)
EXISTING_ENV=$(aws lambda get-function-configuration \
  --function-name "$FUNC_NAME" \
  --query 'Environment.Variables' \
  --output json \
  --profile platform-admin \
  --region us-east-1)

# Add the new variable (merge with existing)
echo "$EXISTING_ENV" | jq '. + {"SES_SENDER_EMAIL": "noreply@your-domain.com"}' > /tmp/env.json

aws lambda update-function-configuration \
  --function-name "$FUNC_NAME" \
  --environment "Variables=$(cat /tmp/env.json)" \
  --profile platform-admin \
  --region us-east-1
```

---

## 12. Configure GitHub Environment Secrets

> Before you can use the CI/CD workflows (`deploy-frontend.yml`, `rollback-frontend.yml`), you need to configure GitHub Environment secrets with the Terraform outputs from Steps 8 and 9.
>
> 📋 **See also**: [GitHub Secrets Cheat Sheet](./GITHUB-SECRETS-CHEATSHEET.md) for a complete quick-reference of all secrets across Phase 1 and Phase 2.

### 12.1 Create GitHub Environments

1. Go to your GitHub repo → **Settings** → **Environments**
2. Create three environments: **`dev`**, **`qa`**, **`prod`**
3. For **`prod`**, enable:
   - ✅ Required reviewers (add at least one approver)
   - ✅ Deployment branches: `main` only
   - ⏳ Wait timer: 5 minutes (optional)

### 12.2 Add Secrets to Each Environment

For each environment (`dev`, `qa`, `prod`), add these secrets:

#### AWS Credentials (same across environments or separate IAM users per env)

| Secret | How to Get | Example |
|--------|-----------|---------|
| `AWS_ACCESS_KEY_ID` | From IAM user (Step 2.3) | `AKIA...` |
| `AWS_SECRET_ACCESS_KEY` | From IAM user (Step 2.3) | `wJalr...` |
| `AWS_REGION` | Your deployment region | `us-east-1` |

#### Frontend Hosting (from Terraform outputs)

| Secret | How to Get | Example |
|--------|-----------|---------|
| `FRONTEND_S3_BUCKET` | `terraform output frontend_bucket_name` | `license-portal-dev-frontend` |
| `FRONTEND_CLOUDFRONT_DISTRIBUTION_ID` | `terraform output frontend_distribution_id` | `E1234567890ABC` |
| `FRONTEND_CUSTOM_DOMAIN` | Only if using custom domain (Step 21) | `app.example.com` |

#### Vite Build-Time Variables

| Secret | How to Get | Example |
|--------|-----------|---------|
| `VITE_API_BASE_URL` | `terraform output api_gateway_stage_url` | `https://abc123.execute-api.us-east-1.amazonaws.com/dev` |
| `VITE_COGNITO_USER_POOL_ID` | `terraform output cognito_user_pool_id` | `us-east-1_XXXXXXXXX` |
| `VITE_COGNITO_CLIENT_ID` | `terraform output cognito_client_id` | `1234567890abcdef` |
| `VITE_COGNITO_DOMAIN` | `terraform output cognito_domain` | `license-portal-dev.auth.us-east-1.amazoncognito.com` |

### 12.3 Quick Setup Script

You can automate this with the GitHub CLI:

```bash
# Install GitHub CLI: https://cli.github.com/
# Login: gh auth login

# Set environment (change for qa/prod)
ENV=dev

# Get values from Terraform
S3_BUCKET=$(terraform -chdir=terraform output -raw frontend_bucket_name)
CF_DIST=$(terraform -chdir=terraform output -raw frontend_distribution_id)
API_URL=$(terraform -chdir=terraform output -raw api_gateway_stage_url)
COGNITO_POOL=$(terraform -chdir=terraform output -raw cognito_user_pool_id)
COGNITO_CLIENT=$(terraform -chdir=terraform output -raw cognito_client_id)
COGNITO_DOMAIN=$(terraform -chdir=terraform output -raw cognito_domain)

# Set GitHub Environment secrets
gh secret set FRONTEND_S3_BUCKET --env $ENV --body "$S3_BUCKET"
gh secret set FRONTEND_CLOUDFRONT_DISTRIBUTION_ID --env $ENV --body "$CF_DIST"
gh secret set VITE_API_BASE_URL --env $ENV --body "$API_URL"
gh secret set VITE_COGNITO_USER_POOL_ID --env $ENV --body "$COGNITO_POOL"
gh secret set VITE_COGNITO_CLIENT_ID --env $ENV --body "$COGNITO_CLIENT"
gh secret set VITE_COGNITO_DOMAIN --env $ENV --body "$COGNITO_DOMAIN"

echo "✅ GitHub Environment secrets configured for $ENV"
```

### 12.4 Verify Secrets Are Set

```bash
# List secrets for the dev environment
gh secret list --env dev
```

Expected output:
```
FRONTEND_S3_BUCKET                      Updated 2024-01-01
FRONTEND_CLOUDFRONT_DISTRIBUTION_ID     Updated 2024-01-01
VITE_API_BASE_URL                       Updated 2024-01-01
VITE_COGNITO_USER_POOL_ID              Updated 2024-01-01
VITE_COGNITO_CLIENT_ID                 Updated 2024-01-01
VITE_COGNITO_DOMAIN                    Updated 2024-01-01
```

---

## 13. Build & Package the NestJS Backend

### 13.1 Install Dependencies

```bash
cd docs/nestjs-backend
npm install
```

### 13.2 Build the Application

```bash
npm run build
```

### 13.3 Create Lambda Deployment Package

```bash
# Create the zip package
cd dist
zip -r ../lambda-package.zip .
cd ..
zip -ur lambda-package.zip node_modules
```

### 13.4 Deploy the Package to Lambda

```bash
# Update the Lambda function code
aws lambda update-function-code \
  --function-name $(terraform -chdir=terraform output -raw lambda_function_name) \
  --zip-file fileb://lambda-package.zip \
  --profile platform-admin \
  --region us-east-1
```

Wait for the update to complete:

```bash
aws lambda wait function-updated \
  --function-name $(terraform -chdir=terraform output -raw lambda_function_name) \
  --profile platform-admin \
  --region us-east-1
```

---

## 14. Configure Environment Variables

### 14.1 Create `.env.migration` for Bootstrap Scripts

Create a file at `docs/nestjs-backend/.env.migration`:

```env
# AWS Credentials (use Platform Admin credentials that can AssumeRole to Customer)
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=AKIA...your-platform-admin-key...
AWS_SECRET_ACCESS_KEY=wJalr...your-platform-admin-secret...

# DynamoDB — points to the SHARED table in Customer Account
DYNAMODB_TABLE_NAME=dev_data

# Cognito — from Terraform outputs (Step 8)
COGNITO_USER_POOL_ID=us-east-1_XXXXXXXXX

# SSM Path Prefix
SSM_PREFIX=/accounts

# Cross-Account Role (from Step 5)
CROSS_ACCOUNT_ROLE_ARN=arn:aws:iam::<CUSTOMER_ACCOUNT_ID>:role/PlatformAdminCrossAccountRole
```

### 14.2 Update Lambda Environment Variables

Update the Lambda function to include the cross-account role ARN and shared table name:

```bash
aws lambda update-function-configuration \
  --function-name $(terraform -chdir=terraform output -raw lambda_function_name) \
  --environment Variables="{
    NODE_ENV=dev,
    AWS_REGION=us-east-1,
    DYNAMODB_TABLE_PREFIX=dev_,
    DYNAMODB_SHARED_TABLE=dev_data,
    COGNITO_USER_POOL_ID=$(terraform -chdir=terraform output -raw cognito_user_pool_id),
    COGNITO_CLIENT_ID=$(terraform -chdir=terraform output -raw cognito_client_id),
    COGNITO_REGION=us-east-1,
    CROSS_ACCOUNT_ROLE_ARN=arn:aws:iam::<CUSTOMER_ACCOUNT_ID>:role/PlatformAdminCrossAccountRole
  }" \
  --profile platform-admin \
  --region us-east-1
```

---

## 15. Run Day-0 Bootstrap

The bootstrap creates the root platform data (ABC account, Global enterprise, admin user, roles, groups, etc.).

### 15.1 Dry Run First

```bash
cd docs/nestjs-backend

npx ts-node scripts/bootstrap-day0.ts --dry-run
```

This prints all 14 steps and 30+ DynamoDB items **without writing anything**. Review the output to ensure:

- Account UUID: `a0000000-0000-0000-0000-000000000001`
- Enterprise UUID: `00000000-0000-0000-0000-000000000001`
- Admin email: `admin@adminplatform.com`
- License: 100 users, expires 2099-12-31

### 15.2 Execute Bootstrap (DynamoDB Only)

```bash
npx ts-node scripts/bootstrap-day0.ts
```

Expected output:

```
╔══════════════════════════════════════════════════════════════╗
║           Day-0 Platform Bootstrap CLI                      ║
╚══════════════════════════════════════════════════════════════╝

  Region:        us-east-1
  Table:         dev_data
  Cognito:       disabled
  Dry Run:       false
  Force:         false

🚀 Day-0 Bootstrap Starting...
──────────────────────────────
[1/14] ✅ Account 'ABC' created (a0000000-0000-0000-0000-000000000001)
[2/14] ✅ Enterprise 'Global' created
[3/14] ✅ Product 'Global' created
[4/14] ✅ Service 'Global' created
[5/14] ✅ Enterprise 'Global' linked to Product 'Global'
[6/14] ✅ Product 'Global' linked to Service 'Global'
[7/14] ✅ License created (100 users, Global scope)
[8/14] ✅ Role 'Platform Admin' created (permissions: 0x7FFF)
[9/14] ✅ Role 'Technical Role' created (permissions: view-only)
[10/14] ✅ Group 'Platform Admin' created → Platform Admin role
[11/14] ✅ Group 'Technical Group' created → Technical Role role
[12/14] ✅ User 'admin@adminplatform.com' created in DynamoDB + Cognito
[13/14] ✅ Workstream 'Global' created
[14/14] ✅ Workstream 'Default' created
──────────────────────────────
🎉 Bootstrap complete! 14/14 steps succeeded.

  Completed in 2.34s

  Summary of created entities:
    • Account:      ABC (a0000000-0000-0000-0000-000000000001)
    • Enterprise:   Global (00000000-0000-0000-0000-000000000001)
    • Product:      Global (00000000-0000-0000-0000-000000000002)
    • Service:      Global (00000000-0000-0000-0000-000000000003)
    • License:      100 users (f0000000-0000-0000-0000-000000000001)
    • Roles:        Platform Admin (full), Technical Role (view-only)
    • Groups:       Platform Admin → Platform Admin, Technical Group → Technical Role
    • Admin:        admin@adminplatform.com / Adminuser@123
    • Workstreams:  Global (e0000000-0000-0000-0000-000000000001), Default (e0000000-0000-0000-0000-000000000002)
```

### 15.3 Execute Bootstrap (With Cognito User)

```bash
npx ts-node scripts/bootstrap-day0.ts --with-cognito
```

This additionally creates the admin user in Cognito with:

- Email: `admin@adminplatform.com`
- Password: `Adminuser@123` (permanent, no reset required)
- Custom attributes: `custom:account_id`, `custom:role=super_admin`
- Cognito group: `PlatformAdmins`

---

## 16. Verify Bootstrap

### 16.1 Run the Verification Script

```bash
npx ts-node scripts/verify-bootstrap.ts
```

Expected output: All checks should show `✅ PASS` across categories (Master Data, Global Enterprise, ABC Account, SSM Registration, License, Groups, Roles, Role-Group Linkage, Admin User, Workstreams, Cognito).

### 16.2 Auto-Fix Mode (If Any Items Failed)

```bash
npx ts-node scripts/verify-bootstrap.ts --fix
```

### 16.3 Manual Verification — Check DynamoDB Items

```bash
# Verify ABC account exists in the shared table
aws dynamodb get-item \
  --table-name dev_data \
  --key '{"PK": {"S": "ACCOUNT#a0000000-0000-0000-0000-000000000001"}, "SK": {"S": "METADATA"}}' \
  --profile customer-data \
  --region us-east-1
```

### 16.4 Verify SSM Parameters

```bash
aws ssm get-parameters-by-path \
  --path "/accounts/a0000000-0000-0000-0000-000000000001/" \
  --recursive \
  --profile customer-data \
  --region us-east-1
```

Expected parameters:

```
/accounts/a0000000-.../dynamodb/table-name  → dev_data
/accounts/a0000000-.../cloud-type           → public
/accounts/a0000000-.../provisioning-status  → completed
```

### 16.5 Verify Cognito User (If --with-cognito Was Used)

```bash
aws cognito-idp admin-get-user \
  --user-pool-id us-east-1_XXXXXXXXX \
  --username admin@adminplatform.com \
  --profile platform-admin \
  --region us-east-1
```

---

## 17. Run Pre-Flight Check (Phase 1 Validation)

> The pre-flight check script (`pre-flight-check.ts`) programmatically validates all Phase 1 infrastructure. It performs 70+ automated checks across DynamoDB, Cognito, SSM, Lambda, S3, CloudFront, and monitoring configuration.

### 17.1 Run Phase 1 Checks Only

```bash
cd docs/nestjs-backend

npx ts-node scripts/pre-flight-check.ts --phase 1
```

### 17.2 Run with Verbose Output (Show Passing Checks Too)

```bash
npx ts-node scripts/pre-flight-check.ts --phase 1 --verbose
```

### 17.3 Expected Output

```
╔════════════════════════════════════════════════════════════════╗
║              Pre-Flight Check — Phase 1                        ║
╠════════════════════════════════════════════════════════════════╣

── INFRASTRUCTURE ─────────────────────────────────────────────
  ✅ DynamoDB shared table exists (dev_data)
  ✅ DynamoDB shared table has 3 GSIs
  ✅ DynamoDB streams enabled
  ✅ DynamoDB control plane table exists
  ✅ Cognito User Pool exists
  ✅ Cognito User Pool Client configured
  ✅ Cognito custom attributes present (account_id, enterprise_id, role)
  ✅ Lambda function exists and is Active
  ✅ API Gateway REST API exists
  ✅ API Gateway stage is deployed

── FRONTEND HOSTING ───────────────────────────────────────────
  ✅ Frontend S3 bucket exists
  ✅ S3 public access blocked
  ✅ CloudFront distribution deployed
  ✅ CloudFront origin points to S3 bucket

── BOOTSTRAP DATA ─────────────────────────────────────────────
  ✅ ABC Account exists (a0000000-...)
  ✅ Global Enterprise exists
  ✅ Enterprise → Product linkage
  ✅ Product → Service linkage
  ✅ Global Product exists
  ✅ Global Service exists
  ✅ Platform Admin Group exists
  ✅ Technical Group exists
  ✅ Platform Admin role exists (full permissions)
  ✅ Technical Role exists (view-only)
  ✅ Admin User exists (admin@adminplatform.com)
  ✅ Global License exists (100 users)
  ✅ Global Workstream exists
  ✅ Default Workstream exists
  ✅ SSM parameters registered for ABC account

── COGNITO USERS ──────────────────────────────────────────────
  ✅ Admin Cognito user exists
  ✅ Admin user has correct custom attributes
  ✅ PlatformAdmins Cognito group exists

╠════════════════════════════════════════════════════════════════╣
║  Result: 30/30 checks passed ✅                               ║
╚════════════════════════════════════════════════════════════════╝
```

### 17.4 Machine-Readable Output (For CI/CD Integration)

```bash
npx ts-node scripts/pre-flight-check.ts --phase 1 --json > preflight-results.json

# Check exit code
echo $?
# 0 = all passed, 1 = some failed
```

### 17.5 Fix Failures

If any checks fail:

1. **Bootstrap data missing** → Re-run bootstrap: `npx ts-node scripts/bootstrap-day0.ts --force --with-cognito`
2. **SSM parameters missing** → Re-run bootstrap (it registers SSM params)
3. **Cognito user missing** → Re-run with `--with-cognito` flag
4. **Infrastructure issues** → Re-run `terraform apply`
5. **Frontend S3/CloudFront issues** → Verify `enable_frontend_hosting = true` in tfvars and re-apply

---

## 18. Smoke-Test the API

### 18.1 Get API Gateway URL

```bash
export API_URL=$(terraform -chdir=terraform output -raw api_gateway_url)
echo $API_URL
# Example: https://abc123def.execute-api.us-east-1.amazonaws.com/dev
```

### 18.2 Test Health Endpoint

```bash
curl -s $API_URL/health | jq .
```

### 18.3 Authenticate with Cognito

```bash
# Get JWT token
TOKEN=$(aws cognito-idp initiate-auth \
  --auth-flow USER_PASSWORD_AUTH \
  --client-id $(terraform -chdir=terraform output -raw cognito_client_id) \
  --auth-parameters USERNAME=admin@adminplatform.com,PASSWORD=Adminuser@123 \
  --query 'AuthenticationResult.AccessToken' \
  --output text \
  --profile platform-admin \
  --region us-east-1)

echo "Token: ${TOKEN:0:50}..."
```

### 18.4 Test Authenticated API Call

```bash
# List accounts
curl -s -H "Authorization: Bearer $TOKEN" $API_URL/api/accounts | jq .

# Expected response:
# {
#   "data": [
#     {
#       "id": "a0000000-0000-0000-0000-000000000001",
#       "name": "ABC",
#       "cloudType": "public",
#       "status": "active"
#     }
#   ],
#   "error": null
# }
```

### 18.5 Test Enterprise Endpoint

```bash
curl -s -H "Authorization: Bearer $TOKEN" $API_URL/api/enterprises | jq .
```

### 18.6 Test Products Endpoint

```bash
curl -s -H "Authorization: Bearer $TOKEN" $API_URL/api/products | jq .
```

---

## 19. Deploy Frontend to CloudFront

> Now that the backend is running and verified, deploy the React/Vite frontend to the S3 bucket so it's served via CloudFront.

### 19.1 Build the Frontend

```bash
# From the project root (not docs/nestjs-backend)
cd /path/to/project-root

npm install
```

Set the build-time environment variables for dev:

```bash
export VITE_API_PROVIDER=nestjs
export VITE_API_BASE_URL=$(terraform -chdir=docs/nestjs-backend/terraform output -raw api_gateway_stage_url)
export VITE_COGNITO_USER_POOL_ID=$(terraform -chdir=docs/nestjs-backend/terraform output -raw cognito_user_pool_id)
export VITE_COGNITO_CLIENT_ID=$(terraform -chdir=docs/nestjs-backend/terraform output -raw cognito_client_id)
export VITE_COGNITO_DOMAIN=$(terraform -chdir=docs/nestjs-backend/terraform output -raw cognito_domain)
export VITE_APP_ENVIRONMENT=dev

npx vite build
```

### 19.2 Upload to S3

```bash
S3_BUCKET=$(terraform -chdir=docs/nestjs-backend/terraform output -raw frontend_bucket_name)

# Upload hashed assets (immutable, 1-year cache)
aws s3 sync dist/assets/ "s3://${S3_BUCKET}/assets/" \
  --cache-control "public, max-age=31536000, immutable" \
  --profile platform-admin

# Upload index.html (no cache — always fresh)
aws s3 cp dist/index.html "s3://${S3_BUCKET}/index.html" \
  --cache-control "no-cache, no-store, must-revalidate" \
  --content-type "text/html; charset=utf-8" \
  --profile platform-admin

# Upload remaining static files (moderate cache)
aws s3 sync dist/ "s3://${S3_BUCKET}/" \
  --cache-control "public, max-age=86400, stale-while-revalidate=3600" \
  --exclude "assets/*" \
  --exclude "index.html" \
  --profile platform-admin

echo "✅ Frontend uploaded to s3://${S3_BUCKET}/"
```

### 19.3 Invalidate CloudFront Cache

```bash
DISTRIBUTION_ID=$(terraform -chdir=docs/nestjs-backend/terraform output -raw frontend_distribution_id)

aws cloudfront create-invalidation \
  --distribution-id "$DISTRIBUTION_ID" \
  --paths "/*" \
  --profile platform-admin

echo "🔄 CloudFront cache invalidation started"
```

### 19.4 Verify Frontend is Live

```bash
CF_DOMAIN=$(terraform -chdir=docs/nestjs-backend/terraform output -raw frontend_distribution_domain)

# Wait ~30 seconds for invalidation to propagate
sleep 30

# Test the frontend
HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "https://${CF_DOMAIN}")
echo "Frontend HTTP Status: $HTTP_STATUS"

# Expected: 200
# Open in browser:
echo "🌐 Frontend URL: https://${CF_DOMAIN}"
```

### 19.5 Test API Proxy via CloudFront (If Enabled)

If `frontend_enable_api_proxy = true`, the frontend can reach the API through CloudFront:

```bash
# API call through CloudFront (same-origin, no CORS issues)
curl -s "https://${CF_DOMAIN}/api/health" | jq .

# Authenticated call through CloudFront
curl -s -H "Authorization: Bearer $TOKEN" "https://${CF_DOMAIN}/api/accounts" | jq .
```

> **This is the recommended approach**: The frontend and API share the same CloudFront domain, eliminating CORS configuration entirely.

---

## 20. (Optional) Enable Advanced Modules

> These modules are **disabled by default** for dev environments to reduce cost and complexity. Enable them when you need orchestrated provisioning, event-driven audit trails, or enhanced security.

### 20.1 Enable Step Functions + Worker Lambdas

When enabled, account provisioning is orchestrated by an AWS Step Functions state machine that invokes four dedicated Worker Lambdas (DynamoDB Provisioner, Cognito Provisioner, SES Notification, Provisioning Verifier).

**When to enable**: When you want automated, fault-tolerant account provisioning with DLQ-based failure isolation.

```hcl
# In terraform.tfvars
enable_step_functions  = true
enable_worker_lambdas  = true
worker_package_path    = "../worker-lambda-package.zip"
```

Then build the worker package and re-apply Terraform:

```bash
# Build worker Lambda package (same NestJS codebase, worker handlers)
cd docs/nestjs-backend
npm run build
cd dist
zip -r ../worker-lambda-package.zip .
cd ..
zip -ur worker-lambda-package.zip node_modules

# Re-apply Terraform
cd terraform
terraform plan -var-file="environments/dev.tfvars" -out=plan-workers.tfplan
terraform apply plan-workers.tfplan
```

**New resources created**:
| Resource | Count | Description |
|----------|-------|-------------|
| Worker Lambdas | 4 | DynamoDB, Cognito, SES, Verifier |
| SQS DLQs | 4 | One per worker for failure isolation |
| Step Functions State Machine | 1 | Provisioning orchestrator |
| CloudWatch Alarms | 8+ | Worker duration, DLQ depth, execution failures |

### 20.2 Enable EventBridge (Provisioning Audit Trail)

Captures all provisioning lifecycle events (Started, Success, Failure) for audit and alerting.

```hcl
# In terraform.tfvars
enable_provisioning_events              = true
provisioning_success_notification_email = "ops@your-company.com"
provisioning_failure_notification_email = "ops@your-company.com"
enable_provisioning_event_archive       = true
provisioning_archive_retention_days     = 365
```

### 20.3 Enable WAF (Web Application Firewall)

Protects the API Gateway with AWS Managed Rule Groups and rate limiting.

```hcl
# In terraform.tfvars
enable_waf                     = true
waf_rate_limit_threshold       = 2000
waf_enable_auth_rate_limit     = true
waf_auth_rate_limit_threshold  = 100    # Strict rate limit for /auth/* endpoints
waf_enable_ip_reputation_rules = true
waf_enable_logging             = true
waf_enable_alarms              = true
```

### 20.4 Enable Secrets Manager

Manages database credentials, JWT keys, and Cognito config with KMS encryption and optional rotation.

```hcl
# In terraform.tfvars
enable_secrets_manager       = true
secrets_enable_kms_encryption = true
enable_cognito_secret         = true
enable_jwt_secret             = true
enable_jwt_rotation           = true
secrets_jwt_rotation_days     = 90
```

### 20.5 Apply Advanced Modules

```bash
cd docs/nestjs-backend/terraform

# Plan with advanced modules
terraform plan -var-file="environments/dev.tfvars" -out=plan-advanced.tfplan

# Review the plan — confirm new resources match what you expect
terraform apply plan-advanced.tfplan
```

### 20.6 Verify Advanced Modules

```bash
# Step Functions
terraform output step_functions_state_machine_arn
terraform output step_functions_console_url

# Worker Lambdas
terraform output workers_summary

# EventBridge
terraform output eventbridge_event_bus_name

# WAF
terraform output waf_rules_summary

# Secrets Manager
terraform output secrets_manager_summary
```

---

## 21. (Optional) Configure Custom Domain & DNS

> Skip this section for dev. For production, you'll want a custom domain like `app.example.com` instead of `d123abc.cloudfront.net`.

### 21.1 Prerequisites

- A registered domain (e.g., `example.com`)
- A Route 53 hosted zone for the domain (or willingness to create one)

### 21.2 Create a Route 53 Hosted Zone (If You Don't Have One)

```bash
aws route53 create-hosted-zone \
  --name example.com \
  --caller-reference "$(date +%s)" \
  --profile platform-admin

# Record the Hosted Zone ID from the output
# HostedZone.Id: /hostedzone/Z0123456789ABCDEF
```

If your domain is registered elsewhere (GoDaddy, Namecheap, etc.), update the domain's nameservers to point to the Route 53 NS records shown in the output.

### 21.3 Update Terraform Variables for Custom Domain

Edit your `terraform.tfvars` (or workspace-specific tfvars file):

```hcl
# Frontend Hosting — Custom Domain
frontend_domain_name     = "app.example.com"
frontend_route53_zone_id = "Z0123456789ABCDEF"   # ← From Step 17.2
frontend_enable_www_redirect = true               # Redirect www.app.example.com → app.example.com
```

### 21.4 Apply Terraform Changes

```bash
cd docs/nestjs-backend/terraform

terraform plan -var-file="environments/prod.tfvars" -out=plan-domain.tfplan
```

**Review the plan.** You should see new resources:

| Resource | Description |
|----------|-------------|
| `aws_acm_certificate` | SSL certificate for `app.example.com` (in us-east-1) |
| `aws_acm_certificate_validation` | DNS validation for the certificate |
| `aws_route53_record` (validation) | CNAME records for ACM validation |
| `aws_route53_record` (A/AAAA) | Alias records pointing to CloudFront |

```bash
terraform apply plan-domain.tfplan
```

### 21.5 Wait for Certificate Validation

ACM certificates require DNS validation. Terraform creates the CNAME records automatically, but validation can take **5-30 minutes**.

```bash
# Check certificate status
CERT_ARN=$(terraform output -raw frontend_certificate_arn 2>/dev/null || echo "N/A")

if [ "$CERT_ARN" != "N/A" ]; then
  aws acm describe-certificate \
    --certificate-arn "$CERT_ARN" \
    --query 'Certificate.Status' \
    --output text \
    --region us-east-1 \
    --profile platform-admin
fi
# Expected: ISSUED (may show PENDING_VALIDATION initially)
```

### 21.6 Verify Custom Domain

```bash
# Test the custom domain
curl -s -o /dev/null -w "%{http_code}" https://app.example.com
# Expected: 200

# Test www redirect (if enabled)
curl -s -o /dev/null -w "%{http_code}" -L https://www.app.example.com
# Expected: 200 (redirected to https://app.example.com)
```

### 21.7 Update Cognito Callback URLs

After setting up the custom domain, update your Cognito callback URLs:

```hcl
# In terraform.tfvars
cognito_callback_urls = [
  "http://localhost:5173/callback",
  "https://app.example.com/callback"    # ← Add custom domain
]
cognito_logout_urls = [
  "http://localhost:5173",
  "https://app.example.com"             # ← Add custom domain
]
```

Re-apply Terraform to update the Cognito client.

### 21.8 Update GitHub Environment Secrets

```bash
# Update the custom domain secret for the prod environment
gh secret set FRONTEND_CUSTOM_DOMAIN --env prod --body "app.example.com"
```

---

## 22. Checklist Summary

Use this as a final pass/fail checklist:

| # | Step | How to Verify | Status |
|---|------|---------------|--------|
| 1 | AWS CLI installed | `aws --version` | ☐ |
| 2 | Terraform installed | `terraform --version` | ☐ |
| 3 | Node.js installed | `node --version` (>= 18) | ☐ |
| 4 | Platform Admin AWS account created | `aws sts get-caller-identity --profile platform-admin` | ☐ |
| 5 | Customer Data AWS account created | `aws sts get-caller-identity --profile customer-data` | ☐ |
| 6 | IAM users with access keys in both accounts | CLI profiles work | ☐ |
| 7 | **Shared DynamoDB table** created in Customer Account | `aws dynamodb describe-table --table-name dev_data --profile customer-data` | ☐ |
| 8 | GSI1, GSI2, GSI3 on shared table | `describe-table` shows 3 GSIs | ☐ |
| 9 | Streams enabled on shared table | `StreamSpecification.StreamEnabled = true` | ☐ |
| 10 | Cross-account IAM role created | Role ARN recorded | ☐ |
| 11 | Terraform `init` successful | No errors | ☐ |
| 12 | Terraform `plan` shows expected resources | ~30+ resources to create | ☐ |
| 13 | Terraform `apply` succeeded | All resources created | ☐ |
| 14 | Cognito User Pool created | Pool ID in output | ☐ |
| 15 | Lambda function deployed | Function name in output | ☐ |
| 16 | API Gateway stage active | URL in output | ☐ |
| 17 | **Frontend S3 bucket created** | `aws s3api head-bucket --bucket <bucket>` | ☐ |
| 18 | **CloudFront distribution deployed** | Distribution ID in output, status `Deployed` | ☐ |
| 19 | SSM platform parameters created | `/platform/dynamodb/shared-table-name` exists | ☐ |
| 20 | **SNS email subscriptions confirmed** | `aws sns list-subscriptions-by-topic` shows confirmed | ☐ |
| 21 | **SES sender email verified** | `aws ses get-identity-verification-attributes` shows `Success` | ☐ |
| 22 | **SES recipient emails verified** (sandbox) | All test recipients verified | ☐ |
| 23 | **GitHub Environment secrets configured** | `gh secret list --env dev` shows 6+ secrets | ☐ |
| 24 | Lambda package built and deployed | `update-function-code` succeeded | ☐ |
| 25 | Bootstrap dry-run passed | 14 steps printed, no errors | ☐ |
| 26 | Bootstrap executed | All 14 steps completed, entities in DynamoDB | ☐ |
| 27 | Cognito admin user created | `admin-get-user` returns user | ☐ |
| 28 | `verify-bootstrap.ts` all green | All categories `✅ PASS` (Master Data, Groups, Roles, Workstreams, etc.) | ☐ |
| 29 | **Pre-flight check passed** | `pre-flight-check.ts --phase 1` all green (30/30) | ☐ |
| 30 | API health check passes | `curl /health` returns 200 | ☐ |
| 31 | Authenticated API calls work | Bearer token returns data | ☐ |
| 32 | **Frontend deployed to S3** | `aws s3 ls s3://<bucket>/index.html` | ☐ |
| 33 | **Frontend live on CloudFront** | `curl https://<cf-domain>` returns 200 | ☐ |
| 34 | **API proxy via CloudFront works** | `curl https://<cf-domain>/api/health` returns 200 | ☐ |
| 35 | (Optional) Step Functions enabled | State machine ARN in output | ☐ |
| 36 | (Optional) Worker Lambdas deployed | `terraform output workers_summary` | ☐ |
| 37 | (Optional) EventBridge event bus created | `terraform output eventbridge_event_bus_name` | ☐ |
| 38 | (Optional) Custom domain configured | `curl https://app.example.com` returns 200 | ☐ |
| 39 | (Optional) ACM certificate issued | Certificate status `ISSUED` | ☐ |

---

## What's Next? → Phase 2

Once Phase 1 is complete, proceed to:

- **Phase 2: Backend Deployment** — Set up CI/CD pipelines for automated deployments
- **Phase 3: Frontend Migration** — Switch the React app from Supabase to NestJS/Cognito
- **Phase 4: Data Migration** — Migrate existing Supabase data to DynamoDB
- **Phase 5: Production Hardening** — Enable WAF, MFA, Secrets Manager, monitoring

---

## Troubleshooting FAQ

### Q: `terraform init` fails with "provider not found"
**A:** Ensure you're in the `docs/nestjs-backend/terraform/` directory and have internet connectivity. Run `terraform init -upgrade`.

### Q: DynamoDB create-table fails with "Table already exists"
**A:** The table was already created. Use `aws dynamodb describe-table --table-name dev_data --profile customer-data` to verify.

### Q: Bootstrap fails with "ConditionalCheckFailedException"
**A:** The bootstrap already ran. Use `--force` flag: `npx ts-node scripts/bootstrap-day0.ts --force`

### Q: Cognito user creation fails
**A:** Ensure `COGNITO_USER_POOL_ID` is correctly set in `.env.migration`. Get it from `terraform output cognito_user_pool_id`.

### Q: Cross-account access denied
**A:** Verify the trust relationship on the Customer Account role includes the Platform Admin Account ID. Check `iam:PassRole` and `sts:AssumeRole` permissions.

### Q: Lambda times out on first invocation
**A:** This is a cold start. Increase `lambda_timeout` in `terraform.tfvars` to 60 seconds, then re-apply.

### Q: CloudFront returns 403 after deploying frontend
**A:** Verify the S3 bucket policy allows CloudFront OAC access. Check `aws s3api get-bucket-policy --bucket <bucket-name>`. The Terraform module creates this automatically — if missing, re-run `terraform apply`.

### Q: CloudFront returns stale content after deploy
**A:** Run a full CloudFront invalidation: `aws cloudfront create-invalidation --distribution-id <id> --paths "/*"`. Invalidations can take 5-10 minutes to propagate globally.

### Q: ACM certificate stuck in PENDING_VALIDATION
**A:** Ensure the Route 53 CNAME validation records exist. If your domain's DNS is managed outside Route 53, you need to manually add the CNAME records shown by `aws acm describe-certificate`. Validation typically completes within 30 minutes.

### Q: Custom domain shows "SSL handshake failed"
**A:** The ACM certificate must be in `us-east-1` (required for CloudFront). Verify: `aws acm list-certificates --region us-east-1 --profile platform-admin`.
