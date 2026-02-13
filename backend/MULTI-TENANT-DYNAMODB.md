# Multi-Tenant DynamoDB Architecture

## Overview

This backend implements a multi-tenant DynamoDB architecture that provisions isolated or shared data storage based on the account's cloud type:

- **Public Cloud Accounts**: Use a shared multi-tenant DynamoDB table with PK/SK-based tenant isolation
- **Private Cloud Accounts**: Get a dedicated DynamoDB table provisioned via CloudFormation

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         Admin Platform (NestJS API)                         │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌──────────────────┐    ┌──────────────────┐    ┌───────────────────────┐ │
│  │ AccountsService  │───►│ DynamoDBRouter   │───►│ SSM Parameter Store   │ │
│  └──────────────────┘    │    Service       │    │ /accounts/{id}/...    │ │
│           │              └────────┬─────────┘    └───────────────────────┘ │
│           │                       │                                         │
│           ▼                       ▼                                         │
│  ┌──────────────────┐    ┌──────────────────────────────────────────────┐  │
│  │ AccountProvisioner│    │              Table Resolution                │  │
│  │     Service      │    │  ┌────────────────┐  ┌─────────────────────┐ │  │
│  └────────┬─────────┘    │  │ Public Account │  │  Private Account    │ │  │
│           │              │  │ → Shared Table │  │  → Dedicated Table  │ │  │
│           │              │  └────────────────┘  └─────────────────────┘ │  │
│           │              └──────────────────────────────────────────────┘  │
└───────────┼────────────────────────────────────────────────────────────────┘
            │
            ▼
┌───────────────────────────────────────────────────────────────────────────────┐
│                              AWS CloudFormation                               │
│  ┌─────────────────────────────────────────────────────────────────────────┐ │
│  │                    private-account-dynamodb.yaml                        │ │
│  │  • DynamoDB Table (full clone with 3 GSIs)                              │ │
│  │  • Auto-scaling for PROVISIONED mode                                    │ │
│  │  • SSM Parameters for service discovery                                 │ │
│  └─────────────────────────────────────────────────────────────────────────┘ │
└───────────────────────────────────────────────────────────────────────────────┘
            │
            ▼
┌───────────────────────────────────────────────────────────────────────────────┐
│                               DynamoDB Tables                                  │
│                                                                               │
│  ┌─────────────────────┐     ┌─────────────────────────────────────────────┐ │
│  │   Shared Table      │     │         Private Account Tables              │ │
│  │   (Multi-Tenant)    │     │                                             │ │
│  │                     │     │  ┌─────────────────┐ ┌─────────────────┐    │ │
│  │  PK: ACCOUNT#<id>   │     │  │ Account A Table │ │ Account B Table │    │ │
│  │  SK: METADATA/...   │     │  │ (Full Isolation)│ │ (Full Isolation)│    │ │
│  │                     │     │  └─────────────────┘ └─────────────────┘    │ │
│  │  All public accounts│     │                                             │ │
│  │  share this table   │     │  Each private account has its own table    │ │
│  └─────────────────────┘     └─────────────────────────────────────────────┘ │
└───────────────────────────────────────────────────────────────────────────────┘
```

## Cloud Types

### Public Cloud (`cloudType: 'public'`)

- Data stored in the shared multi-tenant DynamoDB table
- Tenant isolation enforced via composite keys (PK: `ACCOUNT#{accountId}`)
- Lower cost per account
- Suitable for most enterprise customers

### Private Cloud (`cloudType: 'private'`)

- Dedicated DynamoDB table provisioned via CloudFormation
- Complete data isolation at the infrastructure level
- Higher cost but maximum security and compliance
- Suitable for regulated industries or high-security requirements

## SSM Parameter Store Structure

Account configuration is stored in SSM for service discovery:

