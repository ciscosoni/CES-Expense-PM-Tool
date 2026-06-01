import { BadRequestException, Body, Controller, Get, Injectable, Module, Post, UsePipes } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { PrismaService } from '../prisma.service.js';
import { CurrentUser, type AuthedUser } from '../auth/index.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { createZodDto } from '../common/zod-dto.js';

/**
 * P9-G — live start/stop timer. One running timer per user; stopping it writes a
 * TimeLog (hours = elapsed). Field-first: a one-tap alternative to manual entry.
 */
@Injectable()
export class TimerService {
  constructor(private readonly prisma: PrismaService) {}

  current(userId: string) {
    return this.prisma.activeTimer.findUnique({
      where: { userId },
      include: { task: { select: { id: true, name: true } } },
    });
  }

  async start(userId: string, taskId: string, note?: string) {
    const task = await this.prisma.task.findFirst({ where: { id: taskId, deletedAt: null }, select: { id: true } });
    if (!task) throw new BadRequestException('Task not found');
    // One running timer per user — replace any existing.
    return this.prisma.activeTimer.upsert({
      where: { userId },
      update: { taskId, startedAt: new Date(), note: note ?? null },
      create: { userId, taskId, note: note ?? null },
    });
  }

  async stop(userId: string, billable: boolean) {
    const timer = await this.prisma.activeTimer.findUnique({ where: { userId } });
    if (!timer) throw new BadRequestException('No running timer');
    const hours = Math.min(24, Math.max(0.01, Math.round(((Date.now() - timer.startedAt.getTime()) / 3_600_000) * 100) / 100));
    const [log] = await this.prisma.$transaction([
      this.prisma.timeLog.create({
        data: {
          taskId: timer.taskId,
          userId,
          date: new Date(timer.startedAt.toISOString().slice(0, 10)),
          hours: String(hours),
          billable,
          notes: timer.note,
        },
      }),
      this.prisma.activeTimer.delete({ where: { userId } }),
    ]);
    return { timeLog: log, hours };
  }
}

const StartSchema = z.object({ taskId: z.string().uuid(), note: z.string().max(200).optional() });
class StartTimerDto extends createZodDto(StartSchema) {}
interface StartTimerDto extends z.infer<typeof StartSchema> {}
const StopSchema = z.object({ billable: z.boolean().optional() });
class StopTimerDto extends createZodDto(StopSchema) {}
interface StopTimerDto extends z.infer<typeof StopSchema> {}

@ApiTags('Timer')
@ApiBearerAuth()
@Controller('timer')
@UsePipes(ZodValidationPipe)
class TimerController {
  constructor(private readonly timer: TimerService) {}

  @Get('current')
  @ApiOperation({ summary: 'My currently-running timer, if any.' })
  current(@CurrentUser() user: AuthedUser) {
    return this.timer.current(user.id);
  }

  @Post('start')
  start(@Body() body: StartTimerDto, @CurrentUser() user: AuthedUser) {
    return this.timer.start(user.id, body.taskId, body.note);
  }

  @Post('stop')
  stop(@Body() body: StopTimerDto, @CurrentUser() user: AuthedUser) {
    return this.timer.stop(user.id, body.billable ?? true);
  }
}

@Module({
  controllers: [TimerController],
  providers: [TimerService],
  exports: [TimerService],
})
export class TimerModule {}
