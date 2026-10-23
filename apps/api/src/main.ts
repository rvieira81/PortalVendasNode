import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { configurarApp } from './app.factory';
import { carregarConfig } from './config/config';
import { carregarEnvLocal } from './config/env-local';

async function principal() {
  carregarEnvLocal();
  const config = carregarConfig();
  const app = await NestFactory.create<NestExpressApplication>(AppModule.com(config), { bufferLogs: true });
  configurarApp(app, config);
  await app.listen(config.PORTA, '0.0.0.0');
}

principal().catch((erro) => {
  console.error(erro instanceof Error ? erro.message : erro);
  process.exit(1);
});
