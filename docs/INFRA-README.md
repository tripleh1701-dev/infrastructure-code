# License Portal - Multi-Account AWS SaaS Platform

## Architecture

Two-account AWS architecture with strict separation of concerns:

```
┌─────────────────────────────────────────────────────────────────┐
│              PLATFORM ADMIN ACCOUNT (Control Plane)             │
│                                                                 │
│  ┌──────────┐  ┌────────────┐  ┌──────────┐  ┌─────────────┐  │
│  │ Cognito  │  │API Gateway │──│  Lambda   │──│  DynamoDB   │  │
│  │ User Pool│  │  (REST)    │  │ (NestJS)  │  │ (Config)    │  │
│  └──────────┘  └────────────┘  └────┬──────┘  └─────────────┘  │
│                                      │                          │
│  ┌──────────┐  ┌────────────┐  ┌────┴──────┐  ┌─────────────┐  │
│  │ S3 + CF  │  │   SSM      │  │ CloudWatch│  │   SNS       │  │
│  │(Frontend)│  │ Parameters │  │ 8 Alarms  │  │  (Alerts)   │  │
│  └──────────┘  └────────────┘  └───────────┘  └─────────────┘  │
└────────────────────────────┬────────────────────────────────────┘
                             │ STS AssumeRole
┌────────────────────────────┴────────────────────────────────────┐
│                CUSTOMER ACCOUNT (Data Plane)                    │
│                                                                 │
│  ┌──────────────────┐  ┌──────────────────────────────────────┐ │
│  │    IAM Role       │  │        DynamoDB                     │ │
│  │ (Cross-Account)   │  │    (Customer Data)                  │ │
│  │ Least-Privilege   │  │   Tenant-Isolated Schema            │ │
│  └──────────────────┘  └──────────────────────────────────────┘ │
│                                                                 │
│  NO compute · NO APIs · NO auth · NO frontend                   │
└─────────────────────────────────────────────────────────────────┘
```

## Repository Structure

```
/
├── infra/
│   ├── control-plane/
│   │   ├── terraform/        # All control-plane resources
│   │   └── bootstrap/        # Bootstrap script
│   ├── data-plane/
│   │   ├── terraform/        # DynamoDB + IAM role only
│   │   └── bootstrap/        # Bootstrap script
│   └── modules/
│       ├── cognito/          # User pool + client
│       ├── lambda/           # NestJS Lambda function
│       ├── api-gateway/      # REST API + Cognito auth
│       ├── dynamodb/         # Single-table design
│       ├── monitoring/       # 8 CloudWatch alarms + SNS
│       └── s3/               # S3 + CloudFront hosting
│
├── backend/                  # NestJS application (Lambda target)
├── frontend/                 # React SPA (S3 target)
│
├── .github/workflows/
│   ├── bootstrap-control-plane.yml
│   ├── bootstrap-data-plane.yml
│   ├── deploy-backend.yml
│   └── deploy-frontend.yml
│
├── scripts/
│   ├── prechecks.sh          # Pre-flight validation
│   ├── assume-role.sh        # Cross-account role assumption
│   └── validate-bootstrap.sh # Cross-account access validation
│
├── docs/                     # Project documentation
├── BOOTSTRAP-EXECUTION.md    # Step-by-step bootstrap guide
└── README.md
```

## Quick Start

### 1. Bootstrap Control Plane
```bash
bash infra/control-plane/bootstrap/bootstrap.sh
```

### 2. Bootstrap Data Plane
```bash
bash infra/data-plane/bootstrap/bootstrap.sh
```

### 3. Deploy Backend
```bash
# Or trigger via GitHub Actions
cd backend && npm ci && npm run build
```

### 4. Deploy Frontend
```bash
# Or trigger via GitHub Actions
npm ci && npm run build
```

See [BOOTSTRAP-EXECUTION.md](./BOOTSTRAP-EXECUTION.md) for the complete guide.

## Technology Stack

| Component | Technology |
|-----------|------------|
| Frontend | React, Vite, TypeScript, Tailwind CSS, shadcn/ui |
| Backend | NestJS, TypeScript |
| Compute | AWS Lambda |
| API | API Gateway (REST) |
| Auth | Amazon Cognito |
| Database | Amazon DynamoDB (single-table design) |
| Frontend Hosting | S3 + CloudFront |
| IaC | Terraform |
| CI/CD | GitHub Actions |
| Monitoring | CloudWatch + SNS |

## Development

```bash
# Frontend (local dev)
npm install
npm run dev

# Backend (local dev)
cd backend
npm install
npm run start:dev
```
