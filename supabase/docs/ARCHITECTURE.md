# Multi-Tenant DevOps SaaS Platform — End-to-End Architecture

## Table of Contents

1. [Overview](#overview)
2. [Platform Architecture](#platform-architecture)
3. [Control Plane — Platform Admin AWS Account](#control-plane)
4. [Data Plane — Customer AWS Account](#data-plane)
5. [Authentication & Authorization](#authentication--authorization)
6. [Account Onboarding Flow](#account-onboarding-flow)
7. [Worker Lambdas & Step Functions](#worker-lambdas--step-functions)
8. [Day-0 Bootstrapping](#day-0-bootstrapping)
9. [Data Flow & Routing](#data-flow--routing)
10. [Security & Isolation](#security--isolation)
11. [Infrastructure as Code](#infrastructure-as-code)
12. [Sequence Diagrams](#sequence-diagrams)
13. [API Reference](#api-reference)
14. [Migration Cutover Checklist](#migration-cutover-checklist--supabase--nestjscognito)

---

## Overview

This platform is a **multi-tenant DevOps SaaS application** deployed across **two separate AWS accounts** with a clear **Control Plane / Data Plane** separation:

| Aspect | Platform Admin AWS (Control Plane) | Customer AWS (Data Plane) |
|--------|-----------------------------------|--------------------------|
| **Purpose** | App hosting, auth, config, licensing | Customer data storage |
| **Services** | Cognito, Lambda, API Gateway, WAF | DynamoDB (shared + dedicated) |
| **Users** | All users authenticate here | No direct user access |
| **Data** | Platform config, RBAC, licenses | Customer workload data |

### Key Principles

- **Centralized Authentication**: All users (platform admins + customer users) authenticate via AWS Cognito in the Platform Admin account
- **Decentralized Data**: Customer data resides in the Customer AWS account with logical or physical isolation
- **License Enforcement**: User creation is gated by license limits per Enterprise/Product/Service
- **Hierarchical Multi-Tenancy**: Account → Enterprise → Workstream scoping

---

## Platform Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                     PLATFORM ADMIN AWS ACCOUNT (Control Plane)              │
│                                                                             │
│  ┌─────────┐    ┌──────────────┐    ┌─────────────┐    ┌──────────────┐   │
│  │   WAF   │───▶│ API Gateway  │───▶│   Lambda    │───▶│   Cognito    │   │
│  │(L7 Prot)│    │  (REST API)  │    │  (NestJS)   │    │(User Pools)  │   │
│  └─────────┘    └──────────────┘    └──────┬──────┘    └──────────────┘   │
│                                             │                               │
│                    ┌────────────────────────┼────────────────────┐          │
│                    │                        │                    │          │
│              ┌─────▼─────┐          ┌──────▼──────┐     ┌──────▼──────┐   │
│              │ Secrets   │          │ EventBridge │     │    SNS      │   │
│              │ Manager   │          │  (Events)   │     │ (Alerts)    │   │
│              └───────────┘          └─────────────┘     └─────────────┘   │
│                                                                             │
│  ┌──────────────────────────────────────────────────────────────────────┐   │
│  │                    APPLICATION MODULES                                │   │
│  │  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐  │   │
│  │  │ Accounts │ │Enterprises│ │ Licenses │ │  Users   │ │  Roles   │  │   │
│  │  └──────────┘ └──────────┘ └──────────┘ └──────────┘ └──────────┘  │   │
│  │  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐  │   │
│  │  │  Groups  │ │Workstreams│ │ Products │ │ Services │ │Pipelines │  │   │
│  │  └──────────┘ └──────────┘ └──────────┘ └──────────┘ └──────────┘  │   │
│  └──────────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                        Cross-Account IAM Role
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                     CUSTOMER AWS ACCOUNT (Data Plane)                       │
│                                                                             │
│  ┌───────────────────────────────────────────────────────────────────────┐  │
│  │                        PUBLIC CLOUD MODEL                              │  │
│  │  ┌─────────────────────────────────────────────────────────────────┐  │  │
│  │  │                    Shared DynamoDB Table: app_data               │  │  │
│  │  │  PK: ACCT#abc | SK: METADATA         → Account ABC data        │  │  │
│  │  │  PK: ACCT#abc | SK: LICENSE#001      → ABC License 1           │  │  │
│  │  │  PK: ACCT#xyz | SK: METADATA         → Account XYZ data        │  │  │
│  │  │  PK: ACCT#xyz | SK: LICENSE#001      → XYZ License 1           │  │  │
│  │  │  ─────────────────────────────────────────────────────────────  │  │  │
│  │  │  Logical isolation via PK/SK partitioning                       │  │  │
│  │  └─────────────────────────────────────────────────────────────────┘  │  │
│  └───────────────────────────────────────────────────────────────────────┘  │
│                                                                             │
│  ┌───────────────────────────────────────────────────────────────────────┐  │
│  │                       PRIVATE CLOUD MODEL                              │  │
│  │  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐      │  │
│  │  │  app_acct_001   │  │  app_acct_002   │  │  app_acct_003   │      │  │
│  │  │  Dedicated Table │  │  Dedicated Table │  │  Dedicated Table │      │  │
│  │  │  for Customer A  │  │  for Customer B  │  │  for Customer C  │      │  │
│  │  └─────────────────┘  └─────────────────┘  └─────────────────┘      │  │
│  │  Physical isolation — provisioned via CloudFormation StackSets       │  │
│  └───────────────────────────────────────────────────────────────────────┘  │
│                                                                             │
│  ┌──────────────┐                                                          │
│  │     SSM      │  Table mappings: /accounts/{id}/dynamodb/table-name      │
│  │ Parameter    │  Cloud type:     /accounts/{id}/cloud-type               │
│  │   Store      │  Status:         /accounts/{id}/provisioning-status      │
│  └──────────────┘                                                          │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Control Plane

### Platform Admin AWS Account Responsibilities

| Component | Description |
|-----------|-------------|
| **AWS Cognito** | Authenticates ALL users (platform admins + customer users) |
| **NestJS Backend** | API-driven backend deployed on AWS Lambda |
| **API Gateway** | REST API with WAF protection |
| **Secrets Manager** | Manages DB credentials, JWT keys, Cognito config |
| **EventBridge** | Publishes provisioning lifecycle events |
| **SNS** | Critical alerting for provisioning failures |

### Application Modules

```
AppModule
├── AuthModule (Cognito JWT validation, Guards)
├── DynamoDBModule (Router, Provisioner - GLOBAL)
├── SecretsModule (AWS Secrets Manager with TTL cache)
├── EventsModule (EventBridge + SNS publishing)
├── AccountsModule (CRUD + provisioning trigger)
├── EnterprisesModule (Enterprise-Product-Service hierarchy)
├── LicensesModule (License management + user count enforcement)
├── UsersModule (User CRUD + Cognito user creation)
├── GroupsModule (Group management + role assignment)
├── RolesModule (Roles + granular permissions)
├── WorkstreamsModule (Workstream + tool configuration)
├── ProductsModule (Master data)
├── ServicesModule (Master data)
└── ProvisioningModule (Infrastructure lifecycle management)
```

### Breadcrumb Context Handling

The application header maintains a persistent context breadcrumb:

- **Platform Admin**: Account selector → Enterprise selector (auto-selects ABC + Global)
- **Customer User**: Their assigned Account → Their assigned Enterprise (auto-selected)
- All data queries are scoped to the active `accountId` + `enterpriseId`

---

## Data Plane

### Customer AWS Account Responsibilities

This account hosts **only** DynamoDB tables for customer data storage.

### Public Cloud Model

- **One shared DynamoDB table** (`app_data`)
- Data isolation via composite key design:
  - `PK: ACCOUNT#<accountId>` — Partition Key scopes to tenant
  - `SK: <EntityType>#<entityId>` — Sort Key identifies entity
- Each customer can only query their own partition
- 3 Global Secondary Indexes (GSI1: Entity Type, GSI2: Tenant, GSI3: Status/Date)

### Private Cloud Model

- **Dedicated DynamoDB table per customer** (e.g., `app_acct_<accountId>`)
- Provisioned dynamically via CloudFormation during onboarding
- Same PK/SK schema but physically isolated
- Supports custom billing modes (On-Demand vs Provisioned)
- Point-in-time recovery and deletion protection enabled by default

### DynamoDB Router Service

The `DynamoDBRouterService` resolves the correct table for each request:

```
Request with accountId
    │
    ▼
┌─────────────────────┐
│  Check local cache   │  ◄── 5-minute TTL
│  (Map<accountId,     │
│   TableConfig>)      │
└──────────┬──────────┘
           │ Cache miss
           ▼
┌─────────────────────┐
│  Query SSM Parameter │
│  /accounts/{id}/     │
│  dynamodb/table-name │
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│  Return table name   │
│  (shared or          │
│   dedicated)         │
└─────────────────────┘
```

---

## Authentication & Authorization

### Authentication Flow

All authentication is centralized in the Platform Admin AWS account via **AWS Cognito**.

```
User Login
    │
    ▼
┌─────────────────────┐
│  Frontend sends      │
│  email + password    │
│  to Cognito          │
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│  Cognito validates   │
│  credentials and     │
│  returns JWT tokens  │
│  (access + id)       │
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│  JWT contains custom │
│  claims:             │
│  - custom:account_id │
│  - custom:enterprise │
│  - custom:role       │
│  - cognito:groups    │
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│  Frontend stores JWT │
│  and sends with all  │
│  API requests via    │
│  Authorization:      │
│  Bearer <token>      │
└─────────────────────┘
```

### Authorization (RBAC) Model

```
User ──▶ user_groups ──▶ group_roles ──▶ role_permissions
  │                                            │
  │                                            ▼
  │                                    ┌──────────────┐
  │                                    │ Menu Scopes  │
  │                                    │ - is_visible │
  │                                    │ - can_view   │
  │                                    │ - can_create │
  │                                    │ - can_edit   │
  │                                    │ - can_delete │
  │                                    └──────────────┘
  │
  ▼
NestJS Guards Chain:
  1. JwtAuthGuard   → Validates Cognito JWT
  2. RolesGuard     → Checks required roles
  3. AccountGuard   → Ensures tenant isolation
  4. EnterpriseGuard→ Enterprise-level scoping
```

### Guard Pipeline

| Guard | Purpose | Fails With |
|-------|---------|------------|
| `JwtAuthGuard` | Validates JWT token against Cognito JWKS | 401 Unauthorized |
| `RolesGuard` | Checks `@Roles('admin')` decorator | 403 Forbidden |
| `AccountGuard` | Ensures `accountId` in request matches user's tenant | 403 Forbidden |
| `EnterpriseGuard` | Ensures `enterpriseId` access | 403 Forbidden |

---

## Account Onboarding Flow

When a Platform Admin creates a new customer account:

```
┌─────────────────────────────────────────────────────────────────┐
│                    ACCOUNT CREATION WIZARD                       │
│                                                                  │
│  Step 1: Account Details                                        │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │ • Account Name                                            │   │
│  │ • Master Account Name                                     │   │
│  │ • Cloud Type: [Public ○] [Private ○] [Hybrid ○]          │   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                  │
│  Step 2: Address                                                │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │ • Line 1, Line 2, City, State, Postal Code, Country       │   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                  │
│  Step 3: Technical User                                         │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │ • First Name, Last Name, Email                            │   │
│  │ • Assigned Group → Assigned Role (dependent selector)     │   │
│  │ • Start Date, End Date (optional)                         │   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                  │
│  Step 4: Licenses (at least one required)                       │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │ • Enterprise → Product → Service                          │   │
│  │ • Start Date, End Date, Number of Users                   │   │
│  │ • Contact Details (Name, Email, Phone)                    │   │
│  │ • Renewal Notification (toggle + notice days)             │   │
│  └──────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼ On "Save"
┌─────────────────────────────────────────────────────────────────┐
│                    BACKEND PROCESSING                            │
│                                                                  │
│  1. Infrastructure Provisioning                                 │
│     ├── Public Cloud:                                           │
│     │   └── Register in shared table (SSM params)               │
│     └── Private Cloud:                                          │
│         └── Create CloudFormation stack                          │
│             ├── Dedicated DynamoDB table                        │
│             ├── IAM roles for cross-account access              │
│             └── SSM Parameter Store entries                     │
│                                                                  │
│  2. EventBridge: Publish "Provisioning Started" event           │
│                                                                  │
│  3. Create Records in DynamoDB                                  │
│     ├── Account metadata (ACCOUNT#<id> | METADATA)             │
│     ├── Address records (ACCOUNT#<id> | ADDRESS#<id>)          │
│     ├── Technical User (ACCOUNT#<id> | TECH_USER#<id>)         │
│     └── License records (ACCOUNT#<id> | LICENSE#<id>)          │
│                                                                  │
│  4. Create Cognito user for Technical User                      │
│     └── With custom attributes: account_id, enterprise_id      │
│                                                                  │
│  5. Create Default Resources                                    │
│     ├── Technical Group (linked to account)                     │
│     ├── Technical Role (with base permissions)                  │
│     ├── Group-Role assignment                                   │
│     ├── User-Group assignment                                   │
│     └── Default Workstream in Global Settings                   │
│                                                                  │
│  6. Step Functions: Orchestrate provisioning pipeline            │
│     ├── DynamoDB Provisioner Lambda                              │
│     ├── Cognito Provisioner Lambda (parallel per user)           │
│     ├── SES Notification Lambda (parallel per user)              │
│     └── Provisioning Verifier Lambda (final gate)                │
│                                                                  │
│  7. EventBridge: Publish "Provisioning Completed" event         │
│                                                                  │
│  8. SNS: Send notification to admin topic                       │
└─────────────────────────────────────────────────────────────────┘
```

> **Note:** Steps 3–6 are orchestrated by an **AWS Step Functions State Machine** using dedicated **Worker Lambdas**. See the [Worker Lambdas & Step Functions](#worker-lambdas--step-functions) section for full details.

---

## Worker Lambdas & Step Functions

The account provisioning workflow is orchestrated by an **AWS Step Functions Standard State Machine** that invokes four dedicated **Worker Lambda** functions. Each worker is purpose-built, independently deployable, and paired with a **Dead-Letter Queue (DLQ)** for failure isolation.

### Architecture Overview

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                        PROVISIONING ORCHESTRATION                             │
│                                                                               │
│  ┌─────────────┐       ┌──────────────────────────────────────────────────┐  │
│  │  Accounts   │       │         AWS Step Functions State Machine          │  │
│  │  Service    │──────▶│                                                    │  │
│  │ (NestJS)    │       │  ┌──────────┐    ┌──────────┐    ┌──────────┐   │  │
│  └─────────────┘       │  │ DynamoDB │───▶│ Cognito  │───▶│   SES    │   │  │
│                         │  │Provisioner│   │Provisioner│   │Notifier  │   │  │
│                         │  └─────┬────┘    └─────┬────┘    └─────┬────┘   │  │
│                         │        │               │               │         │  │
│                         │        │         ┌─────▼────┐          │         │  │
│                         │        │         │Provision │          │         │  │
│                         │        │         │ Verifier │◀─────────┘         │  │
│                         │        │         └──────────┘                    │  │
│                         └────────┼───────────────┼────────────────────────┘  │
│                                  │               │                           │
│                         ┌────────▼───┐   ┌──────▼──────┐                    │
│                         │  DLQ: DDB  │   │  DLQ: SES   │    (One DLQ per   │
│                         │  Failures  │   │  Failures   │     worker)        │
│                         └────────────┘   └─────────────┘                    │
└──────────────────────────────────────────────────────────────────────────────┘
```

### Worker Lambda Functions

Each worker is a standalone Lambda function optimized for a single responsibility:

| Worker | Handler | Purpose | Timeout | Memory |
|--------|---------|---------|---------|--------|
| **DynamoDB Provisioner** | `dynamodb-provisioner.handler` | Creates/registers DynamoDB tables (shared registration or CloudFormation stack) | 300s | 256 MB |
| **Cognito Provisioner** | `cognito-provisioner.handler` | Creates Cognito user identities with custom attributes | 60s | 256 MB |
| **SES Notification** | `ses-notification.handler` | Sends branded credential emails via AWS SES | 30s | 256 MB |
| **Provisioning Verifier** | `provisioning-verifier.handler` | Validates all provisioned resources exist and are accessible | 120s | 256 MB |

### Auto-Provisioned Technical Group & Role

When a new customer account is created via the Account Settings → Accounts tab, the `AccountsService.create()` method automatically provisions a **Technical Group** and **Technical Role** scoped to the new account. This ensures every customer account has baseline RBAC from the moment of creation, without requiring manual group/role setup.

#### What Gets Created

| Entity | Name | Scope | Permissions |
|--------|------|-------|-------------|
| **Technical Role** | `Technical Role` | Account + first license's Enterprise, Product, Service | View-only for all 7 menus (Dashboard, Overview, Account Settings, Access Control, Security, Pipelines, Builds) with tab-level read access |
| **Technical Group** | `Technical Group` | Account + first license's Enterprise | Linked to Technical Role via `group_roles` junction |
| **Group-Role Link** | Junction record | `GROUP#{groupId}` → `ROLE#{roleId}` | Establishes the inheritance chain |
| **User-Group Link** | Junction record | `USER#{techUserId}` → `GROUP#{groupId}` | Technical user inherits Technical Role permissions |

#### Provisioning Flow

```
Save Account (UI)
      │
      ▼
AccountsService.create()
      │
      ├── 1. Provision Infrastructure (DynamoDB + SSM)
      ├── 2. Write Account Metadata + Address + Technical User
      ├── 3. Create Licenses
      ├── 4. provisionTechnicalGroupAndRole()
      │       ├── Create Technical Role (view-only permissions)
      │       ├── Create permission records for all 7 menus
      │       ├── Create Technical Group
      │       ├── Link Role → Group (group_roles junction)
      │       └── [Private Cloud] Replicate all to dedicated table
      ├── 5. assignUserToGroup()
      │       └── Link Technical User → Technical Group (user_groups junction)
      ├── 6. Provision Cognito User (Step Functions)
      └── 7. Send Credential Notification (SES)
```

#### Key Design Decisions

- **Scoping**: Technical Group and Role are scoped to the new account's first license enterprise/product/service, mirroring how the bootstrap creates them for the ABC master account
- **View-Only Default**: The Technical Role grants `canView: true` with `canCreate/canEdit/canDelete: false` for all menus — a safe baseline that admins can escalate later
- **Private Cloud Replication**: For private cloud accounts, group/role records and permissions are replicated to the dedicated DynamoDB table to maintain data locality
- **Idempotency**: Each provisioning run generates fresh UUIDs, so re-running account creation does not conflict with existing groups/roles

### Worker Handler Pattern

All workers follow a consistent idempotent handler pattern:

```typescript
// Each worker:
// 1. Receives event from Step Functions
// 2. Emits CloudWatch metrics (WorkerDuration, WorkerSuccess/Failure)
// 3. Returns structured result for state machine routing
// 4. Is idempotent — safe to retry on transient failures

export const handler = async (event: ProvisioningEvent) => {
  const startTime = Date.now();
  try {
    // ... perform provisioned work ...
    await emitMetric('WorkerSuccess', 1);
    return { status: 'SUCCESS', ...result };
  } catch (error) {
    await emitMetric('WorkerFailure', 1);
    throw error; // Step Functions Catch block routes to DLQ
  } finally {
    await emitMetric('WorkerDuration', Date.now() - startTime);
  }
};
```

### Step Functions State Machine

The state machine implements the full provisioning lifecycle with conditional branching, parallel processing, and structured error handling:

```
                          ┌─────────────────────┐
                          │   ValidateInput      │
                          │   (Pass State)       │
                          └──────────┬──────────┘
                                     │
                                     ▼
                          ┌─────────────────────┐
                          │   ProvisionDynamoDB  │
                          │   (Lambda: dynamodb- │
                          │    provisioner)       │
                          └──────────┬──────────┘
                                     │
                              ┌──────┴──────┐
                              │ Cloud Type? │
                              └──┬───────┬──┘
                                 │       │
                        Public   │       │  Private
                                 │       │
                    ┌────────────▼┐   ┌──▼────────────┐
                    │ RegisterSSM  │   │ CreateStack    │
                    │ Parameters   │   │ (CFN Table     │
                    │              │   │  + IAM + SSM)  │
                    └──────┬──────┘   └──────┬─────────┘
                           │                 │
                           └────────┬────────┘
                                    │
                                    ▼
                          ┌─────────────────────┐
                          │ WriteCoreRecords     │
                          │ (Account, Address,   │
                          │  Users, Licenses)    │
                          └──────────┬──────────┘
                                     │
                                     ▼
                          ┌─────────────────────┐
                          │ ProvisionTechnical   │
                          │ GroupAndRole          │
                          │ (Creates Technical   │
                          │  Group + Technical   │
                          │  Role scoped to new  │
                          │  account, links them │
                          │  via group_roles,    │
                          │  assigns tech user   │
                          │  to the group)       │
                          └──────────┬──────────┘
                                     │
                                     ▼
                     ┌───────────────────────────────┐
                     │    ProvisionCognitoUsers       │
                     │    (Map State — MaxConcurrency  │
                     │     = 5, iterates $.users)      │
                     │  ┌─────────────────────────┐   │
                     │  │ ProvisionSingleUser      │   │
                     │  │ (Lambda: cognito-         │   │
                     │  │  provisioner)             │   │
                     │  └─────────────────────────┘   │
                     └───────────────┬───────────────┘
                                     │
                                     ▼
                     ┌───────────────────────────────┐
                     │    SendCredentialNotifications │
                     │    (Map State — MaxConcurrency  │
                     │     = 10, iterates $.users)     │
                     │  ┌─────────────────────────┐   │
                     │  │ SendSingleNotification   │   │
                     │  │ (Lambda: ses-             │   │
                     │  │  notification)            │   │
                     │  └─────────────────────────┘   │
                     └───────────────┬───────────────┘
                                     │
                                     ▼
                          ┌─────────────────────┐
                          │  VerifyProvisioning  │
                          │  (Lambda: provision- │
                          │   ing-verifier)      │
                          └──────────┬──────────┘
                                     │
                              ┌──────┴──────┐
                              │  Verified?  │
                              └──┬───────┬──┘
                                 │       │
                           Yes   │       │  No
                                 │       │
                    ┌────────────▼┐   ┌──▼────────────┐
                    │ Publish      │   │ HandleFailure  │
                    │ Success      │   │ (EventBridge + │
                    │ Event        │   │  SNS Alert)    │
                    └─────────────┘   └────────────────┘
```

### Retry & Error Handling Strategy

Each Lambda task in the state machine is wrapped with structured retry and catch logic:

```json
{
  "Retry": [
    {
      "ErrorEquals": ["Lambda.ServiceException", "Lambda.TooManyRequestsException"],
      "IntervalSeconds": 2,
      "MaxAttempts": 3,
      "BackoffRate": 2.0
    },
    {
      "ErrorEquals": ["States.TaskFailed"],
      "IntervalSeconds": 5,
      "MaxAttempts": 2,
      "BackoffRate": 2.0
    }
  ],
  "Catch": [
    {
      "ErrorEquals": ["States.ALL"],
      "ResultPath": "$.error",
      "Next": "HandleDynamoDBFailure"
    }
  ]
}
```

| Error Scenario | Retry Strategy | Terminal Failure Action |
|---------------|----------------|------------------------|
| **Lambda throttled** | 3 retries, exponential backoff (2s → 4s → 8s) | Route to worker-specific DLQ |
| **Task failed** | 2 retries, exponential backoff (5s → 10s) | Route to worker-specific DLQ |
| **Cognito limit** | 3 retries (per-user in Map iterator) | Individual user failure captured, others continue |
| **SES delivery error** | 2 retries per notification | Failure logged, does not block provisioning |
| **Verification failure** | No retry (terminal check) | Publish failure event + SNS critical alert |

### Dead-Letter Queue (DLQ) Architecture

Each worker Lambda is paired with a dedicated SQS Dead-Letter Queue for failure isolation and post-mortem analysis:

```
┌─────────────────────────────────────────────────────────────────────────┐
│                          DLQ FAILURE HANDLING                            │
│                                                                          │
│  Worker Lambda                      SQS Dead-Letter Queue               │
│  ┌────────────────────┐             ┌──────────────────────────────┐    │
│  │ dynamodb-           │──(fail)──▶ │ dynamodb-provisioner-dlq      │    │
│  │ provisioner         │            │ Retention: 14 days            │    │
│  └────────────────────┘             │ Alarm: ≥1 msg → SNS alert    │    │
│                                      └──────────────────────────────┘    │
│  ┌────────────────────┐             ┌──────────────────────────────┐    │
│  │ cognito-            │──(fail)──▶ │ cognito-provisioner-dlq       │    │
│  │ provisioner         │            │ Retention: 14 days            │    │
│  └────────────────────┘             │ Alarm: ≥1 msg → SNS alert    │    │
│                                      └──────────────────────────────┘    │
│  ┌────────────────────┐             ┌──────────────────────────────┐    │
│  │ ses-                │──(fail)──▶ │ ses-notification-dlq          │    │
│  │ notification        │            │ Retention: 14 days            │    │
│  └────────────────────┘             │ Alarm: ≥1 msg → SNS alert    │    │
│                                      └──────────────────────────────┘    │
│  ┌────────────────────┐             ┌──────────────────────────────┐    │
│  │ provisioning-       │──(fail)──▶ │ provisioning-verifier-dlq    │    │
│  │ verifier            │            │ Retention: 14 days            │    │
│  └────────────────────┘             │ Alarm: ≥1 msg → SNS alert    │    │
│                                      └──────────────────────────────┘    │
│                                                                          │
│  DLQ CloudWatch Alarms:                                                 │
│  ├── Threshold: ≥ 1 message visible                                     │
│  ├── Period: 60 seconds                                                  │
│  ├── Action: SNS → alarm_sns_topic_arns                                 │
│  └── Purpose: Immediate alerting on ANY provisioning failure            │
└─────────────────────────────────────────────────────────────────────────┘
```

### DLQ Configuration

| Property | Value | Purpose |
|----------|-------|---------|
| **Queue Type** | Standard SQS | Reliable message storage for failed events |
| **Retention Period** | 14 days (1,209,600 seconds) | Sufficient time for ops investigation |
| **Encryption** | SQS-managed (SSE-SQS) | At-rest encryption for failed payloads |
| **Alarm Threshold** | ≥ 1 message | Immediate notification on any failure |
| **Alarm Period** | 60 seconds | Near real-time detection |
| **Alarm Action** | SNS topic | Routes to on-call notification channels |

### Observability & Metrics

Every worker emits custom CloudWatch metrics under the `AccountProvisioning` namespace:

```
CloudWatch Namespace: AccountProvisioning
├── WorkerDuration     (ms)  — Execution time per invocation
├── WorkerSuccess      (count) — Successful completions
├── WorkerFailure      (count) — Failed executions
└── Dimensions:
    ├── Worker: dynamodb-provisioner | cognito-provisioner | ses-notification | provisioning-verifier
    └── Environment: dev | staging | prod

Step Functions Metrics (automatic):
├── ExecutionsStarted   — New provisioning workflows initiated
├── ExecutionsSucceeded — End-to-end provisioning success
├── ExecutionsFailed    — Workflows that exhausted all retries
├── ExecutionTime       — Total provisioning duration
└── ExecutionsTimedOut  — Workflows exceeding the 15-minute ceiling
```

### Terraform Integration

The Worker Lambdas and Step Functions are provisioned via two Terraform modules:

```hcl
# terraform/main.tf (excerpt)

module "worker_lambdas" {
  source               = "./modules/worker-lambdas"
  count                = var.enable_step_functions ? 1 : 0
  name_prefix          = local.name_prefix
  dynamodb_table_arn   = module.dynamodb.table_arn
  dynamodb_table_name  = module.dynamodb.table_name
  cognito_user_pool_arn = module.cognito.user_pool_arn
  cfn_template_bucket_arn = module.account_provisioning.template_bucket_arn
  event_bus_arn        = module.eventbridge.event_bus_arn
  alarm_sns_topic_arns = [module.monitoring.critical_alerts_topic_arn]
}

module "step_functions" {
  source                    = "./modules/step-functions"
  count                     = var.enable_step_functions ? 1 : 0
  name_prefix               = local.name_prefix
  dynamodb_provisioner_arn  = module.worker_lambdas[0].dynamodb_provisioner_arn
  cognito_provisioner_arn   = module.worker_lambdas[0].cognito_provisioner_arn
  ses_notification_arn      = module.worker_lambdas[0].ses_notification_arn
  provisioning_verifier_arn = module.worker_lambdas[0].provisioning_verifier_arn
  event_bus_arn             = module.eventbridge.event_bus_arn
  alarm_sns_topic_arns      = [module.monitoring.critical_alerts_topic_arn]
}
```

### Feature Flag

The entire Worker Lambda + Step Functions stack is gated behind a feature flag:

```hcl
variable "enable_step_functions" {
  description = "Enable Step Functions orchestration for account provisioning"
  type        = bool
  default     = false
}
```

When `enable_step_functions = false`, the platform falls back to the synchronous provisioning path within the NestJS `AccountsService`.

---

## Day-0 Bootstrapping

The initial platform setup creates the foundational admin context:

### Default Platform Account

| Field | Value |
|-------|-------|
| Account Name | ABC |
| Master Account Name | ABC |
| Cloud Type | Public |
| Address | Default placeholder |
| Account ID | `a0000000-0000-0000-0000-000000000001` |

### Default Enterprise & Licenses

| Entity | Value |
|--------|-------|
| Enterprise | Global (ID: `00000000-0000-0000-0000-000000000001`) |
| Product | Global |
| Service | Global |
| License Users | 100 |
| Start Date | System deployment date |

### Default Technical User

| Field | Value |
|-------|-------|
| Name | ABC DEF |
| Email | admin@adminplatform.com |
| Password | Adminuser@123 |
| Status | Active |
| Role | super_admin |

### Access Control Bootstrap

```
Platform Admin Group ──▶ Platform Admin Role ──▶ Full Permissions
    │                                              │
    │                                              ▼
    │                                        All menus visible
    │                                        All CRUD enabled
    │
    └── Technical Group ──▶ Technical Role ──▶ Base Permissions
```

### Bootstrap Sequence

```
 1. Create Account: ABC (Public Cloud, ID: a0000000-0000-0000-0000-000000000001)
 2. Create Enterprise: Global
 3. Create Product: Global
 4. Create Service: Global
 5. Link Enterprise 'Global' → Product 'Global'
 6. Link Product 'Global' → Service 'Global'
 7. Create License: ABC → Global Enterprise → Global Product → Global Service (100 users)
 8. Create Role: Platform Admin (full permissions, 0x7FFF)
 9. Create Role: Technical Role (view-only permissions)
10. Create Group: Platform Admin → Platform Admin role
11. Create Group: Technical Group → Technical Role
12. Create Technical User: admin@adminplatform.com (DynamoDB + Cognito)
13. Create Workstream: Global
14. Create Workstream: Default
```

---

## Data Flow & Routing

### Request Lifecycle

```
Client (React)
    │
    │ Authorization: Bearer <JWT>
    ▼
API Gateway + WAF
    │
    │ Rate limiting, SQL injection protection
    ▼
Lambda (NestJS)
    │
    ├── JwtAuthGuard: Verify JWT → Extract accountId, enterpriseId
    ├── RolesGuard: Check @Roles() decorator
    ├── AccountGuard: Verify accountId matches user's tenant
    │
    ▼
Controller
    │
    ▼
Service Layer
    │
    ├── DynamoDBRouterService.resolveTableName(accountId)
    │   │
    │   ├── Cache hit → Return cached table name
    │   │
    │   └── Cache miss → SSM lookup → Cache result (5min TTL)
    │
    ▼
DynamoDB (correct table)
    │
    ▼
Response → Client
```

### Cross-Account Data Access

```
Platform Admin AWS                    Customer AWS
┌──────────────┐                    ┌──────────────┐
│   NestJS     │                    │   DynamoDB   │
│   Lambda     │ ── AssumeRole ──▶ │   Tables     │
│              │    (IAM)           │              │
└──────────────┘                    └──────────────┘
       │
       ▼
  Uses credentials from
  cross-account IAM role
  to access DynamoDB in
  Customer AWS account
```

---

## Security & Isolation

### Layer-by-Layer Security

| Layer | Mechanism | Protection |
|-------|-----------|------------|
| **Network** | AWS WAF | SQL injection, XSS, known bad inputs, rate limiting |
| **Transport** | TLS 1.2+ | Encryption in transit |
| **Authentication** | Cognito JWT | Token validation with JWKS rotation |
| **Authorization** | NestJS Guards | Role-based + Tenant-scoped access |
| **Data (Public)** | PK/SK isolation | Logical tenant boundary in shared table |
| **Data (Private)** | Dedicated tables | Physical tenant isolation |
| **Secrets** | AWS Secrets Manager | KMS encryption, auto-rotation |
| **Audit** | EventBridge | Provisioning lifecycle trail |

### WAF Rules

```
WAF Rule Groups:
├── AWSManagedRulesCommonRuleSet    → Core protections
├── AWSManagedRulesSQLiRuleSet      → SQL injection
├── AWSManagedRulesKnownBadInputs   → Known attack patterns
└── Custom Rate Limiting:
    └── /auth/* endpoints → 100 requests/5 minutes/IP
```

### License Enforcement

```
User Creation Request
    │
    ▼
Check Active License for (Enterprise + Product + Service)
    │
    ├── No active license → 403 Forbidden
    │
    ▼
Count existing users for this license
    │
    ├── Count >= license.numberOfUsers → 403 "License limit exceeded"
    │
    ▼
Create user in Cognito + DynamoDB
```

---

## Infrastructure as Code

### Terraform Module Structure

```
terraform/
├── main.tf                              # Root orchestration
├── variables.tf                         # Input variables
├── outputs.tf                           # Output values
├── versions.tf                          # Provider versions
├── environments/
│   ├── dev.tfvars
│   ├── staging.tfvars
│   └── prod.tfvars
└── modules/
    ├── cognito/          # User pool, client, domain
    ├── lambda/           # NestJS Lambda function
    ├── api-gateway/      # REST API + stages
    ├── dynamodb/         # Shared table + GSIs
    ├── waf/              # WAF rules + associations
    ├── secrets-manager/  # Secret definitions + rotation
    ├── eventbridge/      # Custom event bus + rules
    ├── monitoring/       # CloudWatch alarms + dashboards
    ├── autoscaling/      # DynamoDB auto-scaling
    ├── account-provisioning/ # StackSet for private accounts
    ├── worker-lambdas/   # Dedicated provisioning worker functions + DLQs
    ├── step-functions/   # State machine for provisioning orchestration
    └── frontend-hosting/ # S3 + CloudFront CDN
```

### CloudFormation (Private Account Tables)

Each private account table is provisioned via a CloudFormation template:

```yaml
Parameters:
  AccountId, AccountName, Environment, ProjectName
  BillingMode, ReadCapacity, WriteCapacity
  EnablePointInTimeRecovery, EnableDeletionProtection

Resources:
  - DynamoDB Table (with PK, SK, 3 GSIs)
  - IAM Role (cross-account access)
  - SSM Parameters (table-name, cloud-type, status)
```

### CI/CD Pipeline

```
GitHub Actions:
├── ci.yml               # Lint, test, build on PR
├── pr-validation.yml    # PR checks and review gates
├── deploy.yml           # Deploy to dev/staging/prod
├── infrastructure.yml   # Terraform plan/apply
└── scheduled.yml        # Automated maintenance tasks
```

---

## Sequence Diagrams

### Bootstrapping Sequence

```
┌──────────┐     ┌──────────┐     ┌──────────┐     ┌──────────┐
│ Deploy   │     │ Bootstrap│     │ DynamoDB  │     │ Cognito  │
│ Script   │     │ Service  │     │           │     │          │
└────┬─────┘     └────┬─────┘     └────┬──────┘     └────┬─────┘
     │                │                │                  │
     │ Initialize()   │                │                  │
     │───────────────▶│                │                  │
     │                │                │                  │
     │                │ Put(Global     │                  │
     │                │ Product)       │                  │
     │                │───────────────▶│                  │
     │                │                │                  │
     │                │ Put(Global     │                  │
     │                │ Enterprise)    │                  │
     │                │───────────────▶│                  │
     │                │                │                  │
     │                │ Put(ABC Account│                  │
     │                │ + Address +    │                  │
     │                │ License)       │                  │
     │                │───────────────▶│                  │
     │                │                │                  │
     │                │ Link Enterprise│                  │
     │                │ →Product→Service                  │
     │                │───────────────▶│                  │
     │                │                │                  │
     │                │ Put(Platform   │                  │
     │                │ Admin Group +  │                  │
     │                │ Platform Admin │                  │
     │                │ Role)          │                  │
     │                │───────────────▶│                  │
     │                │                │                  │
     │                │ CreateUser     │                  │
     │                │ (admin@...)    │                  │
     │                │──────────────────────────────────▶│
     │                │                │                  │
     │                │ Put(Global +   │                  │
     │                │ Default        │                  │
     │                │ Workstreams)   │                  │
     │                │───────────────▶│                  │
     │                │                │                  │
     │  Complete      │                │                  │
     │◀───────────────│                │                  │
```

### Customer Onboarding Sequence

```
┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐
│ Platform │  │ Accounts │  │Provisioner│  │CloudForm │  │ DynamoDB │  │ Cognito  │
│  Admin   │  │ Service  │  │ Service   │  │ (CFN)    │  │          │  │          │
└────┬─────┘  └────┬─────┘  └────┬──────┘  └────┬─────┘  └────┬─────┘  └────┬─────┘
     │              │             │               │             │             │
     │ POST /accounts             │               │             │             │
     │ {name, cloud               │               │             │             │
     │  Type, tech                │               │             │             │
     │  User, licenses}           │               │             │             │
     │─────────────▶│             │               │             │             │
     │              │             │               │             │             │
     │              │ provision   │               │             │             │
     │              │ Account()   │               │             │             │
     │              │────────────▶│               │             │             │
     │              │             │               │             │             │
     │              │             │ [If Private]  │             │             │
     │              │             │ CreateStack() │             │             │
     │              │             │──────────────▶│             │             │
     │              │             │               │             │             │
     │              │             │               │ Create      │             │
     │              │             │               │ Table       │             │
     │              │             │               │────────────▶│             │
     │              │             │               │             │             │
     │              │             │ [If Public]   │             │             │
     │              │             │ Register SSM  │             │             │
     │              │             │──────────────▶│             │             │
     │              │             │               │             │             │
     │              │ transactWrite               │             │             │
     │              │ (Account +                  │             │             │
     │              │  Address +                  │             │             │
     │              │  TechUser +                 │             │             │
     │              │  Licenses)                  │             │             │
     │              │─────────────────────────────────────────▶│             │
     │              │             │               │             │             │
     │              │ createCognito               │             │             │
     │              │ User()      │               │             │             │
     │              │─────────────────────────────────────────────────────▶│
     │              │             │               │             │             │
     │  201 Created │             │               │             │             │
     │◀─────────────│             │               │             │             │
```

### User Login Sequence

```
┌──────────┐     ┌──────────┐     ┌──────────┐     ┌──────────┐
│  React   │     │ Cognito  │     │  NestJS  │     │ DynamoDB │
│   App    │     │          │     │  Lambda  │     │          │
└────┬─────┘     └────┬─────┘     └────┬──────┘     └────┬─────┘
     │                │                │                  │
     │ Authenticate   │                │                  │
     │ (email, pass)  │                │                  │
     │───────────────▶│                │                  │
     │                │                │                  │
     │ JWT Token      │                │                  │
     │ {sub, email,   │                │                  │
     │  account_id,   │                │                  │
     │  enterprise_id,│                │                  │
     │  role, groups} │                │                  │
     │◀───────────────│                │                  │
     │                │                │                  │
     │ GET /api/accounts               │                  │
     │ Authorization: Bearer <JWT>     │                  │
     │────────────────────────────────▶│                  │
     │                │                │                  │
     │                │                │ Verify JWT       │
     │                │                │ (JWKS check)     │
     │                │                │                  │
     │                │                │ Extract tenant   │
     │                │                │ context from     │
     │                │                │ claims           │
     │                │                │                  │
     │                │                │ Query DynamoDB   │
     │                │                │ (scoped to       │
     │                │                │  accountId)      │
     │                │                │─────────────────▶│
     │                │                │                  │
     │                │                │ Results          │
     │                │                │◀─────────────────│
     │                │                │                  │
     │  JSON Response │                │                  │
     │◀────────────────────────────────│                  │
     │                │                │                  │
     │ Set breadcrumb │                │                  │
     │ context from   │                │                  │
     │ user's account │                │                  │
     │ + enterprise   │                │                  │
```

---

## API Reference

### Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `POST` | `/api/auth/login` | Public | Authenticate via Cognito |
| `GET` | `/api/accounts` | Admin | List all accounts |
| `POST` | `/api/accounts` | Admin | Create account + provision |
| `GET` | `/api/accounts/:id` | Account | Get account details |
| `PUT` | `/api/accounts/:id` | Account | Update account |
| `DELETE` | `/api/accounts/:id` | Admin | Delete + deprovision |
| `GET` | `/api/enterprises` | Auth | List enterprises |
| `POST` | `/api/enterprises` | Admin | Create enterprise |
| `GET` | `/api/enterprises/:id` | Account | Get enterprise details |
| `PUT` | `/api/enterprises/:id` | Account | Update enterprise |
| `DELETE` | `/api/enterprises/:id` | Admin | Delete enterprise + unlink products/services |
| `GET` | `/api/licenses` | Account | List licenses (filtered) |
| `POST` | `/api/licenses` | Account | Create license |
| `GET` | `/api/licenses/:id` | Account | Get license details |
| `PUT` | `/api/licenses/:id` | Account | Update license |
| `DELETE` | `/api/licenses/:id` | Account | Delete license |
| `GET` | `/api/licenses/capacity` | Account | Get seat capacity for account |
| `GET` | `/api/users` | Account | List users (filtered) |
| `POST` | `/api/users` | Account | Create user |
| `GET` | `/api/users/:id` | Account | Get user details |
| `PUT` | `/api/users/:id` | Account | Update user |
| `DELETE` | `/api/users/:id` | Account | Delete user |
| `GET` | `/api/users/me/access` | Auth | Get current user's account/enterprise access |
| `GET` | `/api/users/me/permissions` | Auth | Get current user's aggregated permissions |
| `GET` | `/api/roles` | Auth | List roles |
| `POST` | `/api/roles` | Account | Create role |
| `GET` | `/api/roles/:id` | Account | Get role details |
| `PUT` | `/api/roles/:id` | Account | Update role |
| `DELETE` | `/api/roles/:id` | Account | Delete role |
| `GET` | `/api/roles/:id/permissions` | Account | Get role's menu-level permissions |
| `PUT` | `/api/roles/:id/permissions` | Account | Update role's menu-level permissions |
| `GET` | `/api/groups` | Auth | List groups |
| `POST` | `/api/groups` | Account | Create group |
| `GET` | `/api/groups/:id` | Account | Get group details |
| `PUT` | `/api/groups/:id` | Account | Update group |
| `DELETE` | `/api/groups/:id` | Account | Delete group |
| `GET` | `/api/workstreams` | Account | List workstreams |
| `POST` | `/api/workstreams` | Account | Create workstream |
| `GET` | `/api/workstreams/:id` | Account | Get workstream details |
| `PUT` | `/api/workstreams/:id` | Account | Update workstream (rename, tools config) |
| `DELETE` | `/api/workstreams/:id` | Account | Delete workstream |
| `GET` | `/api/provisioning/:accountId` | Admin | Get provisioning status |
| `POST` | `/api/provisioning` | Admin | Start provisioning |
| `DELETE` | `/api/provisioning/:accountId` | Admin | Deprovision account |
| `GET` | `/api/pipelines` | Account | List pipelines (filtered) |
| `POST` | `/api/pipelines` | Account | Create pipeline |
| `GET` | `/api/pipelines/:id` | Account | Get pipeline details |
| `PUT` | `/api/pipelines/:id` | Account | Update pipeline |
| `DELETE` | `/api/pipelines/:id` | Account | Delete pipeline |
| `GET` | `/api/products` | Auth | List products |
| `POST` | `/api/products` | Admin | Create product |
| `PUT` | `/api/products/:id` | Admin | Update product |
| `DELETE` | `/api/products/:id` | Admin | Delete product |
| `GET` | `/api/services` | Auth | List services |
| `POST` | `/api/services` | Admin | Create service |
| `PUT` | `/api/services/:id` | Admin | Update service |
| `DELETE` | `/api/services/:id` | Admin | Delete service |
| `POST` | `/api/bootstrap` | Public | Trigger Day-0 setup |
| `GET` | `/api/credentials` | Account | List credentials (filtered by account/enterprise) |
| `POST` | `/api/credentials` | Account | Create credential |
| `GET` | `/api/credentials/:id` | Account | Get credential details |
| `PUT` | `/api/credentials/:id` | Account | Update credential |
| `DELETE` | `/api/credentials/:id` | Account | Delete credential |
| `GET` | `/api/credentials/check-name` | Account | Check credential name uniqueness (query: `name`, `accountId`, `excludeId`) |
| `POST` | `/api/credentials/:id/rotate` | Account | Rotate credential secrets (re-auth for OAuth) |
| `GET` | `/api/connectors/oauth/initiate` | Account | Start OAuth flow — returns provider redirect URL |
| `GET` | `/api/connectors/oauth/callback` | Public | OAuth callback — exchanges code for tokens, updates credential |
| `DELETE` | `/api/connectors/oauth/:credentialId` | Account | Revoke OAuth tokens and reset credential to pending |
| `POST` | `/api/connectors/test` | Account | Test connector connectivity (URL + credential verification) |
| `GET` | `/api/licenses/licensed-entities` | Account | Get products & services from active licenses for account/enterprise |

---

## Migration Cutover Checklist — Supabase → NestJS/Cognito

This section documents the exact steps to switch the frontend from the Supabase backend to the external NestJS + DynamoDB + Cognito backend by flipping `VITE_API_PROVIDER` from `supabase` to `external`.

---

### Prerequisite: Hook & Context Migration Status

Before starting the cutover, ensure ALL frontend code paths have been converted to dual-mode. The table below tracks the current status.

#### Data-Fetching Hooks — Dual-Mode Status

| Hook | `isExternalApi()` Branch | NestJS Endpoint | Status |
|------|--------------------------|-----------------|--------|
| `useAccounts.ts` | ✅ Yes | `/api/accounts` | Ready |
| `useEnterprises.ts` | ✅ Yes | `/api/enterprises` | Ready |
| `useWorkstreams.ts` | ✅ Yes | `/api/workstreams` | Ready |
| `useGroups.ts` | ✅ Yes | `/api/groups` | Ready |
| `useRoles.ts` | ✅ Yes | `/api/roles` | Ready |
| `useLicenses.ts` | ✅ Yes | `/api/licenses` | Ready |
| `useCredentials.ts` | ✅ Yes | `/api/credentials` | Ready |
| `usePipelines.ts` | ✅ Yes | `/api/pipelines` | Ready |
| `useAccessControlUsers.ts` | ✅ Yes | `/api/users` | Ready |
| `useUserGroups.ts` | ✅ Yes | `/api/users/:id/groups` | Ready |
| `useUserWorkstreams.ts` | ✅ Yes | `/api/users/:id/workstreams` | Ready |
| `useRolePermissions.ts` | ✅ Yes | `/api/roles/:id/permissions` | Ready |
| `useLicenseCapacity.ts` | ✅ Yes | `/api/licenses/capacity` | Ready |
| `useAccountGlobalAccess.ts` | ✅ Yes | `/api/accounts/:id/global-access` | Ready |
| `useProvisioningStatus.ts` | ✅ Yes (via `provisioningService`) | `/api/provisioning/:accountId` | Ready |

#### Context Providers — Dual-Mode Status

| Context | Supabase Dependency | Required Change | Status |
|---------|---------------------|-----------------|--------|
| `AuthContext.tsx` | Queries `account_technical_users` for user access data | Replace with `/api/users/me/access` endpoint | ✅ Ready |
| `AccountContext.tsx` | Fetches accounts via Supabase SDK | Route through `/api/accounts` endpoint | ✅ Ready |
| `EnterpriseContext.tsx` | Fetches enterprises via Supabase SDK | Route through `/api/enterprises` endpoint | ✅ Ready |
| `PermissionContext.tsx` | Queries `user_groups → group_roles → role_permissions` chain | Replace with `/api/users/me/permissions` endpoint | ✅ Ready |

#### Utility Functions — Migration Status

| Utility | Location | Supabase Dependency | Status |
|---------|----------|---------------------|--------|
| `ensureDefaultWorkstream()` | `useWorkstreams.ts` | Routes through `/api/workstreams/ensure-default` endpoint | ✅ Ready |
| `useMultiTenantCacheClear` | `useMultiTenantCacheClear.ts` | Invalidates React Query cache (no Supabase dep) | ✅ Ready |
| `useViewPreference` | `useViewPreference.ts` | Uses localStorage (no Supabase dep) | ✅ Ready |

#### Component-Level Direct Supabase Calls — Migration Status ✅

All components with direct `supabase.from()` or `supabase.functions.invoke()` calls now have `isExternalApi()` branching. Supabase calls exist only inside the fallback branch.

##### Category A: Direct `supabase.from()` Calls in Components (Data Plane) — ✅ Ready

| Component | Supabase Call | Change Made | Status |
|-----------|---------------|-------------|--------|
| `AddEnterpriseForm.tsx` | `supabase.from("products/services/enterprises/enterprise_products")` | Routed through `productsService`, `servicesService`, `enterprisesService`, and `httpClient` | ✅ Ready |
| `EditEnterpriseForm.tsx` | `supabase.from("products/services/enterprises")` | Routed through `productsService`, `servicesService`, `enterprisesService` | ✅ Ready |
| `ProductsServicesManager.tsx` | `supabase.from("products/services")` CRUD | Fully routed through `productsService` and `servicesService` (extended with create/update/delete) | ✅ Ready |
| `AddCredentialDialog.tsx` | `supabase.from("credentials/licenses/products/services")` | License query routed through `httpClient`; OAuth status/delete routed through `httpClient` | ✅ Ready |
| `EditCredentialDialog.tsx` | `supabase.from("account_licenses/products/services")` | Routed through `GET /api/licenses/licensed-entities` via `httpClient` | ✅ Ready |
| `EditAccountForm.tsx` | `supabase.from("accounts")` for name uniqueness | Routed through `GET /api/accounts` via `httpClient` | ✅ Ready |
| `LicenseAddDialog.tsx` | `supabase.from("account_licenses")` for duplicate check | Routed through `GET /api/licenses` via `httpClient` | ✅ Ready |
| `EnterpriseSummary.tsx` | `supabase.from("enterprises").delete()` | Routed through `DELETE /api/enterprises/:id` via `httpClient` | ✅ Ready |

##### Category B: Edge Function Invocations in Components — ✅ Ready

| Component | Edge Function | `isExternalApi()` Endpoint | Status |
|-----------|--------------|---------------------------|--------|
| `AddUserDialog.tsx` | `create-technical-user` | `POST /api/users/provision` | ✅ Ready |
| `ExpiringCredentials.tsx` | `check-credential-expiration` | `POST /api/credentials/check-expiration` + `GET /api/credentials/expiring` | ✅ Ready |
| `ExpiringLicenses.tsx` | `send-renewal-reminders` | `POST /api/licenses/send-reminders` + `GET /api/licenses/expiring` | ✅ Ready |
| `AddConnectorDialog.tsx` | `test-connector-connectivity` | `POST /api/connectors/test` + `GET /api/licenses/licensed-entities` | ✅ Ready |

##### Category C: Edge Function Invocations in Hooks — ✅ Ready

| Hook | Edge Function | `isExternalApi()` Endpoint | Status |
|------|--------------|---------------------------|--------|
| `useCredentials.ts` | `connector-oauth/initiate` | `POST /api/connectors/oauth/initiate` | ✅ Ready |
| `useCredentials.ts` | `connector-oauth/status` | `GET /api/connectors/oauth/status/:id` | ✅ Ready |
| `useCredentials.ts` | `connector-oauth/revoke` | `POST /api/connectors/oauth/revoke` | ✅ Ready |

##### Category D: Supabase Auth Calls — ✅ Ready

| File | Previous Call | Replacement | Status |
|------|-------------|-------------|--------|
| `usePipelines.ts` | `supabase.auth.getUser()` | `user.sub` from `useAuth()` context | ✅ Ready |

##### Category E: Service Layer Files (Already Dual-Mode — Supabase Branch Only)

These files in `src/lib/api/services/` already have `isExternalApi()` branching. The Supabase calls exist only within the `else` (Supabase) branch and are **expected**:

| Service | Status | Notes |
|---------|--------|-------|
| `groups.service.ts` | ✅ Ready | Dual-mode implemented |
| `workstreams.service.ts` | ✅ Ready | Dual-mode implemented |
| `users.service.ts` | ✅ Ready | Dual-mode implemented |
| `accounts.service.ts` | ✅ Ready | Dual-mode implemented |
| `enterprises.service.ts` | ✅ Ready | Dual-mode implemented |
| `licenses.service.ts` | ✅ Ready | Dual-mode implemented |
| `roles.service.ts` | ✅ Ready | Dual-mode implemented |
| `products.service.ts` | ✅ Ready | Dual-mode implemented |
| `provisioning.service.ts` | ✅ Ready | Dual-mode implemented |

#### Supabase Edge Functions → NestJS Endpoints

These Supabase Edge Functions must have NestJS equivalents before cutover:

| Edge Function | Purpose | NestJS Equivalent | Status |
|---------------|---------|-------------------|--------|
| `create-admin-user` | Creates Supabase auth user + user_roles | Cognito `adminCreateUser` + DynamoDB write | **Needs NestJS endpoint** |
| `create-technical-user` | Creates Supabase auth user for tech users | Cognito `adminCreateUser` + DynamoDB write | **Needs NestJS endpoint** |
| `check-credential-expiration` | Scans credentials for upcoming expiry | NestJS cron or Lambda scheduled event | **Needs NestJS endpoint** |
| `send-renewal-reminders` | Sends license renewal emails via SES | NestJS SES notification worker | **Needs NestJS endpoint** |
| `update-expired-users` | Deactivates users past end_date | NestJS cron or Step Function | **Needs NestJS endpoint** |
| `provisioning-status` | Returns provisioning state for an account | `/api/provisioning/:accountId` (exists in NestJS) | ✅ Ready |
| `connector-oauth` | Handles OAuth flows for 3rd-party connectors | API Gateway + Lambda handler | **Needs NestJS endpoint** |
| `test-connector-connectivity` | Tests connector credential validity | NestJS credentials controller | **Needs NestJS endpoint** |

#### Audit Summary — Frontend Dual-Mode Conversion Complete ✅

| Category | Count | Status |
|----------|-------|--------|
| **A** — Component `supabase.from()` calls | 7 components (`AddEnterpriseForm`, `EditEnterpriseForm`, `AddCredentialDialog`, `EditCredentialDialog`, `EditAccountForm`, `LicenseAddDialog`, `EnterpriseSummary`) | ✅ **Done** |
| **B** — Component edge function calls | 4 components (`AddUserDialog`, `AddConnectorDialog`, `ExpiringLicenses`, `ExpiringCredentials`) | ✅ **Done** |
| **C** — Hook edge function calls | 3 calls in `useCredentials` (OAuth initiate/status/revoke) | ✅ **Done** |
| **D** — `supabase.auth` calls | 1 call in `usePipelines` (replaced with `useAuth().user.sub`) | ✅ **Done** |
| **E** — Hook `supabase.from()` calls | 6 hooks (`useAccounts`, `useCredentials`, `useGroups`, `useLicenses`, `usePipelines`, `useWorkstreams`) | ✅ **Done** |
| **F** — Context providers | 4 contexts (`AuthContext`, `AccountContext`, `EnterpriseContext`, `PermissionContext`) | ✅ **Done** |
| **G** — Service layer (already dual-mode) | 9 services | ✅ **Done** |
| **H** — Credential name check hook | `useCheckCredentialNameExists` in `useCredentials.ts` | ✅ **Done** |
| **I** — Credential mutations | `updateCredential`, `rotateCredential` in `useCredentials.ts` | ✅ **Done** |

**Final grep audit (verified clean):**
- `supabase.from()` — 0 unguarded calls across `src/hooks/`, `src/components/`, `src/pages/`, `src/contexts/`
- `supabase.functions.invoke()` — 0 unguarded calls
- `supabase.auth.*` — 0 remaining calls

> **✅ Frontend dual-mode conversion is complete.** All hooks, components, contexts, and services branch on `isExternalApi()`. Every `supabase.*` call exists only inside the Supabase fallback branch. The remaining blocker is **NestJS backend endpoint availability** — the 7 Supabase Edge Functions listed above must have NestJS equivalents deployed before setting `VITE_API_PROVIDER=external`.

---

### Phase 0 — Pre-Flight Validation (Before Touching Production)

Run every item below. **All must pass** before proceeding.

| # | Check | How to Verify | Pass? |
|---|-------|---------------|-------|
| 1 | NestJS Lambda is deployed and healthy | `curl https://<api-gw-url>/health` returns `200` | ☐ |
| 2 | Cognito User Pool is provisioned | Verify Pool ID + Client ID in AWS Console | ☐ |
| 3 | Day-0 bootstrap completed | Run `scripts/verify-bootstrap.ts --fix` — all 14 steps green | ☐ |
| 4 | DynamoDB shared table exists | `aws dynamodb describe-table --table-name app_data` | ☐ |
| 5 | SSM parameters populated | `aws ssm get-parameter --name /accounts/<root-id>/dynamodb/table-name` | ☐ |
| 6 | Cross-account IAM role trust | NestJS Lambda can assume role into Customer AWS account | ☐ |
| 7 | Data migration complete | Run `scripts/verify-migration.ts` — row counts match Supabase | ☐ |
| 8 | Cognito users provisioned | All `account_technical_users` have matching Cognito identities | ☐ |
| 9 | WAF + API Gateway rate limits | Confirm WAF rules are active on API Gateway | ☐ |
| 10 | CloudWatch alarms configured | `4XX/5XX` alarm, Lambda error alarm, DDB throttle alarm | ☐ |
| 11 | DNS / CORS ready | API Gateway custom domain + CORS allows frontend origin | ☐ |
| 12 | Secrets Manager populated | JWT signing keys, Cognito config present in Secrets Manager | ☐ |
| 13 | SES email sending verified | SES production access granted; sender domain/email verified | ☐ |
| 14 | Step Functions operational | Provisioning state machine is deployed + test execution passes | ☐ |
| 15 | Pre-flight script passes | Run `scripts/pre-flight-check.ts` — all 70+ checks green | ☐ |
| 16 | All hooks converted to dual-mode | `grep -rL "isExternalApi" src/hooks/use*.ts` returns empty (no unconverted hooks) | ☐ |
| 17 | All contexts converted | `AuthContext`, `AccountContext`, `EnterpriseContext`, `PermissionContext` all branch on `isExternalApi()` | ☐ |
| 18 | Edge function equivalents deployed | All 7 Supabase edge functions have NestJS equivalents responding `200` | ☐ |
| 19 | Cognito reconciliation dry-run | `POST /api/users/reconcile/cognito?dryRun=true` reports zero drift | ☐ |
| 20 | Products & Services seed data | `/api/products` and `/api/services` return expected master data | ☐ |

---

### Phase 1 — Environment Variable Setup

Set the following environment variables in your deployment pipeline or `.env` file:

```bash
# ── Switch the API provider ──
VITE_API_PROVIDER=external

# ── NestJS API Gateway URL ──
VITE_EXTERNAL_API_URL=https://api.yourplatform.com

# ── Cognito Configuration ──
VITE_COGNITO_USER_POOL_ID=us-east-1_XXXXXXXXX
VITE_COGNITO_CLIENT_ID=xxxxxxxxxxxxxxxxxxxxxxxxxx
VITE_COGNITO_REGION=us-east-1
```

> **Note:** The Supabase env vars (`VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`) can remain — they are ignored when `VITE_API_PROVIDER=external`.

---

### Phase 2 — Cutover Steps

Execute in order. Each step has a **verification gate** — do not proceed until it passes.

#### Step 1: Deploy Frontend with `VITE_API_PROVIDER=external`

```bash
# Build with external provider
VITE_API_PROVIDER=external \
VITE_EXTERNAL_API_URL=https://api.yourplatform.com \
VITE_COGNITO_USER_POOL_ID=us-east-1_XXXXXXXXX \
VITE_COGNITO_CLIENT_ID=xxxxxxxxxxxxxxxxxxxxxxxxxx \
npm run build
```

**Gate:** `grep -r "VITE_API_PROVIDER" dist/` confirms the value is baked into the bundle.

#### Step 2: Verify Authentication

1. Open the deployed app in an incognito window
2. Sign in with a known Cognito user (e.g., `admin@adminplatform.com`)
3. Confirm JWT token appears in `Authorization: Bearer <token>` header on network requests
4. Verify the `NewPasswordRequired` challenge flow works for first-time users
5. Verify the `ForgotPassword` → 6-digit code → password reset flow works

**Gate:** Successful login + dashboard renders with user context.

#### Step 3: Verify Context Providers

| Context | Verification | Expected |
|---------|-------------|----------|
| `AuthContext` | Login → check user object | `accountId`, `enterpriseId`, `role` populated from Cognito claims |
| `AccountContext` | Header → account selector | Only authorized accounts appear in dropdown |
| `EnterpriseContext` | Header → enterprise selector | Filtered by active account; auto-selects for single-enterprise users |
| `PermissionContext` | Navigate to Access Control | Menu visibility matches assigned role permissions |

**Gate:** All 4 contexts resolve correctly from NestJS/Cognito (no Supabase `supabase.co` requests in Network tab).

#### Step 4: Verify Data Hooks — Read Operations

Test each entity's list view loads correctly:

| Entity | Route | Expected |
|--------|-------|----------|
| Accounts | `/` (Overview) | Account cards render |
| Enterprises | Overview → Enterprise filter | Enterprise dropdown populated |
| Workstreams | Account Settings | Workstreams list loads |
| Licenses | Account Settings → Licenses | License table renders |
| Users | Access Control → Users tab | User table renders |
| Groups | Access Control → Groups tab | Group cards render |
| Roles | Access Control → Roles tab | Role cards render |
| Role Permissions | Roles → click role → Scopes | Permission matrix loads |
| Credentials | Security page | Credentials table renders |
| Pipelines | Pipelines page | Pipeline list renders |
| Products | Enterprise → Products | Product list loads |
| Services | Enterprise → Services | Service list loads |
| User-Group assignments | Access Control → Users → click user | Assigned groups display |
| User-Workstream assignments | Access Control → Users → click user | Assigned workstreams display |
| License Capacity | Access Control → Add User | Capacity banner shows correct counts |

**Gate:** All 15 entity types render data matching the migrated DynamoDB content.

#### Step 5: Verify Data Hooks — Write Operations

Test create, update, and delete for at least one entity per category:

```
Core entities:
  1. Create a test workstream → appears in list
  2. Edit the test workstream name → name updates
  3. Delete the test workstream → removed from list

Junction tables:
  4. Assign a user to a group → user_groups updated
  5. Assign a workstream to a user → user_workstreams updated
  6. Set role permissions → role_permissions saved

User lifecycle:
  7. Create a new user → Cognito identity provisioned + DynamoDB record created
  8. Verify user receives credential email via SES
  9. New user logs in with provided credentials → NewPasswordRequired challenge
```

**Gate:** CRUD round-trip succeeds with toast confirmations (no Supabase errors in console).

#### Step 6: Verify Tenant Isolation

1. Log in as a user scoped to Account A
2. Confirm only Account A data is visible
3. Attempt to access Account B data via URL manipulation
4. Confirm 403 Forbidden response from NestJS `AccountGuard`
5. Verify `Global Access` users (with Global enterprise license) can see all accounts
6. Verify enterprise-level scoping: user assigned to Enterprise X cannot see Enterprise Y data

**Gate:** No cross-tenant data leakage.

#### Step 7: Verify Token Refresh

1. Log in and wait for the token to approach expiry (or set a short TTL for testing)
2. Confirm the `cognitoAuth` client automatically refreshes the session
3. Verify no 401 errors occur during the refresh window
4. Verify the `httpClient` 401-retry mechanism triggers token refresh and retries the request

**Gate:** Continuous session without forced re-login.

#### Step 8: Verify Scheduled Operations

| Operation | Trigger | Expected |
|-----------|---------|----------|
| Credential expiration check | Cron / CloudWatch Event | Credentials approaching expiry flagged |
| License renewal reminders | Cron / CloudWatch Event | SES email sent to license contacts |
| Expired user deactivation | Cron / CloudWatch Event | Users past `end_date` set to `inactive` |
| Cognito reconciliation | Daily cron (2 AM UTC) | Drift report shows zero mismatches |

**Gate:** All 4 scheduled jobs execute successfully with CloudWatch metrics emitted.

#### Step 9: Verify Account Provisioning

1. Create a new **Public Cloud** account → data written to shared `app_data` table
2. Create a new **Private Cloud** account → CloudFormation StackSet creates dedicated table
3. Verify SSM parameters created for both accounts
4. Verify provisioning status banner updates correctly in the UI
5. Verify EventBridge events emitted (Started → Success)

**Gate:** End-to-end provisioning lifecycle completes without manual intervention.

---

### Phase 3 — Rollback Procedure

If critical issues are discovered post-cutover, roll back within minutes:

#### Immediate Rollback (< 5 minutes)

```bash
# Redeploy with Supabase provider
VITE_API_PROVIDER=supabase npm run build

# Deploy the Supabase-backed bundle
# (use your CI/CD pipeline or manual S3 + CloudFront invalidation)
```

**Why this works:** The Supabase client, types, and RLS policies remain intact in the codebase. Setting `VITE_API_PROVIDER=supabase` causes all hooks to route back through the Supabase SDK, completely bypassing the NestJS/Cognito path.

#### Rollback Verification

| # | Check | How to Verify |
|---|-------|---------------|
| 1 | Login works via Supabase Auth | Sign in with email/password on Supabase |
| 2 | Data loads from Supabase | Network tab shows `supabase.co` requests |
| 3 | No console errors | Browser console is clean |
| 4 | CRUD operations work | Create/edit/delete an entity |
| 5 | Context providers resolve | Account/Enterprise selectors populate correctly |
| 6 | Permissions work | Menu visibility and CRUD guards enforce correctly |

#### Auth Rollback Considerations

> **⚠️ Warning:** If users had their passwords changed or were newly created in Cognito during the cutover window, those credentials will **not exist** in Supabase Auth. You must:
>
> 1. Identify Cognito users created/modified since cutover timestamp
> 2. Re-create corresponding Supabase Auth users via the `create-technical-user` edge function
> 3. Notify affected users of temporary password reset

#### Data Sync Considerations

> **⚠️ Warning:** If users created or modified data in the NestJS/DynamoDB backend during the cutover window, that data will **not** be present in Supabase after rollback. You must manually reconcile:
>
> 1. Export changed records from DynamoDB since cutover timestamp
> 2. Transform back to relational format
> 3. Insert into Supabase using the migration scripts in reverse

---

### Phase 4 — Post-Cutover Hardening

After successful cutover and a **48-hour stabilization window**:

| # | Action | Details |
|---|--------|---------|
| 1 | Remove Supabase SDK dependency | `npm uninstall @supabase/supabase-js` |
| 2 | Delete Supabase integration files | Remove `src/integrations/supabase/` |
| 3 | Remove dual-mode branches | Strip `if (isExternalApi())` checks from all 9 categories (A–I) of converted files |
| 4 | Remove `ensureDefaultWorkstream` | Replace with NestJS-side default workstream logic |
| 5 | Delete Supabase env vars | Remove `VITE_SUPABASE_*` from all environments |
| 6 | Delete Supabase Edge Functions | Remove `supabase/functions/` directory |
| 7 | Archive Supabase project | Pause or delete the Supabase project |
| 8 | Remove `API_CONFIG.provider` | Simplify `http-client.ts` to always use Cognito tokens |
| 9 | Simplify Context Providers | Remove Supabase query paths from `AuthContext`, `AccountContext`, `EnterpriseContext`, `PermissionContext` |
| 10 | Update CI/CD | Remove Supabase-related pipeline steps |
| 11 | Run Cognito reconciliation | Execute `/api/users/reconcile/cognito` to catch any drift |
| 12 | Enable CloudWatch dashboards | Monitor API latency, error rates, DDB consumed capacity |
| 13 | Verify nightly pre-flight checks | Confirm `pre-flight-check.ts` runs via scheduled CI and reports clean |

---

### Decision Matrix — When to Rollback

| Symptom | Severity | Action |
|---------|----------|--------|
| Login fails for all users | **P0** | Immediate rollback |
| Context providers fail to resolve (blank header) | **P0** | Immediate rollback — users cannot navigate |
| Data missing for some accounts | **P1** | Check DynamoDB Router → SSM params; rollback if unresolvable in 30 min |
| Permission context returns empty (no menu visibility) | **P1** | Check `/api/users/me/permissions` endpoint; rollback if RBAC is broken |
| Intermittent 401 errors | **P2** | Check Cognito token refresh; may be clock skew — fix without rollback |
| User creation fails (Cognito provisioning) | **P2** | Check Cognito service limits + SES sending quota; fix without rollback |
| Slow API responses (> 3s p95) | **P3** | Check Lambda cold starts / DDB throttling; tune without rollback |
| Single entity CRUD fails | **P3** | Debug NestJS controller; partial rollback not needed |
| Scheduled jobs not firing | **P3** | Check CloudWatch Events / cron config; no user impact for 24h |

---

### Migration Dependency Graph

```
Phase 0 Pre-Flight
    │
    ├── All hooks converted ──────────────────┐
    ├── All contexts converted ───────────────┤
    ├── All edge function equivalents ready ──┤
    ├── Data migration verified ──────────────┤
    ├── Cognito users provisioned ────────────┤
    ├── Infrastructure validated ─────────────┤
    │                                         │
    ▼                                         ▼
Phase 1 Environment Setup ──► Phase 2 Cutover ──► Phase 3 Rollback (if needed)
                                     │
                                     ▼
                              Phase 4 Hardening (48h later)
```

---

## Assumptions

- Application backend is API-driven (REST via NestJS)
- Infrastructure provisioning uses Terraform (platform) + CloudFormation (per-account)
- DynamoDB is the primary datastore using single-table design
- Application is multi-tenant by design with Account → Enterprise hierarchy
- All authentication happens exclusively in the Platform Admin AWS account
- Customer users created from the application count toward licensed user limits
- The frontend is a React SPA that communicates with the backend via REST API
