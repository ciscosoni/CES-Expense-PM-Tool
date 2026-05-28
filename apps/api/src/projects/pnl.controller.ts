import { Controller, Get, Param, ParseUUIDPipe } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { PnlService } from './pnl.service.js';

@ApiTags('Projects — P&L')
@ApiBearerAuth()
@Controller('projects/:id/pnl')
export class PnlController {
  constructor(private readonly pnl: PnlService) {}

  @Get()
  @ApiOperation({
    summary:
      'Live P&L roll-up for a project. Returns revenue, full cost breakdown, gross profit, margin %.',
  })
  forProject(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.pnl.forProject(id);
  }
}
