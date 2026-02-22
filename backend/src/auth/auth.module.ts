import { Module, Global } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { AuthService } from './auth.service';
import { CognitoService } from './cognito.service';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { RolesGuard } from './guards/roles.guard';
import { AccountGuard } from './guards/account.guard';

@Global()
@Module({
  imports: [ConfigModule],
  providers: [
    AuthService,
    CognitoService,
    // Apply JWT guard globally (use @Public() decorator to skip)
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
    RolesGuard,
    AccountGuard,
  ],
  exports: [AuthService, CognitoService, RolesGuard, AccountGuard],
})
export class AuthModule {}
