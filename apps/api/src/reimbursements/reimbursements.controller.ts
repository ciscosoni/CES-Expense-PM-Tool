import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query, UsePipes } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser, Roles, type AuthedUser } from '../auth/index.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { CreateReimbursementDto, MarkPaidDto } from './reimbursement.dto.js';
import { ReimbursementsService } from './reimbursements.service.js';

@ApiTags('Reimbursements (Finance queue)')
@ApiBearerAuth()
@Controller('reimbursements')
@UsePipes(ZodValidationPipe)
export class ReimbursementsController {
  constructor(private readonly reimbursements: ReimbursementsService) {}

  @Get()
  @Roles('FINANCE', 'ADMIN')
  list(@Query('status') status?: 'PENDING' | 'APPROVED' | 'PAID' | 'CANCELLED') {
    return this.reimbursements.list(status);
  }

  @Get('eligible-expenses')
  @Roles('FINANCE', 'ADMIN')
  @ApiOperation({
    summary:
      'Approved-but-unpaid expenses grouped by submitter — the source for building reimbursement batches.',
  })
  eligible() {
    return this.reimbursements.listEligibleExpensesByUser();
  }

  @Get(':id')
  @Roles('FINANCE', 'ADMIN')
  get(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.reimbursements.get(id);
  }

  @Post()
  @Roles('FINANCE', 'ADMIN')
  create(@Body() body: CreateReimbursementDto, @CurrentUser() user: AuthedUser) {
    return this.reimbursements.create(body, user);
  }

  @Post(':id/mark-paid')
  @Roles('FINANCE', 'ADMIN')
  markPaid(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: MarkPaidDto,
    @CurrentUser() user: AuthedUser,
  ) {
    return this.reimbursements.markPaid(id, body, user);
  }

  @Post(':id/cancel')
  @Roles('FINANCE', 'ADMIN')
  cancel(@Param('id', new ParseUUIDPipe()) id: string, @CurrentUser() user: AuthedUser) {
    return this.reimbursements.cancel(id, user);
  }
}
