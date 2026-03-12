# What Needs to Be Done Next — End-to-End Roadmap

> **Audience**: Platform engineers and developers implementing the AWS migration.
>
> **Prerequisite**: Phase 1 (PHASE1-SETUP-GUIDE.md) must be completed — all AWS infrastructure provisioned, Day-0 bootstrap executed, and smoke tests passing.
>
> **Current State**: The React frontend runs on Lovable Cloud with Supabase. The NestJS backend code, Terraform modules, CI/CD workflows, and migration scripts are complete and ready in `docs/nestjs-backend/`. All that remains is execution.

---

## Table of Contents

1. [Phase Overview](#phase-overview)
2. [Phase 2: CI/CD Pipeline Setup](#phase-2-cicd-pipeline-setup)
3. [Phase 3: Frontend Migration](#phase-3-frontend-migration)
4. [Phase 4: Data Migration](#phase-4-data-migration)
5. [Phase 5: Production Hardening](#phase-5-production-hardening)
6. [Phase 6: Go-Live Cutover](#phase-6-go-live-cutover)
7. [Post-Launch Checklist](#post-launch-checklist)
8. [Rollback Plan](#rollback-plan)
9. [Timeline Estimate](#timeline-estimate)

---

## Phase Overview

```
┌─────────────────────────────────────────────────────────────────────────┐
│  ✅ PHASE 1 — AWS Foundation (COMPLETED)                               │
│  Terraform provisioned, Day-0 bootstrapped, smoke tests passing        │
└───────────────────────────────┬─────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  🔧 PHASE 2 — CI/CD Pipeline Setup (You Are Here)                      │
│  GitHub Actions secrets, Terraform state, automated deployments        │
└───────────────────────────────┬─────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  🔄 PHASE 3 — Frontend Migration                                       │
│  Switch AuthContext to Cognito, refactor hooks to use API layer         │
└───────────────────────────────┬─────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  📦 PHASE 4 — Data Migration                                           │
│  Supabase → DynamoDB data transfer, user reconciliation                │
└───────────────────────────────┬─────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  🛡️ PHASE 5 — Production Hardening                                     │
│  WAF, MFA, Secrets Manager rotation, monitoring finalization           │
└───────────────────────────────┬─────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  🚀 PHASE 6 — Go-Live Cutover                                          │
│  DNS switch, CloudFront activation, Supabase decommission              │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Phase 2: CI/CD Pipeline Setup

> **Goal**: Enable automated infrastructure and application deployments via GitHub Actions.
>
> **Time Estimate**: 2–4 hours
>
> **Deliverable**: Push to `main` auto-deploys to dev; manual promotion to QA/prod.

### Step 2.1 — Create Terraform Remote State Backend

Terraform needs a shared state backend so CI/CD and local runs stay in sync.

```bash
# ─── Run in Platform Admin account ───────────────────────────
export AWS_PROFILE=platform-admin

# 1. Create S3 bucket for Terraform state
aws s3api create-bucket \
  --bucket license-portal-terraform-state \
  --region us-east-1

# 2. Enable versioning (protects against state corruption)
aws s3api put-bucket-versioning \
  --bucket license-portal-terraform-state \
  --versioning-configuration Status=Enabled

# 3. Enable server-side encryption
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

# 4. Block public access
aws s3api put-public-access-block \
  --bucket license-portal-terraform-state \
  --public-access-block-configuration \
    BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true

# 5. Create DynamoDB table for state locking
aws dynamodb create-table \
  --table-name license-portal-terraform-locks \
  --attribute-definitions AttributeName=LockID,AttributeType=S \
  --key-schema AttributeName=LockID,KeyType=HASH \
  --billing-mode PAY_PER_REQUEST \
  --region us-east-1
```

**📝 Record these values:**
```
TF_STATE_BUCKET:     license-portal-terraform-state
TF_STATE_LOCK_TABLE: license-portal-terraform-locks
```

### Step 2.2 — Migrate Existing Terraform State to Remote

If you already ran `terraform apply` locally in Phase 1:

```bash
cd docs/nestjs-backend/terraform

# Add backend configuration to versions.tf (or create backend.tf)
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

# Re-initialize — Terraform will ask to copy existing state to S3
terraform init -migrate-state

# Verify state is now remote
terraform state list
# Should show all resources from Phase 1
```

### Step 2.3 — Create a CI/CD-Specific IAM User

> ⚠️ Don't reuse your personal admin credentials for CI/CD.

```bash
# In Platform Admin account
aws iam create-user --user-name github-actions-deployer

# Create a policy with minimum required permissions
cat > /tmp/github-deployer-policy.json << 'EOF'
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
      "Sid": "CloudFrontInvalidate",
      "Effect": "Allow",
      "Action": [
        "cloudfront:CreateInvalidation", "cloudfront:GetInvalidation",
        "cloudfront:GetDistribution", "cloudfront:ListDistributions"
      ],
      "Resource": "*"
    },
    {
      "Sid": "TerraformFullAdmin",
      "Effect": "Allow",
      "Action": "*",
      "Resource": "*",
      "Condition": {
        "StringEquals": {
          "aws:RequestedRegion": "us-east-1"
        }
      }
    }
  ]
}
EOF

aws iam put-user-policy \
  --user-name github-actions-deployer \
  --policy-name GitHubActionsDeployPolicy \
  --policy-document file:///tmp/github-deployer-policy.json

# Create access key
aws iam create-access-key --user-name github-actions-deployer
```

**📝 Save the Access Key ID and Secret Key securely.**

> **Production Tip**: Use [OIDC federation](https://docs.github.com/en/actions/deployment/security-hardening-your-deployments/configuring-openid-connect-in-amazon-web-services) instead of long-lived access keys for production. This eliminates key rotation requirements.

### Step 2.4 — Configure GitHub Repository Secrets

> 📋 **See also**: [GitHub Secrets Cheat Sheet](./GITHUB-SECRETS-CHEATSHEET.md) for a single-page reference of all secrets across Phase 1 and Phase 2.

These are **repository-level** secrets (shared across all environments):

```bash
# Install GitHub CLI if not already installed
# brew install gh (macOS) or https://cli.github.com/

gh auth login

# Repository-level secrets
gh secret set AWS_ACCESS_KEY_ID --body "AKIA...your-deployer-key..."
gh secret set AWS_SECRET_ACCESS_KEY --body "wJalr...your-deployer-secret..."
gh secret set AWS_REGION --body "us-east-1"
gh secret set TF_STATE_BUCKET --body "license-portal-terraform-state"
gh secret set TF_STATE_LOCK_TABLE --body "license-portal-terraform-locks"
```

### Step 2.5 — Add CI/CD-Specific Environment Secrets

> ℹ️ **Prerequisite**: GitHub Environments (`dev`, `qa`, `prod`) and their frontend/Cognito secrets were already created in **Phase 1, Step 12**. See [PHASE1-SETUP-GUIDE.md → Step 12](./PHASE1-SETUP-GUIDE.md#12-configure-github-environment-secrets) for the full list.
>
> 📋 **Quick reference**: [GitHub Secrets Cheat Sheet](./GITHUB-SECRETS-CHEATSHEET.md) lists every secret in one page.
>
> This step adds only the **CI/CD-specific** secrets that were not needed during Phase 1.

```bash
ENV=dev

# ─── CI/CD-specific secrets (not covered in Phase 1) ─────────
DDB_TABLE="dev_data"
COGNITO_POOL=$(terraform -chdir=docs/nestjs-backend/terraform output -raw cognito_user_pool_id)

gh secret set DYNAMODB_TABLE_NAME --env $ENV --body "$DDB_TABLE"
gh secret set COGNITO_USER_POOL_ID --env $ENV --body "$COGNITO_POOL"
gh secret set BOOTSTRAP_ADMIN_PASSWORD --env $ENV --body "Adminuser@123"

echo "✅ $ENV CI/CD-specific secrets configured"
```

Repeat for `qa`, `staging`, `prod` with appropriate values.

> **Verify all secrets are present** (Phase 1 + Phase 2 combined):
> ```bash
> gh secret list --env dev
> # Should show 9+ secrets: 6 from Phase 1 + 3 from this step
> ```

### Step 2.6 — Verify CI/CD Pipeline

```bash
# Trigger a manual workspace pipeline run for dev
gh workflow run "workspace-pipeline.yml" \
  --field workspace=dev \
  --field skip_ci=false \
  --field deploy_infra=true \
  --field deploy_app=true

# Watch the run
gh run watch
```

**What to check:**
| Job | Expected Result |
|-----|----------------|
| 🔧 Resolve Workspace | `dev`, function name `license-portal-dev-api` |
| ✅ CI Checks | Lint, test, build all pass |
| 📦 Build Lambda Package | Package < 50MB, hash generated |
| 📋 Terraform Plan | Shows existing resources (no changes if Phase 1 was just completed) |
| 🏗️ Terraform Apply | Skipped (no changes) or succeeds |
| 🚀 Deploy Lambda | Function updated, version published |
| 🏥 Smoke Test | Health check returns 200 |
| ✅ Bootstrap Verify | All 14+ checks pass |

### Step 2.7 — Deploy Frontend via CI/CD

```bash
# Trigger frontend deployment
gh workflow run "deploy-frontend.yml" \
  --field workspace=dev \
  --field skip_tests=false \
  --field invalidate_all=true

# Watch the run
gh run watch
```

### Step 2.8 — Verify CI/CD Triggers

Test automatic deployment triggers:

```bash
# Make a trivial backend change and push to main
echo "// CI trigger test" >> docs/nestjs-backend/src/main.ts
git add . && git commit -m "test: verify CI pipeline" && git push

# The workspace-pipeline.yml should auto-trigger
gh run list --workflow="workspace-pipeline.yml" --limit 1
```

### Step 2.9 — Complete CI/CD Checklist

| # | Item | How to Verify | ☐ |
|---|------|---------------|---|
| 1 | Terraform state bucket created | `aws s3 ls s3://license-portal-terraform-state/` | ☐ |
| 2 | State lock table created | `aws dynamodb describe-table --table-name license-portal-terraform-locks` | ☐ |
| 3 | State migrated to S3 | `terraform state list` works remotely | ☐ |
| 4 | CI/CD IAM user created | `aws iam get-user --user-name github-actions-deployer` | ☐ |
| 5 | Repository secrets configured | `gh secret list` shows 5 secrets | ☐ |
| 6 | CI/CD env secrets added (on top of Phase 1 Step 12) | `gh secret list --env dev` shows 9+ secrets | ☐ |
| 7 | Workspace pipeline runs successfully | `gh run list --workflow="workspace-pipeline.yml"` | ☐ |
| 8 | Frontend deployment runs successfully | `gh run list --workflow="deploy-frontend.yml"` | ☐ |
| 9 | Auto-trigger on push to main works | Push a change, pipeline triggers | ☐ |
| 10 | Bootstrap verification passes | Post-deploy verification shows all green | ☐ |

---

## Phase 3: Frontend Migration

> **Goal**: Switch the React app from Supabase to NestJS + Cognito.
>
> **Time Estimate**: 3–5 days
>
> **Deliverable**: Frontend authenticates via Cognito and fetches data from NestJS API.

### Architecture Before vs After

```
BEFORE (Current):                        AFTER (Target):
┌──────────┐    ┌──────────┐            ┌──────────┐    ┌──────────┐
│  React   │───▶│ Supabase │            │  React   │───▶│ Cognito  │
│  App     │    │ Auth     │            │  App     │    │ (JWT)    │
└────┬─────┘    └──────────┘            └────┬─────┘    └──────────┘
     │                                       │
     │  supabase.from('...')                 │  fetch('/api/...')
     ▼                                       ▼
┌──────────┐                            ┌──────────┐    ┌──────────┐
│ Supabase │                            │ API GW   │───▶│  Lambda  │
│ PostgREST│                            │ (REST)   │    │ (NestJS) │
└──────────┘                            └──────────┘    └──────────┘
```

### Step 3.1 — Install AWS Cognito SDK

```bash
npm install amazon-cognito-identity-js @aws-sdk/client-cognito-identity-provider
```

### Step 3.2 — Create Cognito Auth Service

Create a new file `src/lib/auth/cognito-client.ts`:

```typescript
/**
 * AWS Cognito Authentication Client
 * 
 * Replaces Supabase Auth with Cognito User Pool authentication.
 * Uses the amazon-cognito-identity-js library for browser-compatible auth flows.
 */

import {
  CognitoUserPool,
  CognitoUser,
  AuthenticationDetails,
  CognitoUserSession,
} from 'amazon-cognito-identity-js';

const poolData = {
  UserPoolId: import.meta.env.VITE_COGNITO_USER_POOL_ID || '',
  ClientId: import.meta.env.VITE_COGNITO_CLIENT_ID || '',
};

const userPool = new CognitoUserPool(poolData);

export interface CognitoAuthResult {
  session: CognitoUserSession;
  accessToken: string;
  idToken: string;
  refreshToken: string;
  user: {
    email: string;
    accountId: string;
    enterpriseId: string;
    role: string;
  };
}

// Sign in with email + password
export async function cognitoSignIn(
  email: string,
  password: string
): Promise<CognitoAuthResult> {
  return new Promise((resolve, reject) => {
    const user = new CognitoUser({ Username: email, Pool: userPool });
    const authDetails = new AuthenticationDetails({
      Username: email,
      Password: password,
    });

    user.authenticateUser(authDetails, {
      onSuccess: (session) => {
        const idPayload = session.getIdToken().decodePayload();
        resolve({
          session,
          accessToken: session.getAccessToken().getJwtToken(),
          idToken: session.getIdToken().getJwtToken(),
          refreshToken: session.getRefreshToken().getToken(),
          user: {
            email: idPayload.email,
            accountId: idPayload['custom:account_id'] || '',
            enterpriseId: idPayload['custom:enterprise_id'] || '',
            role: idPayload['custom:role'] || 'user',
          },
        });
      },
      onFailure: (err) => reject(err),
      newPasswordRequired: (userAttributes) => {
        // Handle first-time login password change
        reject({
          code: 'NewPasswordRequired',
          message: 'New password required',
          userAttributes,
          cognitoUser: user,
        });
      },
    });
  });
}

// Get current session (auto-refreshes if expired)
export async function getCurrentSession(): Promise<CognitoAuthResult | null> {
  return new Promise((resolve) => {
    const user = userPool.getCurrentUser();
    if (!user) {
      resolve(null);
      return;
    }

    user.getSession((err: Error | null, session: CognitoUserSession | null) => {
      if (err || !session || !session.isValid()) {
        resolve(null);
        return;
      }

      const idPayload = session.getIdToken().decodePayload();
      resolve({
        session,
        accessToken: session.getAccessToken().getJwtToken(),
        idToken: session.getIdToken().getJwtToken(),
        refreshToken: session.getRefreshToken().getToken(),
        user: {
          email: idPayload.email,
          accountId: idPayload['custom:account_id'] || '',
          enterpriseId: idPayload['custom:enterprise_id'] || '',
          role: idPayload['custom:role'] || 'user',
        },
      });
    });
  });
}

// Sign out
export function cognitoSignOut(): void {
  const user = userPool.getCurrentUser();
  if (user) {
    user.signOut();
  }
}

// Forgot password
export async function cognitoForgotPassword(email: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const user = new CognitoUser({ Username: email, Pool: userPool });
    user.forgotPassword({
      onSuccess: () => resolve(),
      onFailure: (err) => reject(err),
    });
  });
}

// Confirm forgot password (with verification code)
export async function cognitoConfirmPassword(
  email: string,
  code: string,
  newPassword: string
): Promise<void> {
  return new Promise((resolve, reject) => {
    const user = new CognitoUser({ Username: email, Pool: userPool });
    user.confirmPassword(code, newPassword, {
      onSuccess: () => resolve(),
      onFailure: (err) => reject(err),
    });
  });
}
```

### Step 3.3 — Refactor AuthContext for Dual-Mode

The existing `src/contexts/AuthContext.tsx` needs to support both Supabase and Cognito based on the `VITE_API_PROVIDER` environment variable. Here's the migration strategy:

```
IF VITE_API_PROVIDER === 'nestjs':
  → Use Cognito for authentication
  → Use httpClient for API calls
  → JWT token from Cognito → Bearer header on all API calls
  
ELSE (default 'supabase'):
  → Use Supabase Auth (current behavior)
  → Use supabase.from() for queries
```

**Key changes to AuthContext.tsx:**

1. Import `cognitoSignIn`, `getCurrentSession`, `cognitoSignOut` from the Cognito client
2. Add a conditional path in the `signIn`, `signUp`, `signOut`, `resetPassword` methods
3. Update the `useEffect` to check for existing Cognito sessions
4. Pass the JWT token to `httpClient.setAuthToken()` after successful login

### Step 3.4 — Refactor Data Hooks (One at a Time)

Each hook currently uses `supabase.from('table')` directly. The API service layer (`src/lib/api/services/`) already has dual-mode implementations. Migrate hooks **one module at a time** in this order:

| Order | Hook | API Service | Why This Order |
|-------|------|-------------|----------------|
| 1 | `useAccounts.ts` | `accounts.service.ts` | Core entity, validates routing works |
| 2 | `useEnterprises.ts` | `enterprises.service.ts` | Required for breadcrumb context |
| 3 | `useLicenses.ts` | `licenses.service.ts` | Validates tenant scoping |
| 4 | `useGroups.ts` | `groups.service.ts` | Validates RBAC data flow |
| 5 | `useRoles.ts` | `roles.service.ts` | Role permissions critical path |
| 6 | `useAccessControlUsers.ts` | `users.service.ts` | User CRUD + Cognito integration |
| 7 | `useWorkstreams.ts` | `workstreams.service.ts` | Workstream + tools config |
| 8 | `useCredentials.ts` | (new service needed) | Security/credentials module |
| 9 | `usePipelines.ts` | (new service needed) | Pipeline CRUD |

**Migration Pattern for Each Hook:**

```typescript
// BEFORE (Supabase direct)
const { data, error } = await supabase
  .from('accounts')
  .select('*')
  .eq('id', accountId);

// AFTER (API service layer)
import { accountsService } from '@/lib/api';
import { isExternalApi } from '@/lib/api/config';

// The service automatically routes to the right backend
const { data, error } = await accountsService.getAll();
```

### Step 3.5 — Update Login/Signup Pages

- `src/pages/LoginPage.tsx` → Add Cognito login path
- `src/pages/ForgotPasswordPage.tsx` → Use `cognitoForgotPassword`
- `src/pages/ResetPasswordPage.tsx` → Use `cognitoConfirmPassword`
- `src/pages/OAuthCallbackPage.tsx` → Handle Cognito hosted UI callback

### Step 3.6 — Update Vite Environment Variables

Create `.env.aws` (for local development against AWS backend):

```env
VITE_API_PROVIDER=nestjs
VITE_API_BASE_URL=https://<api-gateway-id>.execute-api.us-east-1.amazonaws.com/dev
VITE_COGNITO_USER_POOL_ID=us-east-1_XXXXXXXXX
VITE_COGNITO_CLIENT_ID=1234567890abcdef
VITE_COGNITO_DOMAIN=license-portal-dev.auth.us-east-1.amazoncognito.com
VITE_APP_ENVIRONMENT=dev
```

### Step 3.7 — Test Frontend Against AWS Backend Locally

```bash
# Start dev server with AWS env vars
cp .env.aws .env.local
npm run dev

# Test login with tripleh1701@gmail.com / Adminuser@123
# Verify:
# ✅ Login returns Cognito JWT
# ✅ Dashboard loads account data from NestJS API
# ✅ Breadcrumb context (Account/Enterprise) works
# ✅ CRUD operations work (create/edit/delete accounts, users, etc.)
# ✅ License enforcement works
# ✅ Role permissions gate menus correctly
```

### Step 3.8 — Frontend Migration Checklist

| # | Item | Status |
|---|------|--------|
| 1 | Cognito SDK installed | ☐ |
| 2 | `cognito-client.ts` created | ☐ |
| 3 | `AuthContext.tsx` refactored for dual-mode | ☐ |
| 4 | `useAccounts` migrated to API service | ☐ |
| 5 | `useEnterprises` migrated | ☐ |
| 6 | `useLicenses` migrated | ☐ |
| 7 | `useGroups` migrated | ☐ |
| 8 | `useRoles` migrated | ☐ |
| 9 | `useAccessControlUsers` migrated | ☐ |
| 10 | `useWorkstreams` migrated | ☐ |
| 11 | `useCredentials` migrated | ☐ |
| 12 | `usePipelines` migrated | ☐ |
| 13 | Login page works with Cognito | ☐ |
| 14 | Forgot password flow works | ☐ |
| 15 | All CRUD operations verified | ☐ |
| 16 | Account provisioning works end-to-end | ☐ |
| 17 | License capacity enforcement works | ☐ |
| 18 | Role-based menu visibility works | ☐ |

---

## Phase 4: Data Migration

> **Goal**: Migrate existing Supabase data to DynamoDB.
>
> **Time Estimate**: 1–2 days
>
> **Deliverable**: All production data in DynamoDB, users reconciled in Cognito.

### Step 4.1 — Export Data from Supabase

```bash
# Navigate to migration scripts
cd docs/nestjs-backend/scripts

# The migration script connects to Supabase directly and transforms
# relational data into DynamoDB PK/SK patterns
```

The migration script (`migrate-from-supabase.ts`) performs these transformations:

```
Supabase Tables           →  DynamoDB PK/SK Patterns
─────────────────────────────────────────────────────────
accounts                  →  PK: ACCT#<id>   SK: METADATA
account_addresses         →  PK: ACCT#<id>   SK: ADDRESS#<id>
account_licenses          →  PK: ACCT#<id>   SK: LICENSE#<id>
account_technical_users   →  PK: ACCT#<id>   SK: TECH_USER#<id>
enterprises               →  PK: ACCT#<id>   SK: ENTERPRISE#<id>
groups                    →  PK: ACCT#<id>   SK: GROUP#<id>
roles                     →  PK: ACCT#<id>   SK: ROLE#<id>
role_permissions          →  PK: ACCT#<id>   SK: ROLE_PERM#<roleId>#<menuKey>
group_roles               →  PK: ACCT#<id>   SK: GROUP_ROLE#<groupId>#<roleId>
user_groups               →  PK: ACCT#<id>   SK: USER_GROUP#<userId>#<groupId>
workstreams               →  PK: ACCT#<id>   SK: WORKSTREAM#<id>
workstream_tools          →  PK: ACCT#<id>   SK: WS_TOOL#<wsId>#<toolId>
credentials               →  PK: ACCT#<id>   SK: CREDENTIAL#<id>
pipelines                 →  PK: ACCT#<id>   SK: PIPELINE#<id>
products                  →  PK: PRODUCT#LIST SK: PRODUCT#<id>
services                  →  PK: SERVICE#LIST SK: SERVICE#<id>
```

### Step 4.2 — Configure Migration Environment

```bash
# Create .env.migration
cat > .env.migration << 'EOF'
# Source: Supabase
SUPABASE_URL=https://jxifygasseaxzajzcqgc.supabase.co
SUPABASE_SERVICE_ROLE_KEY=<your-supabase-service-role-key>

# Target: AWS DynamoDB (via cross-account role)
AWS_REGION=us-east-1
DYNAMODB_TABLE_NAME=dev_data
CROSS_ACCOUNT_ROLE_ARN=arn:aws:iam::<CUSTOMER_ACCT>:role/PlatformAdminCrossAccountRole

# Cognito (for user identity reconciliation)
COGNITO_USER_POOL_ID=us-east-1_XXXXXXXXX
EOF
```

### Step 4.3 — Run Migration (Dry Run First)

```bash
# Dry run — shows what would be migrated without writing
npx ts-node scripts/migrate-from-supabase.ts --dry-run

# Review the output:
# - Total items to migrate per entity type
# - PK/SK transformations
# - Any data issues (missing required fields, invalid references)
```

### Step 4.4 — Execute Migration

```bash
# Run the actual migration
npx ts-node scripts/migrate-from-supabase.ts

# Expected output:
# ✅ Migrated 5 accounts
# ✅ Migrated 5 addresses
# ✅ Migrated 12 licenses
# ✅ Migrated 8 technical users
# ✅ Migrated 3 enterprises
# ✅ Migrated 15 groups
# ✅ Migrated 10 roles
# ✅ ...
```

### Step 4.5 — Reconcile Users in Cognito

For each `account_technical_users` record with `status = 'active'`:

1. Create a Cognito user with email
2. Set custom attributes: `custom:account_id`, `custom:enterprise_id`, `custom:role`
3. Add to appropriate Cognito group
4. Set temporary password (triggers email notification via SES)

```bash
# The migration script handles user reconciliation
npx ts-node scripts/migrate-from-supabase.ts --with-cognito

# For each user:
# 1. Creates Cognito identity
# 2. Maps cognitoSub back to DynamoDB record
# 3. Sends credential notification via SES
```

### Step 4.6 — Verify Migration

```bash
npx ts-node scripts/verify-migration.ts

# Checks:
# ✅ All Supabase accounts exist in DynamoDB
# ✅ All licenses are correctly associated
# ✅ All user-group-role relationships are intact
# ✅ GSI1, GSI2, GSI3 data is populated correctly
# ✅ SSM parameters exist for all accounts
# ✅ Cognito users match DynamoDB technical users
```

### Step 4.7 — Seed Sample Data (Optional)

If you need additional test data:

```bash
npx ts-node scripts/seed-sample-data.ts
```

### Step 4.8 — Data Migration Checklist

| # | Item | Status |
|---|------|--------|
| 1 | Supabase service role key obtained | ☐ |
| 2 | `.env.migration` configured | ☐ |
| 3 | Dry-run migration completed | ☐ |
| 4 | Data migration executed | ☐ |
| 5 | Cognito user reconciliation completed | ☐ |
| 6 | `verify-migration.ts` all green | ☐ |
| 7 | SSM parameters verified for all accounts | ☐ |
| 8 | Manual spot-check of DynamoDB items | ☐ |

---

## Phase 5: Production Hardening

> **Goal**: Enable all security features and production-grade monitoring.
>
> **Time Estimate**: 1–2 days
>
> **Deliverable**: Production environment fully hardened with WAF, MFA, secrets rotation, and alerting.

### Step 5.1 — Enable WAF (Web Application Firewall)

Update `prod.tfvars`:

```hcl
# WAF — Enabled for production
enable_waf                    = true
waf_rate_limit_auth           = 100     # 100 req/5min per IP on /auth/*
waf_block_known_bad_inputs    = true
waf_block_sqli                = true
```

```bash
cd docs/nestjs-backend/terraform
terraform plan -var-file="environments/prod.tfvars"
terraform apply -var-file="environments/prod.tfvars"
```

### Step 5.2 — Enable Cognito MFA

Update `prod.tfvars`:

```hcl
# Cognito — MFA and advanced security
cognito_enable_mfa               = true    # TOTP (authenticator app)
cognito_enable_advanced_security = true    # Adaptive authentication
```

### Step 5.3 — Enable Secrets Manager with Auto-Rotation

Update `prod.tfvars`:

```hcl
# Secrets Manager
enable_secrets_manager              = true
secrets_rotation_schedule           = "rate(30 days)"
secrets_enable_jwt_rotation         = true
secrets_enable_db_credential_rotation = true
```

### Step 5.4 — Enable Step Functions Orchestration

Update `prod.tfvars`:

```hcl
# Step Functions — Orchestrated provisioning
enable_step_functions                        = true
monitoring_sfn_duration_threshold_ms         = 600000   # 10 minutes
monitoring_worker_duration_threshold_ms      = 60000    # 60 seconds
```

### Step 5.5 — Configure Monitoring Alerts

```bash
# Subscribe to SNS alerts
aws sns subscribe \
  --topic-arn $(terraform output -raw critical_alerts_topic_arn) \
  --protocol email \
  --notification-endpoint ops-team@company.com \
  --profile platform-admin

aws sns subscribe \
  --topic-arn $(terraform output -raw warning_alerts_topic_arn) \
  --protocol email \
  --notification-endpoint ops-team@company.com \
  --profile platform-admin

# Confirm subscriptions by clicking the link in the email
```

### Step 5.6 — Enable S3 Versioning for Frontend Rollbacks

Update `prod.tfvars`:

```hcl
# Frontend Hosting — Production settings
frontend_force_destroy     = false    # Prevent accidental deletion
frontend_enable_versioning = true     # Enable S3 versioning for rollbacks
frontend_price_class       = "PriceClass_All"  # Global CDN coverage
frontend_default_cache_ttl = 3600     # 1 hour cache
frontend_max_cache_ttl     = 86400    # 24 hour max
```

### Step 5.7 — Enable CloudWatch Dashboard Alarms

Verify the CloudWatch dashboard is populated:

```bash
# Open CloudWatch dashboard
echo "https://console.aws.amazon.com/cloudwatch/home?region=us-east-1#dashboards:name=license-portal-prod"

# Dashboard should show:
# Row 1: Lambda metrics (invocations, errors, duration, throttles)
# Row 2: DynamoDB metrics (reads, writes, throttles, latency)
# Row 3: API Gateway metrics (4xx, 5xx, latency, count)
# Row 4: Cognito metrics (sign-ins, sign-ups, failures)
# Row 5: Step Functions metrics (success rate, duration, failures)
# Row 6: Worker Lambda metrics (per-function success/failure)
# Row 7: DLQ depth (messages visible + oldest message age)
```

### Step 5.8 — Production Hardening Checklist

| # | Item | Status |
|---|------|--------|
| 1 | WAF enabled and rules active | ☐ |
| 2 | Auth rate limiting verified (100 req/5min on /auth/*) | ☐ |
| 3 | Cognito MFA enabled | ☐ |
| 4 | Advanced security (adaptive auth) enabled | ☐ |
| 5 | Secrets Manager rotation configured | ☐ |
| 6 | Step Functions enabled | ☐ |
| 7 | SNS alert subscriptions confirmed | ☐ |
| 8 | CloudWatch dashboard populated | ☐ |
| 9 | S3 versioning enabled for frontend | ☐ |
| 10 | Deletion protection enabled on DynamoDB tables | ☐ |
| 11 | Point-in-time recovery enabled | ☐ |
| 12 | Frontend rollback workflow tested | ☐ |

---

## Phase 6: Go-Live Cutover

> **Goal**: Switch production traffic from Supabase to AWS.
>
> **Time Estimate**: 2–4 hours (maintenance window)
>
> **Deliverable**: Production app running entirely on AWS infrastructure.

### Step 6.1 — Pre-Cutover Checklist

```
☐ All Phase 1-5 checklists completed
☐ All data migrated and verified
☐ All users reconciled in Cognito
☐ Frontend tested end-to-end against AWS backend
☐ Production Terraform apply completed
☐ WAF, MFA, monitoring all active
☐ Rollback plan documented and tested
☐ Maintenance window communicated to users
☐ On-call team identified
```

### Step 6.2 — Execute Cutover

**Schedule a maintenance window** (recommended: off-peak hours).

```bash
# ─── Step 1: Final data sync (30 minutes before cutover) ────
npx ts-node scripts/migrate-from-supabase.ts --incremental

# ─── Step 2: Build production frontend with AWS env vars ─────
gh workflow run "deploy-frontend.yml" \
  --field workspace=prod \
  --field skip_tests=false \
  --field invalidate_all=true

# ─── Step 3: Verify production deployment ────────────────────
curl -s "https://$(terraform output -raw frontend_distribution_domain)/api/health"
# Expected: {"status": "ok"}

# ─── Step 4: (If custom domain) Update DNS ───────────────────
# Point app.example.com → CloudFront distribution
# This was handled by Terraform in Phase 1, Step 17

# ─── Step 5: Verify frontend is live ─────────────────────────
curl -s -o /dev/null -w "%{http_code}" "https://app.example.com"
# Expected: 200

# ─── Step 6: Test login with production admin ────────────────
# Open https://app.example.com in browser
# Login with tripleh1701@gmail.com / Adminuser@123
# Verify dashboard loads with migrated data
```

### Step 6.3 — Post-Cutover Verification (First 24 Hours)

```bash
# Monitor CloudWatch for errors
aws cloudwatch get-metric-statistics \
  --namespace AWS/Lambda \
  --metric-name Errors \
  --dimensions Name=FunctionName,Value=license-portal-prod-api \
  --start-time $(date -u -d '-1 hour' +%Y-%m-%dT%H:%M:%S) \
  --end-time $(date -u +%Y-%m-%dT%H:%M:%S) \
  --period 300 \
  --statistics Sum \
  --profile platform-admin

# Check DLQ depth (should be 0)
for QUEUE in dynamodb-provisioner cognito-provisioner ses-notification provisioning-verifier; do
  MSG_COUNT=$(aws sqs get-queue-attributes \
    --queue-url $(aws sqs get-queue-url --queue-name "license-portal-prod-${QUEUE}-dlq" --query 'QueueUrl' --output text) \
    --attribute-names ApproximateNumberOfMessagesVisible \
    --query 'Attributes.ApproximateNumberOfMessagesVisible' \
    --output text 2>/dev/null || echo "N/A")
  echo "$QUEUE DLQ: $MSG_COUNT messages"
done
```

### Step 6.4 — Decommission Supabase (After Stabilization)

> ⚠️ Wait at least **2 weeks** after cutover before decommissioning Supabase. Keep it as a backup.

1. Set `BYPASS_AUTH = false` in `AuthContext.tsx` (should already be false)
2. Remove `VITE_API_PROVIDER=supabase` from any remaining configs
3. Remove Supabase edge functions (no longer needed)
4. Disable Supabase project (don't delete — keep for 30 days as safety net)
5. Remove `@supabase/supabase-js` dependency when ready

---

## Post-Launch Checklist

| # | Category | Item | Status |
|---|----------|------|--------|
| 1 | Security | WAF blocking malicious requests | ☐ |
| 2 | Security | MFA enforced for admin users | ☐ |
| 3 | Security | Secrets rotation running on schedule | ☐ |
| 4 | Monitoring | CloudWatch dashboard shows all metrics | ☐ |
| 5 | Monitoring | Critical alarms deliver to ops team | ☐ |
| 6 | Monitoring | DLQ alarms trigger on any message | ☐ |
| 7 | Operations | Bootstrap verification runs daily | ☐ |
| 8 | Operations | Frontend rollback workflow tested | ☐ |
| 9 | Operations | Lambda rollback (alias revert) documented | ☐ |
| 10 | Performance | Lambda cold start < 5s | ☐ |
| 11 | Performance | API p95 latency < 500ms | ☐ |
| 12 | Performance | CloudFront cache hit ratio > 80% | ☐ |
| 13 | Compliance | All DynamoDB tables encrypted at rest | ☐ |
| 14 | Compliance | All API traffic over TLS 1.2+ | ☐ |
| 15 | Compliance | Provisioning audit trail in EventBridge | ☐ |

---

## Rollback Plan

### Backend Rollback (Lambda)

```bash
# List recent Lambda versions
aws lambda list-versions-by-function \
  --function-name license-portal-prod-api \
  --query 'Versions[-5:].[Version, Description, LastModified]' \
  --output table

# Revert 'live' alias to previous version
aws lambda update-alias \
  --function-name license-portal-prod-api \
  --name live \
  --function-version <PREVIOUS_VERSION_NUMBER>
```

### Frontend Rollback (S3 + CloudFront)

Use the rollback workflow:

```bash
gh workflow run "rollback-frontend.yml" \
  --field workspace=prod \
  --field strategy=s3-versioning \
  --field versions_back=1 \
  --field confirmation=ROLLBACK-prod
```

### Infrastructure Rollback (Terraform)

```bash
# Terraform state history is versioned in S3
# Download previous state version
aws s3api list-object-versions \
  --bucket license-portal-terraform-state \
  --prefix "prod/terraform.tfstate" \
  --query 'Versions[:5].[VersionId,LastModified]' \
  --output table

# Revert to previous state (use with extreme caution)
aws s3api get-object \
  --bucket license-portal-terraform-state \
  --key "prod/terraform.tfstate" \
  --version-id <PREVIOUS_VERSION_ID> \
  terraform.tfstate.backup
```

### Full Rollback to Supabase

If AWS deployment fails catastrophically:

1. Update DNS to point back to Lovable Cloud / Supabase
2. Set `VITE_API_PROVIDER=supabase` in environment
3. Redeploy frontend via Lovable
4. Supabase data is still intact (we never deleted it)

---

## Timeline Estimate

| Phase | Duration | Dependencies | Parallelizable? |
|-------|----------|-------------|-----------------|
| **Phase 2**: CI/CD Setup | 2–4 hours | Phase 1 complete | — |
| **Phase 3**: Frontend Migration | 3–5 days | Phase 2 complete | Partially (hooks can be migrated in parallel) |
| **Phase 4**: Data Migration | 1–2 days | Phase 2 complete | ✅ Can run alongside Phase 3 |
| **Phase 5**: Production Hardening | 1–2 days | Phase 3 + 4 complete | ✅ Can start after Phase 2 |
| **Phase 6**: Go-Live Cutover | 2–4 hours | All phases complete | — |
| **Post-Launch Stabilization** | 2 weeks | Phase 6 complete | — |

**Total Estimated Timeline: 2–3 weeks** (with dedicated engineering effort)

```
Week 1: Phase 2 (Day 1) + Phase 3 starts (Day 1-5) + Phase 4 (Day 3-4)
Week 2: Phase 3 completes + Phase 5 (Day 1-2) + Phase 6 cutover (Day 3)
Week 3-4: Post-launch monitoring and stabilization
```

---

## Quick Reference: GitHub Workflows

| Workflow | File | Trigger | Purpose |
|----------|------|---------|---------|
| CI Pipeline | `ci.yml` | Push/PR to main | Lint, test, build, security scan |
| Infrastructure | `infrastructure.yml` | Push to terraform/ or manual | Terraform plan/apply |
| Deploy Backend | `deploy.yml` | Push to main or manual | Lambda code deployment |
| Deploy Frontend | `deploy-frontend.yml` | Push to src/ or manual | S3 + CloudFront deployment |
| Workspace Pipeline | `workspace-pipeline.yml` | Push to main or manual | End-to-end infra + app deploy |
| Bootstrap Verify | `post-deploy-verify.yml` | After deploy or daily | Day-0 entity verification |
| Rollback Frontend | `rollback-frontend.yml` | Manual only | S3 versioning or artifact restore |
| Destroy Infra | `destroy-infrastructure.yml` | Manual only | Terraform destroy (with safety gates) |
| PR Validation | `pr-validation.yml` | Pull request | PR quality gates |
| Scheduled | `scheduled.yml` | Cron | Automated maintenance tasks |

---

## Quick Reference: Environment Variables

| Variable | Dev | Staging | Prod |
|----------|-----|---------|------|
| `VITE_API_PROVIDER` | `supabase` (current) → `nestjs` | `nestjs` | `nestjs` |
| `VITE_API_BASE_URL` | API Gateway dev URL | API Gateway staging URL | API Gateway prod URL |
| `VITE_COGNITO_USER_POOL_ID` | Dev pool ID | Staging pool ID | Prod pool ID |
| `VITE_COGNITO_CLIENT_ID` | Dev client ID | Staging client ID | Prod client ID |
| `VITE_APP_ENVIRONMENT` | `dev` | `staging` | `prod` |

---

*Document last updated: 2026-02-08*
*Corresponds to: ARCHITECTURE.md, PHASE1-SETUP-GUIDE.md, and all workflow files in `.github/workflows/`*
