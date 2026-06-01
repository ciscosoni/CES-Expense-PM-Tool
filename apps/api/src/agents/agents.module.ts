import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module.js';
import { AnomaliesModule } from '../anomalies/anomalies.module.js';
import { AiModule } from '../ai/ai.module.js';
import { ProjectsModule } from '../projects/projects.module.js';
import { AuditModule } from '../audit/audit.module.js';
import { AgentsController } from './agents.controller.js';
import { AgentsService } from './agents.service.js';
import { AutoApprovalService } from './auto-approval.service.js';

/**
 * P6 Autonomous Agents. Composes the notification fabric (P3), anomaly detector,
 * AI plumbing (P5), and P&L engine into scheduled, low-intervention automations.
 */
@Module({
  imports: [NotificationsModule, AnomaliesModule, AiModule, ProjectsModule, AuditModule],
  controllers: [AgentsController],
  providers: [AgentsService, AutoApprovalService],
  exports: [AgentsService, AutoApprovalService],
})
export class AgentsModule {}
