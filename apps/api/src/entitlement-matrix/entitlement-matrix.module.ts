import { Module } from '@nestjs/common';
import { EntitlementMatrixController } from './entitlement-matrix.controller.js';
import { EntitlementMatrixService } from './entitlement-matrix.service.js';

@Module({
  controllers: [EntitlementMatrixController],
  providers: [EntitlementMatrixService],
  exports: [EntitlementMatrixService],
})
export class EntitlementMatrixModule {}
