# DynamoDB Single-Table Design for Multi-Tenant Platform

This document provides a detailed breakdown of the DynamoDB table design optimized for the hierarchical multi-tenant architecture (Account > Enterprise > Workstream/License/User).

## Design Philosophy

We use a **single-table design** with composite keys and Global Secondary Indexes (GSIs) to:
- Minimize read/write costs
- Enable efficient queries across access patterns
- Support the hierarchical tenant model
- Allow for flexible querying without table joins

---

## Table Schema

### Primary Table: `app_data`

| Attribute | Type | Description |
|-----------|------|-------------|
| `PK` | String | Partition Key - Entity identifier |
| `SK` | String | Sort Key - Relationship/metadata identifier |
| `GSI1PK` | String | GSI1 Partition Key - Entity type grouping |
| `GSI1SK` | String | GSI1 Sort Key - Entity identifier |
| `GSI2PK` | String | GSI2 Partition Key - Parent entity grouping |
| `GSI2SK` | String | GSI2 Sort Key - Child entity identifier |
| `GSI3PK` | String | GSI3 Partition Key - Status/date queries |
| `GSI3SK` | String | GSI3 Sort Key - Timestamp |

---

## Key Patterns by Entity

### 1. Accounts

```
PK: ACCOUNT#<account_id>
SK: METADATA
GSI1PK: ENTITY#ACCOUNT
GSI1SK: ACCOUNT#<account_id>
```

**Related Items (same PK, different SK):**
```
PK: ACCOUNT#<account_id>, SK: ADDRESS#<address_id>      → Account Address
PK: ACCOUNT#<account_id>, SK: TECH_USER#<user_id>       → Technical User
PK: ACCOUNT#<account_id>, SK: LICENSE#<license_id>      → License
PK: ACCOUNT#<account_id>, SK: WORKSTREAM#<workstream_id>→ Workstream
```

### 2. Enterprises

```
PK: ENTERPRISE#<enterprise_id>
SK: METADATA
GSI1PK: ENTITY#ENTERPRISE
GSI1SK: ENTERPRISE#<enterprise_id>
```

**Related Items:**
```
PK: ENTERPRISE#<enterprise_id>, SK: PRODUCT#<product_id>  → Enterprise Product
PK: ENTERPRISE#<enterprise_id>, SK: SERVICE#<service_id>  → Enterprise Service
```

### 3. Licenses

```
PK: ACCOUNT#<account_id>
SK: LICENSE#<license_id>
GSI1PK: ENTITY#LICENSE
GSI1SK: LICENSE#<license_id>
GSI2PK: ENTERPRISE#<enterprise_id>
GSI2SK: LICENSE#<license_id>
GSI3PK: LICENSE#STATUS#<active|expired>
GSI3SK: <end_date>#<license_id>
```

### 4. Workstreams

```
PK: ACCOUNT#<account_id>
SK: WORKSTREAM#<workstream_id>
GSI1PK: ENTITY#WORKSTREAM
GSI1SK: WORKSTREAM#<workstream_id>
GSI2PK: ENTERPRISE#<enterprise_id>
GSI2SK: WORKSTREAM#<workstream_id>
```

**Workstream Tools:**
```
PK: WORKSTREAM#<workstream_id>
SK: TOOL#<tool_id>
```

### 5. Users

```
PK: USER#<user_id>
SK: METADATA
GSI1PK: ENTITY#USER
GSI1SK: USER#<user_id>
GSI2PK: ACCOUNT#<account_id>#USERS
GSI2SK: USER#<user_id>
GSI3PK: USER#STATUS#<active|inactive>
GSI3SK: <end_date>#<user_id>
```

**User Workstreams:**
```
PK: USER#<user_id>
SK: WORKSTREAM#<workstream_id>
```

### 6. Roles

```
PK: ROLE#<role_id>
SK: METADATA
GSI1PK: ENTITY#ROLE
GSI1SK: ROLE#<role_id>
GSI2PK: ACCOUNT#<account_id>#ROLES (if scoped to account)
GSI2SK: ROLE#<role_id>
```

