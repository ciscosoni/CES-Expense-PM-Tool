import { Controller, Get, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Roles } from '../auth/index.js';
import { GraphService } from './graph.service.js';

@ApiTags('Microsoft Graph')
@ApiBearerAuth()
@Controller('graph')
export class GraphController {
  constructor(private readonly graph: GraphService) {}

  @Get('status')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Show which directory provider is active (graph | mock).' })
  status() {
    return { provider: this.graph.providerKind };
  }

  @Post('sync')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Sync users + manager chain from the directory into the DB.' })
  sync() {
    return this.graph.sync();
  }
}
