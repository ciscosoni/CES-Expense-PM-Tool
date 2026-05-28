import { Global, Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { AuthGuard } from './auth.guard.js';
import { RolesGuard } from './roles.guard.js';

@Global()
@Module({
  providers: [
    // Order matters: AuthGuard runs first (attaches user), then RolesGuard reads metadata.
    { provide: APP_GUARD, useClass: AuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AuthModule {}
