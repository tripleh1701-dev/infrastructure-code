# NestJS + DynamoDB Backend

This document provides the complete architecture and setup guide for building a NestJS backend with DynamoDB that matches your frontend API abstraction layer.

## Project Structure

```
nestjs-backend/
├── src/
│   ├── main.ts                          # Application entry point
│   ├── app.module.ts                    # Root module
│   ├── common/
│   │   ├── decorators/
│   │   │   └── api-response.decorator.ts
│   │   ├── dto/
│   │   │   └── api-response.dto.ts
│   │   ├── filters/
│   │   │   └── http-exception.filter.ts
│   │   ├── interceptors/
│   │   │   └── transform.interceptor.ts
│   │   └── dynamodb/
│   │       ├── dynamodb.module.ts
│   │       └── dynamodb.service.ts
│   ├── accounts/
│   │   ├── accounts.module.ts
│   │   ├── accounts.controller.ts
│   │   ├── accounts.service.ts
│   │   └── dto/
│   │       ├── create-account.dto.ts
│   │       └── update-account.dto.ts
│   ├── enterprises/
│   │   ├── enterprises.module.ts
│   │   ├── enterprises.controller.ts
│   │   ├── enterprises.service.ts
│   │   └── dto/
│   │       ├── create-enterprise.dto.ts
│   │       └── update-enterprise.dto.ts
│   ├── licenses/
│   │   ├── licenses.module.ts
│   │   ├── licenses.controller.ts
│   │   ├── licenses.service.ts
│   │   └── dto/
│   │       ├── create-license.dto.ts
│   │       └── update-license.dto.ts
│   ├── workstreams/
│   │   ├── workstreams.module.ts
│   │   ├── workstreams.controller.ts
│   │   ├── workstreams.service.ts
│   │   └── dto/
│   │       ├── create-workstream.dto.ts
│   │       └── update-workstream.dto.ts
│   ├── roles/
│   │   ├── roles.module.ts
│   │   ├── roles.controller.ts
│   │   ├── roles.service.ts
│   │   └── dto/
│   │       ├── create-role.dto.ts
│   │       └── update-role.dto.ts
│   ├── groups/
│   │   ├── groups.module.ts
│   │   ├── groups.controller.ts
│   │   ├── groups.service.ts
│   │   └── dto/
│   │       ├── create-group.dto.ts
│   │       └── update-group.dto.ts
│   ├── users/
│   │   ├── users.module.ts
│   │   ├── users.controller.ts
│   │   ├── users.service.ts
│   │   └── dto/
│   │       ├── create-user.dto.ts
│   │       └── update-user.dto.ts
│   ├── products/
│   │   ├── products.module.ts
│   │   ├── products.controller.ts
│   │   ├── products.service.ts
│   │   └── dto/
│   │       └── create-product.dto.ts
│   └── services/
│       ├── services.module.ts
│       ├── services.controller.ts
│       ├── services.service.ts
│       └── dto/
│           └── create-service.dto.ts
├── test/
│   └── ...
├── .env
├── .env.example
├── nest-cli.json
├── package.json
├── tsconfig.json
└── tsconfig.build.json
```

## Quick Start

### 1. Create NestJS Project

```bash
npm i -g @nestjs/cli
nest new nestjs-backend
cd nestjs-backend
```

### 2. Install Dependencies

```bash
# AWS SDK for DynamoDB
npm install @aws-sdk/client-dynamodb @aws-sdk/lib-dynamodb

# Validation
npm install class-validator class-transformer

# Configuration
npm install @nestjs/config

# UUID generation
npm install uuid
npm install -D @types/uuid

# CORS (for frontend integration)
npm install @nestjs/platform-express
```

### 3. Environment Variables

Create `.env` file:

```env
# AWS Configuration
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=your_access_key
AWS_SECRET_ACCESS_KEY=your_secret_key

# DynamoDB
DYNAMODB_TABLE_PREFIX=myapp_

# Application
PORT=3001
NODE_ENV=development
```

## DynamoDB Table Design

### Single-Table Design (Recommended)

For optimal performance, use a single-table design with composite keys:

| Table Name | Partition Key (PK) | Sort Key (SK) | Attributes |
|------------|-------------------|---------------|------------|
| `app_data` | `PK` (String)     | `SK` (String) | Entity-specific |

**Key Patterns:**

| Entity | PK | SK | Example |
|--------|----|----|---------|
| Account | `ACCOUNT#<id>` | `METADATA` | `PK=ACCOUNT#123, SK=METADATA` |
| Account Address | `ACCOUNT#<id>` | `ADDRESS#<id>` | `PK=ACCOUNT#123, SK=ADDRESS#456` |
| Enterprise | `ENTERPRISE#<id>` | `METADATA` | `PK=ENTERPRISE#789, SK=METADATA` |
| License | `ACCOUNT#<id>` | `LICENSE#<id>` | `PK=ACCOUNT#123, SK=LICENSE#abc` |
| Workstream | `ACCOUNT#<id>` | `WORKSTREAM#<id>` | `PK=ACCOUNT#123, SK=WORKSTREAM#def` |
| Role | `ROLE#<id>` | `METADATA` | `PK=ROLE#ghi, SK=METADATA` |
| Role Permission | `ROLE#<id>` | `PERMISSION#<key>` | `PK=ROLE#ghi, SK=PERMISSION#dashboard` |
| Group | `GROUP#<id>` | `METADATA` | `PK=GROUP#jkl, SK=METADATA` |
| User | `USER#<id>` | `METADATA` | `PK=USER#mno, SK=METADATA` |
| User Workstream | `USER#<id>` | `WORKSTREAM#<id>` | `PK=USER#mno, SK=WORKSTREAM#pqr` |
| Product | `PRODUCT#<id>` | `METADATA` | `PK=PRODUCT#stu, SK=METADATA` |
| Service | `SERVICE#<id>` | `METADATA` | `PK=SERVICE#vwx, SK=METADATA` |

