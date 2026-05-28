import {
  Body,
  Controller,
  Delete,
  Get,
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
import { CreateEndCustomerDto, UpdateEndCustomerDto } from './end-customer.dto.js';
import { EndCustomersService } from './end-customers.service.js';

@ApiTags('Master data — End Customers')
@ApiBearerAuth()
@Controller('master-data/end-customers')
@UsePipes(ZodValidationPipe)
export class EndCustomersController {
  constructor(private readonly endCustomers: EndCustomersService) {}

  @Get()
  @ApiOperation({
    summary: 'List end customers (the bank/airport/govt entities our clients serve)',
  })
  list(@Query('includeInactive') includeInactive?: string) {
    return this.endCustomers.list({ includeInactive: includeInactive === 'true' });
  }

  @Get(':id')
  get(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.endCustomers.get(id);
  }

  @Post()
  @Roles('ADMIN')
  create(@Body() body: CreateEndCustomerDto, @CurrentUser() user: AuthedUser) {
    return this.endCustomers.create(body, user.id);
  }

  @Patch(':id')
  @Roles('ADMIN')
  update(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: UpdateEndCustomerDto,
    @CurrentUser() user: AuthedUser,
  ) {
    return this.endCustomers.update(id, body, user.id);
  }

  @Delete(':id')
  @Roles('ADMIN')
  deactivate(@Param('id', new ParseUUIDPipe()) id: string, @CurrentUser() user: AuthedUser) {
    return this.endCustomers.deactivate(id, user.id);
  }
}