**Role Permissions:**
```
PK: ROLE#<role_id>
SK: PERMISSION#<menu_key>
```

### 7. Groups

```
PK: GROUP#<group_id>
SK: METADATA
GSI1PK: ENTITY#GROUP
GSI1SK: GROUP#<group_id>
```

### 8. Products & Services

```
PK: PRODUCT#<product_id>
SK: METADATA
GSI1PK: ENTITY#PRODUCT
GSI1SK: PRODUCT#<product_id>

PK: SERVICE#<service_id>
SK: METADATA
GSI1PK: ENTITY#SERVICE
GSI1SK: SERVICE#<service_id>
```

### 9. Notification Audit Log

```
PK: NOTIFICATION_AUDIT#<audit_id>
SK: METADATA
GSI1PK: ENTITY#NOTIFICATION_AUDIT
GSI1SK: NOTIFICATION_AUDIT#<audit_id>
GSI2PK: ACCOUNT#<account_id>#NOTIFICATIONS
GSI2SK: <sentAt>#<audit_id>
GSI3PK: NOTIFICATION#STATUS#<sent|failed|skipped>
GSI3SK: <sentAt>#<audit_id>
```

**Stored Attributes:**
```
id, notificationType, recipientEmail, recipientFirstName, recipientLastName,
accountId, accountName, userId, deliveryStatus, sesMessageId, errorMessage,
skipReason, senderEmail, subject, sentAt, createdAt, metadata
```

---

## Global Secondary Indexes

### GSI1: Entity Type Index
**Purpose**: Query all items of a specific entity type

| GSI1PK | GSI1SK | Use Case |
|--------|--------|----------|
| `ENTITY#ACCOUNT` | `ACCOUNT#<id>` | Get all accounts |
| `ENTITY#ENTERPRISE` | `ENTERPRISE#<id>` | Get all enterprises |
| `ENTITY#LICENSE` | `LICENSE#<id>` | Get all licenses |
| `ENTITY#WORKSTREAM` | `WORKSTREAM#<id>` | Get all workstreams |
| `ENTITY#USER` | `USER#<id>` | Get all users |
| `ENTITY#ROLE` | `ROLE#<id>` | Get all roles |
| `ENTITY#GROUP` | `GROUP#<id>` | Get all groups |
| `ENTITY#PRODUCT` | `PRODUCT#<id>` | Get all products |
| `ENTITY#SERVICE` | `SERVICE#<id>` | Get all services |
| `ENTITY#NOTIFICATION_AUDIT` | `NOTIFICATION_AUDIT#<id>` | Get all notification audit entries |

### GSI2: Parent Entity Index
**Purpose**: Query items by parent entity (tenant filtering)

| GSI2PK | GSI2SK | Use Case |
|--------|--------|----------|
| `ACCOUNT#<id>#USERS` | `USER#<id>` | Users in an account |
| `ACCOUNT#<id>#ROLES` | `ROLE#<id>` | Roles scoped to account |
| `ENTERPRISE#<id>` | `LICENSE#<id>` | Licenses for enterprise |
| `ENTERPRISE#<id>` | `WORKSTREAM#<id>` | Workstreams for enterprise |
| `ACCOUNT#<id>#NOTIFICATIONS` | `<sentAt>#<id>` | Notification audit by account |

### GSI3: Status/Date Index
**Purpose**: Query by status with date-based sorting (expiring licenses, inactive users)

| GSI3PK | GSI3SK | Use Case |
|--------|--------|----------|
| `LICENSE#STATUS#active` | `<end_date>#<id>` | Active licenses by expiry |
| `LICENSE#STATUS#expired` | `<end_date>#<id>` | Expired licenses |
| `USER#STATUS#active` | `<end_date>#<id>` | Active users by end date |
| `USER#STATUS#inactive` | `<end_date>#<id>` | Inactive users |
| `NOTIFICATION#STATUS#sent` | `<sentAt>#<id>` | Sent notifications by date |
| `NOTIFICATION#STATUS#failed` | `<sentAt>#<id>` | Failed notifications by date |
| `NOTIFICATION#STATUS#skipped` | `<sentAt>#<id>` | Skipped notifications by date |

