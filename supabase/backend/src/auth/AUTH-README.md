# AWS Cognito Authentication Integration

This module provides JWT-based authentication using AWS Cognito for the NestJS backend.

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────┐
│                      Authentication Flow                                 │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  ┌──────────┐    ┌──────────────┐    ┌──────────────┐    ┌───────────┐ │
│  │  Client  │───▶│ API Gateway  │───▶│ JWT Guard    │───▶│ Controller│ │
│  │          │    │              │    │ (Validate)   │    │           │ │
│  └──────────┘    └──────────────┘    └──────┬───────┘    └───────────┘ │
│                                             │                           │
│                                             ▼                           │
│                                    ┌──────────────┐                     │
│                                    │   Cognito    │                     │
│                                    │   JWKS       │                     │
│                                    │  (Cached)    │                     │
│                                    └──────────────┘                     │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

## Features

- **JWT Validation**: Validates tokens against Cognito JWKS
- **JWKS Caching**: Caches public keys to minimize network calls
- **Role-Based Access Control**: Custom guards for role-based authorization
- **Tenant Isolation**: Extracts tenant context from token claims
- **Decorator-Based Auth**: Easy-to-use decorators for protected routes

## Configuration

### Environment Variables

```env
# AWS Cognito Configuration
COGNITO_USER_POOL_ID=us-east-1_xxxxxxxxx
COGNITO_CLIENT_ID=xxxxxxxxxxxxxxxxxxxxxxxxxx
COGNITO_REGION=us-east-1

# Optional: Custom domain
COGNITO_DOMAIN=your-domain.auth.us-east-1.amazoncognito.com
```

### Cognito User Pool Setup

1. **Create User Pool** in AWS Console or via Terraform
2. **Configure App Client** with appropriate OAuth flows
3. **Add Custom Attributes** for multi-tenancy:
   - `custom:account_id` - Account identifier
   - `custom:enterprise_id` - Enterprise identifier
   - `custom:role` - User role

## Usage

### Protecting Routes

```typescript
import { Controller, Get, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

@Controller('accounts')
@UseGuards(JwtAuthGuard)
export class AccountsController {
  @Get()
  findAll(@CurrentUser() user: CognitoUser) {
    // user contains decoded token claims
    return this.accountsService.findAll(user.accountId);
  }

  @Get('admin')
  @UseGuards(RolesGuard)
  @Roles('admin')
  adminOnly() {
    return { message: 'Admin access granted' };
  }
}
```

### Public Routes

```typescript
import { Public } from '../auth/decorators/public.decorator';

@Controller('health')
export class HealthController {
  @Get()
  @Public()
  check() {
    return { status: 'ok' };
  }
}
```

### Extracting User Context

```typescript
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { CognitoUser } from '../auth/interfaces/cognito-user.interface';

@Get('profile')
getProfile(@CurrentUser() user: CognitoUser) {
  console.log(user.sub);        // Cognito user ID
  console.log(user.email);      // User email
  console.log(user.accountId);  // Custom claim: account_id
  console.log(user.role);       // Custom claim: role
}
```

## Token Structure

### Access Token Claims

```json
{
  "sub": "12345678-1234-1234-1234-123456789012",
  "iss": "https://cognito-idp.us-east-1.amazonaws.com/us-east-1_xxxxxxxxx",
  "client_id": "xxxxxxxxxxxxxxxxxxxxxxxxxx",
  "token_use": "access",
  "scope": "openid profile email",
  "auth_time": 1234567890,
  "exp": 1234567890,
  "iat": 1234567890,
  "username": "user@example.com",
  "custom:account_id": "account-123",
  "custom:enterprise_id": "enterprise-456",
  "custom:role": "admin"
}
```

## Security Considerations

1. **Token Validation**: All tokens are validated against Cognito's JWKS
2. **Clock Skew**: 30-second tolerance for token expiration
3. **Issuer Verification**: Tokens must be from the configured user pool
4. **Audience Check**: Client ID is verified in token
5. **Rate Limiting**: Consider adding rate limiting for auth endpoints
