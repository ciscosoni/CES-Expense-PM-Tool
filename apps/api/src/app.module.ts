import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { HealthController } from './health.controller.js';
import { PrismaModule } from './prisma.module.js';
import { AuthModule } from './auth/auth.module.js';
import { AuditModule } from './audit/audit.module.js';
import { GradesModule } from './grades/grades.module.js';
import { CostRatesModule } from './cost-rates/cost-rates.module.js';
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

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    AuditModule,
    AuthModule,
    UsersModule,
    // Master data
    GradesModule,
    CostRatesModule,
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
  ],
  controllers: [HealthController],
})
export class AppModule {}