---

## Query Patterns

### Pattern 1: Get All Accounts
```typescript
// GSI1 Query
const params = {
  IndexName: 'GSI1',
  KeyConditionExpression: 'GSI1PK = :pk',
  ExpressionAttributeValues: { ':pk': 'ENTITY#ACCOUNT' }
};
```

### Pattern 2: Get Account with All Related Data
```typescript
// Single query gets account + addresses + technical users + licenses
const params = {
  KeyConditionExpression: 'PK = :pk',
  ExpressionAttributeValues: { ':pk': `ACCOUNT#${accountId}` }
};

// Results:
// SK = METADATA        → Account data
// SK = ADDRESS#xxx     → Address 1
// SK = ADDRESS#yyy     → Address 2
// SK = TECH_USER#zzz   → Technical user
// SK = LICENSE#aaa     → License 1
// SK = WORKSTREAM#bbb  → Workstream 1
```

### Pattern 3: Get Users by Account (Tenant Filtering)
```typescript
// GSI2 Query - Critical for multi-tenant isolation
const params = {
  IndexName: 'GSI2',
  KeyConditionExpression: 'GSI2PK = :pk',
  ExpressionAttributeValues: { ':pk': `ACCOUNT#${accountId}#USERS` }
};
```

### Pattern 4: Get Licenses by Enterprise
```typescript
const params = {
  IndexName: 'GSI2',
  KeyConditionExpression: 'GSI2PK = :pk AND begins_with(GSI2SK, :sk)',
  ExpressionAttributeValues: {
    ':pk': `ENTERPRISE#${enterpriseId}`,
    ':sk': 'LICENSE#'
  }
};
```

### Pattern 5: Get Expiring Licenses (Sorted by End Date)
```typescript
// GSI3 Query - Get active licenses sorted by expiry date
const thirtyDaysFromNow = new Date();
thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);

const params = {
  IndexName: 'GSI3',
  KeyConditionExpression: 'GSI3PK = :pk AND GSI3SK <= :date',
  ExpressionAttributeValues: {
    ':pk': 'LICENSE#STATUS#active',
    ':date': thirtyDaysFromNow.toISOString()
  }
};
```

### Pattern 6: Get Role with All Permissions
```typescript
const params = {
  KeyConditionExpression: 'PK = :pk',
  ExpressionAttributeValues: { ':pk': `ROLE#${roleId}` }
};

// Results:
// SK = METADATA          → Role data
// SK = PERMISSION#dashboard → Dashboard permission
// SK = PERMISSION#users     → Users permission
// SK = PERMISSION#settings  → Settings permission
```

### Pattern 7: Get User with Workstreams
```typescript
const params = {
  KeyConditionExpression: 'PK = :pk',
  ExpressionAttributeValues: { ':pk': `USER#${userId}` }
};

// Results:
// SK = METADATA          → User data
// SK = WORKSTREAM#xxx    → Workstream assignment 1
// SK = WORKSTREAM#yyy    → Workstream assignment 2
```

### Pattern 8: Get Enterprise with Products and Services
```typescript
const params = {
  KeyConditionExpression: 'PK = :pk',
  ExpressionAttributeValues: { ':pk': `ENTERPRISE#${enterpriseId}` }
};

