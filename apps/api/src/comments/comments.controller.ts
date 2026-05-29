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
import { CurrentUser, type AuthedUser } from '../auth/index.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { CreateCommentDto, UpdateCommentDto } from './comments.dto.js';
import { CommentsService } from './comments.service.js';

@ApiTags('Comments')
@ApiBearerAuth()
@Controller('comments')
@UsePipes(ZodValidationPipe)
export class CommentsController {
  constructor(private readonly comments: CommentsService) {}

  @Get()
  @ApiOperation({ summary: 'List comments on a polymorphic entity (PROJECT, TASK, …).' })
  list(
    @Query('entityKind') entityKind: string,
    @Query('entityId', new ParseUUIDPipe()) entityId: string,
  ) {
    return this.comments.listForEntity(entityKind, entityId);
  }

  @Post()
  create(@Body() body: CreateCommentDto, @CurrentUser() user: AuthedUser) {
    return this.comments.create(body, user);
  }

  @Patch(':id')
  update(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: UpdateCommentDto,
    @CurrentUser() user: AuthedUser,
  ) {
    return this.comments.update(id, body, user);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async delete(@Param('id', new ParseUUIDPipe()) id: string, @CurrentUser() user: AuthedUser) {
    await this.comments.delete(id, user);
  }
}
