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
import { CurrentUser, Roles, type AuthedUser } from '../auth/index.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { CreateBillRateDto, UpdateBillRateDto } from './bill-rate.dto.js';
import { BillRatesService } from './bill-rates.service.js';

@ApiTags('Master data — Bill Rates (time-versioned)')
@ApiBearerAuth()
@Controller('master-data/bill-rates')
@UsePipes(ZodValidationPipe)
export class BillRatesController {
  constructor(private readonly billRates: BillRatesService) {}

  @Get()
  @ApiOperation({ summary: 'List bill rates, optionally filtered by gradeId.' })
  list(@Query('gradeId') gradeId?: string) {
    return this.billRates.list({ gradeId });
  }

  @Get(':id')
  get(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.billRates.get(id);
  }

  @Post()
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Add a bill-rate version. T&M revenue = billable hours × bill rate.' })
  create(@Body() body: CreateBillRateDto, @CurrentUser() user: AuthedUser) {
    return this.billRates.create(body, user.id);
  }

  @Patch(':id')
  @Roles('ADMIN')
  update(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: UpdateBillRateDto,
    @CurrentUser() user: AuthedUser,
  ) {
    return this.billRates.update(id, body, user.id);
  }

  @Delete(':id')
  @Roles('ADMIN')
  @HttpCode(HttpStatus.NO_CONTENT)
  async delete(@Param('id', new ParseUUIDPipe()) id: string, @CurrentUser() user: AuthedUser) {
    await this.billRates.delete(id, user.id);
  }
}
