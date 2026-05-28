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
import { CreateCostRateDto, UpdateCostRateDto } from './cost-rate.dto.js';
import { CostRatesService } from './cost-rates.service.js';

@ApiTags('Master data — Cost Rates (time-versioned)')
@ApiBearerAuth()
@Controller('master-data/cost-rates')
@UsePipes(ZodValidationPipe)
export class CostRatesController {
  constructor(private readonly costRates: CostRatesService) {}

  @Get()
  @ApiOperation({ summary: 'List cost rates, optionally filtered by gradeId.' })
  list(@Query('gradeId') gradeId?: string) {
    return this.costRates.list({ gradeId });
  }

  @Get(':id')
  get(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.costRates.get(id);
  }

  @Post()
  @Roles('ADMIN')
  @ApiOperation({
    summary: 'Add a new cost-rate version. P&L engine picks the row effective per log date.',
  })
  create(@Body() body: CreateCostRateDto, @CurrentUser() user: AuthedUser) {
    return this.costRates.create(body, user.id);
  }

  @Patch(':id')
  @Roles('ADMIN')
  update(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: UpdateCostRateDto,
    @CurrentUser() user: AuthedUser,
  ) {
    return this.costRates.update(id, body, user.id);
  }

  @Delete(':id')
  @Roles('ADMIN')
  @HttpCode(HttpStatus.NO_CONTENT)
  async delete(@Param('id', new ParseUUIDPipe()) id: string, @CurrentUser() user: AuthedUser) {
    await this.costRates.delete(id, user.id);
  }
}
