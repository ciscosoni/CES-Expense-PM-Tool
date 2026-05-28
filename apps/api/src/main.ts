import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { AppModule } from './app.module.js';
import { loadApiEnv } from './env.js';

async function bootstrap() {
  const env = loadApiEnv();
  const app = await NestFactory.create(AppModule);

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

  await app.listen(env.API_PORT);
  Logger.log(`API listening on http://localhost:${env.API_PORT} (docs at /docs)`, 'Bootstrap');
}

void bootstrap();
