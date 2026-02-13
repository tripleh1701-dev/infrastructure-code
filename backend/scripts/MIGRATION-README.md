# Data Migration Guide

This guide covers migrating data from Supabase to DynamoDB.

## Migration Options

1. **Full Migration Script** (`migrate-from-supabase.ts`) - Reads live data from Supabase and writes to DynamoDB
2. **Seed Script** (`seed-sample-data.ts`) - Populates DynamoDB with sample test data

## Prerequisites

```bash
npm install @aws-sdk/client-dynamodb @aws-sdk/lib-dynamodb @supabase/supabase-js uuid
```

## Environment Variables

Create a `.env.migration` file:

```env
# Supabase (source)
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# AWS DynamoDB (target)
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=your-access-key
AWS_SECRET_ACCESS_KEY=your-secret-key
DYNAMODB_TABLE_NAME=app_data
```

## Running the Migration

```bash
# Install ts-node if not present
npm install -D ts-node

# Run full migration from Supabase
npx ts-node scripts/migrate-from-supabase.ts

# Or run seed with sample data only
npx ts-node scripts/seed-sample-data.ts
```

## Data Transformation

The migration transforms Supabase's relational model to DynamoDB's single-table design:

| Supabase Table | DynamoDB Key Pattern |
|----------------|---------------------|
| accounts | `PK: ACCOUNT#<id>, SK: METADATA` |
| account_addresses | `PK: ACCOUNT#<account_id>, SK: ADDRESS#<id>` |
| account_technical_users | `PK: ACCOUNT#<account_id>, SK: TECH_USER#<id>` |
| account_licenses | `PK: ACCOUNT#<account_id>, SK: LICENSE#<id>` |
| enterprises | `PK: ENTERPRISE#<id>, SK: METADATA` |
| enterprise_products | `PK: ENTERPRISE#<id>, SK: PRODUCT#<product_id>` |
| enterprise_services | `PK: ENTERPRISE#<id>, SK: SERVICE#<service_id>` |
| workstreams | `PK: ACCOUNT#<account_id>, SK: WORKSTREAM#<id>` |
| workstream_tools | `PK: WORKSTREAM#<id>, SK: TOOL#<id>` |
| users (technical_users) | `PK: USER#<id>, SK: METADATA` |
| user_workstreams | `PK: USER#<id>, SK: WORKSTREAM#<workstream_id>` |
| roles | `PK: ROLE#<id>, SK: METADATA` |
| role_permissions | `PK: ROLE#<id>, SK: PERMISSION#<menu_key>` |
| groups | `PK: GROUP#<id>, SK: METADATA` |
| products | `PK: PRODUCT#<id>, SK: METADATA` |
| services | `PK: SERVICE#<id>, SK: METADATA` |
