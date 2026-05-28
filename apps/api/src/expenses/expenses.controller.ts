import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UsePipes,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { ExpenseStatus } from '@prisma/client';
import { CurrentUser, type AuthedUser } from '../auth/index.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { CreateExpenseDto, RejectExpenseDto, UpdateExpenseDto } from './expense.dto.js';
import { ExpensesService } from './expenses.service.js';

@ApiTags('Expenses')
@ApiBearerAuth()
@Controller('expenses')
@UsePipes(ZodValidationPipe)
export class ExpensesController {
  constructor(private readonly expenses: ExpensesService) {}

  @Get()
  list(
    @Query('userId') userId?: string,
    @Query('projectId') projectId?: string,
    @Query('status') status?: ExpenseStatus,
  ) {
    return this.expenses.list({ userId, projectId, status });
  }

  @Get('mine')
  mine(@CurrentUser() user: AuthedUser) {
    return this.expenses.list({ userId: user.id });
  }

  @Get('inbox')
  @ApiOperation({ summary: 'Pending expense approvals for current user (project PM)' })
  inbox(@CurrentUser() user: AuthedUser) {
    return this.expenses.list({ pendingForApproverId: user.id });
  }

  @Get(':id')
  get(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.expenses.get(id);
  }

  @Post()
  create(@Body() body: CreateExpenseDto, @CurrentUser() user: AuthedUser) {
    return this.expenses.create(body, user);
  }

  @Patch(':id')
  update(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: UpdateExpenseDto,
    @CurrentUser() user: AuthedUser,
  ) {
    return this.expenses.update(id, body, user);
  }

  @Post(':id/submit')
  submit(@Param('id', new ParseUUIDPipe()) id: string, @CurrentUser() user: AuthedUser) {
    return this.expenses.submit(id, user);
  }

  @Post(':id/approve')
  approve(@Param('id', new ParseUUIDPipe()) id: string, @CurrentUser() user: AuthedUser) {
    return this.expenses.approve(id, user);
  }

  @Post(':id/reject')
  reject(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: RejectExpenseDto,
    @CurrentUser() user: AuthedUser,
  ) {
    return this.expenses.reject(id, body, user);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async delete(@Param('id', new ParseUUIDPipe()) id: string, @CurrentUser() user: AuthedUser) {
    await this.expenses.delete(id, user);
  }
}
