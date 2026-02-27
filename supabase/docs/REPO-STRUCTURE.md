# Repository Structure — 4-Component Architecture

This repository contains four independently deployable components that work together as a unified platform.

---

## Component Map

```
license-portal/
│
├── 📦 COMPONENT 1: FRONTEND (React/Vite SPA)
│   └── frontend/
│       ├── src/                      ← React components, hooks, contexts, pages
│       │   ├── components/           ← UI components (shadcn/ui + custom)
│       │   ├── contexts/             ← Auth, Account, Enterprise, Permission contexts
│       │   ├── hooks/                ← Data hooks (dual-mode: Supabase + NestJS)
│       │   ├── lib/api/              ← NestJS HTTP client & service layer
│       │   ├── lib/auth/             ← Cognito auth client
│       │   └── pages/                ← Route pages
│       └── public/                   ← Static assets
│
├── 📦 COMPONENT 2: BACKEND (NestJS on AWS Lambda)
│   └── backend/
│       ├── src/                      ← NestJS application code
│       ├── scripts/                  ← Operational scripts
│       └── package.json              ← Backend dependencies
│
├── 📦 COMPONENT 3: AWS INFRASTRUCTURE (Terraform IaC)
│   └── infra/
│       ├── control-plane/            ← Platform Admin account resources
│       │   ├── terraform/            ← Cognito, Lambda, API GW, S3, monitoring
│       │   └── bootstrap/            ← Bootstrap script
│       ├── data-plane/               ← Customer account resources
│       │   ├── terraform/            ← DynamoDB + cross-account IAM
│       │   └── bootstrap/            ← Bootstrap script
│       └── modules/                  ← Shared Terraform modules
│           ├── cognito/
│           ├── lambda/
│           ├── api-gateway/
│           ├── dynamodb/
│           ├── monitoring/
│           └── s3/
│
├── 📖 DOCUMENTATION
│   └── docs/                         ← Architecture, phase plans, guides
│
├── 🔄 CI/CD WORKFLOWS (7 workflows)
│   └── .github/workflows/
│       ├── 01-bootstrap-control-plane.yml
│       ├── 02-bootstrap-data-plane.yml
│       ├── 03-ci-pr-validation.yml
│       ├── 04-deploy-backend.yml
│       ├── 05-deploy-frontend.yml
│       ├── 06-verify-and-maintenance.yml
│       └── 07-rollback.yml
│
├── 🛠️ SCRIPTS
│   └── scripts/                      ← prechecks, assume-role, validate-bootstrap
│
├── ⚙️ ROOT CONFIG (shared by Vite/Tailwind/TypeScript)
│   ├── vite.config.ts                ← Points root to frontend/
│   ├── tailwind.config.ts            ← Scans frontend/src/**
│   ├── tsconfig*.json                ← Includes frontend/src
│   ├── postcss.config.js             ← PostCSS pipeline
│   ├── package.json                  ← NPM dependencies (read-only)
│   ├── index.html                    ← SPA entry point
│   └── components.json               ← shadcn/ui config
│
└── supabase/                         ← Lovable Cloud configuration
```

---

## Why config files stay at root

`package.json`, `vite.config.ts`, `tsconfig.json`, and `tailwind.config.ts` remain at the project root because:
- **Vite** resolves config from the working directory where `node_modules/` lives
- **TypeScript** project references require root-level tsconfig
- **Tailwind** and **PostCSS** are loaded by Vite from root
- All configs reference `frontend/src/` and `frontend/public/` via updated paths

---

## How Components Are Deployed

| Component | Deployed By | Deployed To | Trigger |
|-----------|-------------|-------------|---------|
| Frontend | `05-deploy-frontend.yml` | S3 + CloudFront | Push to `main` (frontend/ changes) |
| Backend | `04-deploy-backend.yml` | AWS Lambda | Push to `main` (backend/ changes) |
| Infrastructure | `01/02-bootstrap-*.yml` | AWS (Terraform) | Manual only |

---

## Key Commands

```bash
# Frontend (from repo root)
npm install && npx vite build         # Build frontend (outputs to dist/)

# Backend
cd backend
npm install && npm run build

# Infrastructure
cd infra/control-plane/terraform
terraform init && terraform plan

# CI/CD (via GitHub CLI)
gh workflow run "04 · Deploy Backend" --field environment=dev
gh workflow run "05 · Deploy Frontend" --field workspace=dev
gh workflow run "07 · Rollback" --field component=backend --field environment=dev --field confirmation=ROLLBACK
```
