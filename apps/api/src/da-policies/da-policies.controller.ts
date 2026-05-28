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
  UsePipes,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser, Roles, type AuthedUser } from '../auth/index.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { CreateDaPolicyDto, UpdateDaPolicyDto } from './da-policy.dto.js';
import { DaPoliciesService } from './da-policies.service.js';

@ApiTags('Master data — DA Policies (time-versioned)')
@ApiBearerAuth()
@Controller('master-data/da-policies')
@UsePipes(ZodValidationPipe)
export class DaPoliciesController {
  constructor(private readonly policies: DaPoliciesService) {}

  @Get()
  @ApiOperation({
    summary:
      'List all DA policies (newest effectiveFrom first). The engine picks the one effective on each trip date.',
  })
  list() {
    return this.policies.list();
  }

  @Get(':id')
  get(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.policies.get(id);
  }

  @Post()
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Add a new policy version (does not delete prior versions).' })
  create(@Body() body: CreateDaPolicyDto, @CurrentUser() user: AuthedUser) {
    return this.policies.create(body, user.id);
  }

  @Patch(':id')
  @Roles('ADMIN')
  update(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: UpdateDaPolicyDto,
    @CurrentUser() user: AuthedUser,
  ) {
    return this.policies.update(id, body, user.id);
  }

  @Delete(':id')
  @Roles('ADMIN')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Delete a policy version. Use sparingly — historical trips may need it.',
  })
  async delete(@Param('id', new ParseUUIDPipe()) id: string, @CurrentUser() user: AuthedUser) {
    await this.policies.delete(id, user.id);
  }
}