**Global Secondary Indexes (GSIs):**

| GSI Name | Partition Key | Sort Key | Purpose |
|----------|--------------|----------|---------|
| `GSI1` | `GSI1PK` | `GSI1SK` | Query by entity type |
| `GSI2` | `GSI2PK` | `GSI2SK` | Query by account/enterprise |
| `GSI3` | `GSI3PK` | `GSI3SK` | Query by status/date |

### Create DynamoDB Table (AWS CLI)

```bash
aws dynamodb create-table \
  --table-name app_data \
  --attribute-definitions \
    AttributeName=PK,AttributeType=S \
    AttributeName=SK,AttributeType=S \
    AttributeName=GSI1PK,AttributeType=S \
    AttributeName=GSI1SK,AttributeType=S \
    AttributeName=GSI2PK,AttributeType=S \
    AttributeName=GSI2SK,AttributeType=S \
  --key-schema \
    AttributeName=PK,KeyType=HASH \
    AttributeName=SK,KeyType=RANGE \
  --global-secondary-indexes \
    "[
      {
        \"IndexName\": \"GSI1\",
        \"KeySchema\": [{\"AttributeName\":\"GSI1PK\",\"KeyType\":\"HASH\"},{\"AttributeName\":\"GSI1SK\",\"KeyType\":\"RANGE\"}],
        \"Projection\": {\"ProjectionType\":\"ALL\"}
      },
      {
        \"IndexName\": \"GSI2\",
        \"KeySchema\": [{\"AttributeName\":\"GSI2PK\",\"KeyType\":\"HASH\"},{\"AttributeName\":\"GSI2SK\",\"KeyType\":\"RANGE\"}],
        \"Projection\": {\"ProjectionType\":\"ALL\"}
      }
    ]" \
  --billing-mode PAY_PER_REQUEST \
  --region us-east-1
```

## API Endpoints

All endpoints return responses in this format:

```typescript
// Success
{ "data": T, "error": null }

// Error
{ "data": null, "error": { "message": string, "code": string } }
```

### Accounts

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/accounts` | List all accounts |
| GET | `/api/accounts/:id` | Get account by ID |
| POST | `/api/accounts` | Create account |
| PUT | `/api/accounts/:id` | Update account |
| DELETE | `/api/accounts/:id` | Delete account |

### Enterprises

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/enterprises` | List all enterprises |
| GET | `/api/enterprises/:id` | Get enterprise by ID |
| POST | `/api/enterprises` | Create enterprise |
| PUT | `/api/enterprises/:id` | Update enterprise |
| DELETE | `/api/enterprises/:id` | Delete enterprise |

### Licenses

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/licenses?accountId=&enterpriseId=` | List licenses (filtered) |
| GET | `/api/licenses/:id` | Get license by ID |
| POST | `/api/licenses` | Create license |
| PUT | `/api/licenses/:id` | Update license |
| DELETE | `/api/licenses/:id` | Delete license |

### Workstreams

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/workstreams?accountId=&enterpriseId=` | List workstreams (filtered) |
| GET | `/api/workstreams/:id` | Get workstream by ID |
| POST | `/api/workstreams` | Create workstream |
| PUT | `/api/workstreams/:id` | Update workstream |
| DELETE | `/api/workstreams/:id` | Delete workstream |

### Roles

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/roles` | List all roles |
| GET | `/api/roles/:id` | Get role by ID |
| POST | `/api/roles` | Create role |
| PUT | `/api/roles/:id` | Update role |
| DELETE | `/api/roles/:id` | Delete role |
| GET | `/api/roles/:id/permissions` | Get role permissions |
| PUT | `/api/roles/:id/permissions` | Update role permissions |

### Groups

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/groups` | List all groups |
| GET | `/api/groups/:id` | Get group by ID |
| POST | `/api/groups` | Create group |
| PUT | `/api/groups/:id` | Update group |
| DELETE | `/api/groups/:id` | Delete group |

### Users

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/users?accountId=` | List users (filtered) |
| GET | `/api/users/:id` | Get user by ID |
| POST | `/api/users` | Create user |
| PUT | `/api/users/:id` | Update user |
| DELETE | `/api/users/:id` | Delete user |
| GET | `/api/users/:id/workstreams` | Get user workstreams |
| PUT | `/api/users/:id/workstreams` | Update user workstreams |

### Products & Services

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/products` | List all products |
| POST | `/api/products` | Create product |
| GET | `/api/services` | List all services |
| POST | `/api/services` | Create service |

## Frontend Integration

Once your NestJS backend is deployed, update your frontend `.env`:

```env
VITE_API_PROVIDER=external
VITE_EXTERNAL_API_URL=https://your-api-gateway-url.amazonaws.com
```

The existing API abstraction layer will automatically route requests to your NestJS backend.

## Deployment Options

### AWS Lambda + API Gateway (Serverless)

```bash
npm install @vendia/serverless-express aws-lambda
npm install -D @types/aws-lambda serverless-offline
```

### AWS ECS/Fargate (Container)

Create `Dockerfile`:

```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY dist ./dist
EXPOSE 3001
CMD ["node", "dist/main"]
```

### AWS Elastic Beanstalk

Deploy directly with `eb init` and `eb deploy`.

## Authentication Integration

For authentication, you have options:

1. **AWS Cognito** - Native AWS authentication
2. **Custom JWT** - Implement your own JWT-based auth
3. **Proxy Supabase Auth** - Keep using Supabase Auth, validate tokens in NestJS

See `src/common/guards/` for authentication guard examples.