// Results:
// SK = METADATA        → Enterprise data
// SK = PRODUCT#xxx     → Product assignment 1
// SK = SERVICE#yyy     → Service assignment 1
```

---

## Visual Schema Diagram

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           DynamoDB Table: app_data                       │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  ┌─────────────────┐      ┌──────────────────┐                          │
│  │    ACCOUNTS     │      │   ENTERPRISES    │                          │
│  │  PK: ACCOUNT#id │      │ PK: ENTERPRISE#id│                          │
│  │  SK: METADATA   │      │ SK: METADATA     │                          │
│  └────────┬────────┘      └────────┬─────────┘                          │
│           │                        │                                     │
│           │ (same PK)              │ (same PK)                          │
│           ▼                        ▼                                     │
│  ┌─────────────────┐      ┌──────────────────┐                          │
│  │ SK: ADDRESS#id  │      │ SK: PRODUCT#id   │                          │
│  │ SK: TECH_USER#id│      │ SK: SERVICE#id   │                          │
│  │ SK: LICENSE#id  │      └──────────────────┘                          │
│  │ SK: WORKSTREAM# │                                                     │
│  └─────────────────┘                                                     │
│                                                                          │
│  ┌─────────────────┐      ┌──────────────────┐      ┌────────────────┐  │
│  │     USERS       │      │      ROLES       │      │    GROUPS      │  │
│  │  PK: USER#id    │      │  PK: ROLE#id     │      │  PK: GROUP#id  │  │
│  │  SK: METADATA   │      │  SK: METADATA    │      │  SK: METADATA  │  │
│  │  SK: WORKSTREAM#│      │  SK: PERMISSION# │      └────────────────┘  │
│  └─────────────────┘      └──────────────────┘                          │
│                                                                          │
│  ┌─────────────────┐      ┌──────────────────┐                          │
│  │    PRODUCTS     │      │    SERVICES      │                          │
│  │ PK: PRODUCT#id  │      │ PK: SERVICE#id   │                          │
│  │ SK: METADATA    │      │ SK: METADATA     │                          │
│  └─────────────────┘      └──────────────────┘                          │
│                                                                          │
├─────────────────────────────────────────────────────────────────────────┤
│                          Global Secondary Indexes                        │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  GSI1: Entity Type Index                                                │
│  ┌──────────────────────────────────────────────────────────────────┐   │
│  │ GSI1PK: ENTITY#<type>  │  GSI1SK: <TYPE>#<id>                    │   │
│  │ Example: ENTITY#USER   │  USER#abc123                            │   │
│  │ → Query all users, all accounts, all licenses, etc.              │   │
│  └──────────────────────────────────────────────────────────────────┘   │
│                                                                          │
│  GSI2: Parent/Tenant Index                                              │
│  ┌──────────────────────────────────────────────────────────────────┐   │
│  │ GSI2PK: ACCOUNT#<id>#USERS  │  GSI2SK: USER#<id>                 │   │
│  │ GSI2PK: ENTERPRISE#<id>     │  GSI2SK: LICENSE#<id>              │   │
│  │ → Query by parent for tenant filtering                           │   │
│  └──────────────────────────────────────────────────────────────────┘   │
│                                                                          │
│  GSI3: Status/Date Index                                                │
│  ┌──────────────────────────────────────────────────────────────────┐   │
│  │ GSI3PK: LICENSE#STATUS#active  │  GSI3SK: 2025-03-15#<id>        │   │
│  │ GSI3PK: USER#STATUS#inactive   │  GSI3SK: 2025-01-01#<id>        │   │
│  │ → Query by status with date sorting                              │   │
│  └──────────────────────────────────────────────────────────────────┘   │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Access Pattern Summary

| Access Pattern | Index | Key Condition |
|----------------|-------|---------------|
| Get all accounts | GSI1 | `GSI1PK = ENTITY#ACCOUNT` |
| Get all enterprises | GSI1 | `GSI1PK = ENTITY#ENTERPRISE` |
| Get account + addresses + tech user | Table | `PK = ACCOUNT#<id>` |
| Get enterprise + products/services | Table | `PK = ENTERPRISE#<id>` |
| Get users by account | GSI2 | `GSI2PK = ACCOUNT#<id>#USERS` |
| Get licenses by account | Table | `PK = ACCOUNT#<id>` + `begins_with(SK, LICENSE#)` |
| Get licenses by enterprise | GSI2 | `GSI2PK = ENTERPRISE#<id>` + `begins_with(SK, LICENSE#)` |
| Get workstreams by account | Table | `PK = ACCOUNT#<id>` + `begins_with(SK, WORKSTREAM#)` |
| Get workstreams by enterprise | GSI2 | `GSI2PK = ENTERPRISE#<id>` + `begins_with(SK, WORKSTREAM#)` |
| Get role + permissions | Table | `PK = ROLE#<id>` |
| Get user + workstream assignments | Table | `PK = USER#<id>` |
| Get expiring licenses | GSI3 | `GSI3PK = LICENSE#STATUS#active` + `GSI3SK <= <date>` |
| Get inactive users | GSI3 | `GSI3PK = USER#STATUS#inactive` |
| Get all notification audits | GSI1 | `GSI1PK = ENTITY#NOTIFICATION_AUDIT` |
| Get notifications by account | GSI2 | `GSI2PK = ACCOUNT#<id>#NOTIFICATIONS` |
| Get failed notifications | GSI3 | `GSI3PK = NOTIFICATION#STATUS#failed` |
| Get sent notifications by date range | GSI3 | `GSI3PK = NOTIFICATION#STATUS#sent` + `GSI3SK BETWEEN <start> AND <end>` |

