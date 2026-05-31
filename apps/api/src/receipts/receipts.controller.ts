import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  UsePipes,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser, type AuthedUser } from '../auth/index.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { AnalyzeReceiptDto, CreateReceiptDto } from './receipt.dto.js';
import { ReceiptsService } from './receipts.service.js';

@ApiTags('Receipts (fraud detection)')
@ApiBearerAuth()
@Controller()
@UsePipes(ZodValidationPipe)
export class ReceiptsController {
  constructor(private readonly receipts: ReceiptsService) {}

  @Get('expenses/:expenseId/receipts')
  list(@Param('expenseId', new ParseUUIDPipe()) expenseId: string) {
    return this.receipts.listForExpense(expenseId);
  }

  @Post('receipts')
  @ApiOperation({
    summary:
      'Attach a receipt to an expense. Server hashes the file (SHA-256), checks for duplicates, validates EXIF timestamp against trip window, returns flags.',
  })
  create(@Body() body: CreateReceiptDto, @CurrentUser() user: AuthedUser) {
    return this.receipts.create(body, user);
  }

  @Post('receipts/analyze')
  @ApiOperation({
    summary:
      'OCR + EXIF a snapped receipt and return prefill suggestions (amount, date, category, vendor, matched trip) — without creating an expense.',
  })
  analyze(@Body() body: AnalyzeReceiptDto, @CurrentUser() user: AuthedUser) {
    return this.receipts.analyze(body, user);
  }

  @Delete('receipts/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async delete(@Param('id', new ParseUUIDPipe()) id: string, @CurrentUser() user: AuthedUser) {
    await this.receipts.delete(id, user);
  }
}
