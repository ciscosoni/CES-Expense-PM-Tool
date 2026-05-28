import { Module } from '@nestjs/common';
import { DaPoliciesController } from './da-policies.controller.js';
import { DaPoliciesService } from './da-policies.service.js';

@Module({
  controllers: [DaPoliciesController],
  providers: [DaPoliciesService],
  exports: [DaPoliciesService],
})
export class DaPoliciesModule {}