---

## CloudFormation Template

```yaml
AWSTemplateFormatVersion: '2010-09-09'
Description: DynamoDB table for multi-tenant platform

Resources:
  AppDataTable:
    Type: AWS::DynamoDB::Table
    Properties:
      TableName: app_data
      BillingMode: PAY_PER_REQUEST
      
      AttributeDefinitions:
        - AttributeName: PK
          AttributeType: S
        - AttributeName: SK
          AttributeType: S
        - AttributeName: GSI1PK
          AttributeType: S
        - AttributeName: GSI1SK
          AttributeType: S
        - AttributeName: GSI2PK
          AttributeType: S
        - AttributeName: GSI2SK
          AttributeType: S
        - AttributeName: GSI3PK
          AttributeType: S
        - AttributeName: GSI3SK
          AttributeType: S
      
      KeySchema:
        - AttributeName: PK
          KeyType: HASH
        - AttributeName: SK
          KeyType: RANGE
      
      GlobalSecondaryIndexes:
        - IndexName: GSI1
          KeySchema:
            - AttributeName: GSI1PK
              KeyType: HASH
            - AttributeName: GSI1SK
              KeyType: RANGE
          Projection:
            ProjectionType: ALL
        
        - IndexName: GSI2
          KeySchema:
            - AttributeName: GSI2PK
              KeyType: HASH
            - AttributeName: GSI2SK
              KeyType: RANGE
          Projection:
            ProjectionType: ALL
        
        - IndexName: GSI3
          KeySchema:
            - AttributeName: GSI3PK
              KeyType: HASH
            - AttributeName: GSI3SK
              KeyType: RANGE
          Projection:
            ProjectionType: ALL
      
      Tags:
        - Key: Environment
          Value: production
        - Key: Application
          Value: multi-tenant-platform

Outputs:
  TableName:
    Description: DynamoDB table name
    Value: !Ref AppDataTable
  TableArn:
    Description: DynamoDB table ARN
    Value: !GetAtt AppDataTable.Arn
```

---

## Best Practices

1. **Consistent Key Prefixes**: Always use consistent prefixes (`ACCOUNT#`, `USER#`, etc.) for easy filtering
2. **Composite Sort Keys**: Combine entity type + ID in SK for efficient range queries
3. **Sparse Indexes**: Only add GSI attributes when needed (saves storage)
4. **Overloaded Keys**: GSI keys serve multiple purposes based on entity type
5. **Avoid Scans**: Design ensures all queries use indexes, never full table scans
6. **Tenant Isolation**: GSI2 ensures efficient tenant-scoped queries for multi-tenancy
