import { Body, Controller, Get, Module, Param, ParseUUIDPipe, Post, Query, UsePipes } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { CurrentUser, Roles, type AuthedUser } from '../auth/index.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { createZodDto } from '../common/zod-dto.js';
import { InvoicesService } from './invoices.service.js';

const GenerateSchema = z.object({
  projectId: z.string().uuid(),
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  taxPercent: z.number().min(0).max(100).optional(),
});
class GenerateInvoiceDto extends createZodDto(GenerateSchema) {}
interface GenerateInvoiceDto extends z.infer<typeof GenerateSchema> {}

@ApiTags('Invoices')
@ApiBearerAuth()
@Controller('invoices')
@UsePipes(ZodValidationPipe)
class InvoicesController {
  constructor(private readonly invoices: InvoicesService) {}

  @Get()
  list(@Query('projectId') projectId?: string) {
    return this.invoices.list({ projectId });
  }

  @Get(':id')
  get(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.invoices.get(id);
  }

  @Post('generate')
  @Roles('ADMIN', 'FINANCE', 'PROJECT_OWNER')
  @ApiOperation({ summary: 'Generate a draft invoice from billable time on a project in a period.' })
  generate(@Body() body: GenerateInvoiceDto, @CurrentUser() user: AuthedUser) {
    return this.invoices.generateFromTime(body, user);
  }

  @Post(':id/send')
  @Roles('ADMIN', 'FINANCE')
  send(@Param('id', new ParseUUIDPipe()) id: string, @CurrentUser() user: AuthedUser) {
    return this.invoices.setStatus(id, 'SENT', user);
  }

  @Post(':id/paid')
  @Roles('ADMIN', 'FINANCE')
  paid(@Param('id', new ParseUUIDPipe()) id: string, @CurrentUser() user: AuthedUser) {
    return this.invoices.setStatus(id, 'PAID', user);
  }
}

@Module({
  controllers: [InvoicesController],
  providers: [InvoicesService],
  exports: [InvoicesService],
})
export class InvoicesModule {}
