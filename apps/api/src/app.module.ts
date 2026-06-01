import { randomUUID } from 'node:crypto';
import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { LoggerModule } from 'nestjs-pino';
import { CsrfGuard } from './common/csrf.guard.js';
import { UserThrottlerGuard } from './common/user-throttler.guard.js';
import { HealthController } from './health.controller.js';
import { PrismaModule } from './prisma.module.js';
import { AuthModule } from './auth/auth.module.js';
import { AuditModule } from './audit/audit.module.js';
import { GradesModule } from './grades/grades.module.js';
import { CostRatesModule } from './cost-rates/cost-rates.module.js';
import { BillRatesModule } from './bill-rates/bill-rates.module.js';
import { CitiesModule } from './cities/cities.module.js';
import { EntitlementMatrixModule } from './entitlement-matrix/entitlement-matrix.module.js';
import { DaPoliciesModule } from './da-policies/da-policies.module.js';
import { ClientsModule } from './clients/clients.module.js';
import { EndCustomersModule } from './end-customers/end-customers.module.js';
import { UsersModule } from './users/users.module.js';
import { ProjectsModule } from './projects/projects.module.js';
import { TasksModule } from './tasks/tasks.module.js';
import { AllocationsModule } from './allocations/allocations.module.js';
import { TravelModule } from './travel/travel.module.js';
import { ExpensesModule } from './expenses/expenses.module.js';
import { ReceiptsModule } from './receipts/receipts.module.js';
import { ReimbursementsModule } from './reimbursements/reimbursements.module.js';
import { DashboardsModule } from './dashboards/dashboards.module.js';
import { PayslipsModule } from './payslips/payslips.module.js';
import { AttendanceModule } from './attendance/attendance.module.js';
import { ChangeRequestsModule } from './change-requests/change-requests.module.js';
import { CommentsModule } from './comments/comments.module.js';
import { AnomaliesModule } from './anomalies/anomalies.module.js';
import { AiModule } from './ai/ai.module.js';
import { GraphModule } from './graph/graph.module.js';
import { StorageModule } from './storage/storage.module.js';
import { NotificationsModule } from './notifications/notifications.module.js';
import { SchedulerModule } from './scheduler/scheduler.module.js';
import { AgentsModule } from './agents/agents.module.js';
import { ReportsModule } from './reports/reports.module.js';
import { ForecastModule } from './forecast/forecast.module.js';

const isProd = process.env.NODE_ENV === 'production';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    // Structured JSON logs in prod (pino) so Log Analytics can index them;
    // pretty rainbow in dev so they're readable in the terminal. Request IDs
    // are propagated as `x-request-id` so traces can be stitched across services.
    LoggerModule.forRoot({
      pinoHttp: {
        level: process.env.LOG_LEVEL ?? (isProd ? 'info' : 'debug'),
        genReqId: (req, res) => {
          const incoming = (req.headers['x-request-id'] as string | undefined) ?? randomUUID();
          res.setHeader('x-request-id', incoming);
          return incoming;
        },
        autoLogging: {
          ignore: (req) => {
            const url = req.url ?? '';
            return url === '/api/health' || url === '/api/ready';
          },
        },
        // Redact obvious secrets from request logs.
        redact: {
          paths: [
            'req.headers.authorization',
            'req.headers.cookie',
            'req.headers["x-dev-user-email"]',
          ],
          censor: '[redacted]',
        },
        ...(isProd
          ? {}
          : {
              transport: {
                target: 'pino-pretty',
                options: { singleLine: true, translateTime: 'SYS:HH:MM:ss' },
              },
            }),
      },
    }),
    // Rate limiting: 300 requests / minute, keyed per-user (authed) or per-IP.
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 300 }]),
    PrismaModule,
    AuditModule,
    AuthModule,
    UsersModule,
    // Master data
    GradesModule,
    CostRatesModule,
    BillRatesModule,
    CitiesModule,
    EntitlementMatrixModule,
    DaPoliciesModule,
    ClientsModule,
    EndCustomersModule,
    // Work
    ProjectsModule,
    TasksModule,
    AllocationsModule,
    TravelModule,
    ExpensesModule,
    ReceiptsModule,
    ReimbursementsModule,
    DashboardsModule,
    PayslipsModule,
    // Phase 2C / 2D / 2E
    AttendanceModule,
    ChangeRequestsModule,
    CommentsModule,
    AnomaliesModule,
    // Phase 2F — AI flows (project onboarding wizard, Ask-AI surface later)
    AiModule,
    GraphModule,
    StorageModule,
    NotificationsModule,
    SchedulerModule,
    AgentsModule,
    ReportsModule,
    ForecastModule,
  ],
  controllers: [HealthController],
  providers: [
    // CSRF origin-check on mutating routes (prod-enforced), then rate limiting.
    { provide: APP_GUARD, useClass: CsrfGuard },
    { provide: APP_GUARD, useClass: UserThrottlerGuard },
  ],
})
export class AppModule {}