```
/accounts/{accountId}/
├── cloud-type              # 'public' or 'private'
├── provisioning-status     # 'pending', 'creating', 'active', 'failed', 'deleting'
├── provisioning-error      # Error message if status is 'failed'
└── dynamodb/
    ├── table-name          # DynamoDB table name
    ├── table-arn           # DynamoDB table ARN
    └── stream-arn          # DynamoDB stream ARN

/platform/
├── dynamodb/
│   ├── shared-table-name   # Name of the shared table
│   ├── shared-table-arn    # ARN of the shared table
│   └── default-billing-mode # Default billing mode for new private tables
└── cloudformation/
    ├── template-bucket     # S3 bucket containing CF templates
    └── private-account-template-key # S3 key for private account template
```

## API Usage

### Create Account

```typescript
POST /accounts
{
  "name": "ACME Corporation",
  "masterAccountName": "acme-master",
  "cloudType": "private",  // or "public"
  "addresses": [...],
  "technicalUser": {...},
  "licenses": [
    {
      "enterpriseId": "...",
      "productId": "...",
      "serviceId": "...",
      "startDate": "2024-01-01",
      "endDate": "2024-12-31",
      "contactFullName": "John Doe",
      "contactEmail": "john@acme.com"
    }
  ]
}
```

### Response

```json
{
  "id": "uuid",
  "name": "ACME Corporation",
  "cloudType": "private",
  "tableName": "app-prod-account-{uuid}",
  "provisioningStatus": "active",
  ...
}
```

## Provisioning Flow

### Public Account

1. Store account metadata in shared table with `PK: ACCOUNT#{id}`
2. Create SSM parameters for service discovery
3. Account is immediately available

### Private Account

1. Create CloudFormation stack from `private-account-dynamodb.yaml` template
2. Wait for stack creation to complete (~2-3 minutes)
3. Read outputs (table name, ARN) from stack
4. SSM parameters are auto-created by the CloudFormation template
5. Write initial data to both shared table (admin visibility) and dedicated table
6. Account is available once provisioning completes

## Key Services

### DynamoDBRouterService

Routes database operations to the correct table based on account:

```typescript
// Resolves table name from SSM cache
const tableName = await dynamoDbRouter.resolveTableName(accountId);

// Operations with account context
await dynamoDbRouter.put(accountId, { Item: {...} });
await dynamoDbRouter.query(accountId, {...});

// Admin operations (always use shared table)
await dynamoDbRouter.adminQuery({...});
```

### AccountProvisionerService

Handles infrastructure provisioning:

```typescript
// Provision new account
const result = await provisioner.provisionAccount({
  accountId: 'uuid',
  accountName: 'ACME Corp',
  cloudType: 'private',
});

// Check provisioning status
const status = await provisioner.getProvisioningStatus(accountId);

// Deprovision (delete CloudFormation stack and clean up SSM)
await provisioner.deprovisionAccount(accountId);
```

## Security Considerations

1. **IAM Policies**: The provisioner role has scoped permissions to only create resources with specific naming patterns
2. **SSM Access**: Lambda/ECS roles need `ssm:GetParameter*` permissions for `/accounts/*`
3. **CloudFormation**: Stacks are protected with deletion protection in production
4. **Encryption**: All tables use AWS KMS encryption at rest

## Terraform Configuration

Enable account provisioning in your environment:

```hcl
# terraform.tfvars
enable_account_provisioning         = true
account_provisioning_enable_alarms  = true
default_private_account_billing_mode = "PAY_PER_REQUEST"
```

## Troubleshooting

### Common Issues

1. **Stack creation timeout**: Check CloudWatch logs for CloudFormation events
2. **Table not found**: Verify SSM parameters exist and cache is not stale
3. **Permission denied**: Ensure provisioner role has correct IAM permissions

### Useful Commands

```bash
# Check SSM parameters for an account
aws ssm get-parameters-by-path --path "/accounts/{accountId}/" --recursive

# Describe CloudFormation stack
aws cloudformation describe-stacks --stack-name "app-prod-account-{uuid}"

# List all private account tables
aws dynamodb list-tables --query 'TableNames[?contains(@, `account-`)]'
```
