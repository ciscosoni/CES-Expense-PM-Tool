import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { Logger as PinoLogger } from 'nestjs-pino';
import { AppModule } from './app.module.js';
import { loadApiEnv } from './env.js';

async function bootstrap() {
  const env = loadApiEnv();
  // bufferLogs ⇒ early init logs flush through Pino once the logger is bound,
  // so the very first lines are JSON-structured rather than the default Nest text.
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  app.useLogger(app.get(PinoLogger));

  // Body validation goes through ZodValidationPipe (registered per-controller).
  // The global Nest ValidationPipe stays only for Query/Param coercion (no whitelist —
  // whitelist would strip Zod DTOs since they carry no class-validator decorators).
  app.useGlobalPipes(
    new ValidationPipe({ transform: true, transformOptions: { enableImplicitConversion: true } }),
  );
  app.setGlobalPrefix('api');

  const swagger = new DocumentBuilder()
    .setTitle('CES Internal Tool API')
    .setDescription('Projects, attendance, travel, expenses, reimbursements, DA, P&L')
    .setVersion('0.0.1')
    .addBearerAuth()
    .build();
  const doc = SwaggerModule.createDocument(app, swagger);
  SwaggerModule.setup('docs', app, doc);

  // Trust X-Forwarded-* headers from the Container Apps ingress so that
  // request logs carry the real client IP, not the internal LB.
  const httpAdapter = app.getHttpAdapter();
  const expressInstance = httpAdapter.getInstance() as { set?: (key: string, value: unknown) => void };
  expressInstance.set?.('trust proxy', 1);

  // Graceful shutdown: drain in-flight requests, close the Prisma pool, then exit.
  app.enableShutdownHooks();

  await app.listen(env.API_PORT);
  Logger.log(`API listening on http://localhost:${env.API_PORT} (docs at /docs)`, 'Bootstrap');
}

void bootstrap();
