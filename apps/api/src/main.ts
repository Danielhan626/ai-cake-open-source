import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { config } from 'dotenv';
import { AppModule } from './app.module';

config();

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    rawBody: true,
  });
  const origin = process.env.APP_ORIGIN || 'http://localhost:5173';

  app.enableCors({
    origin: [origin, 'http://127.0.0.1:5173'],
    credentials: true,
  });
  const port = Number(process.env.PORT || 4000);
  const host = process.env.HOST || '0.0.0.0';
  await app.listen(port, host);
  console.log(`Ruyi Fruit Cake API running on http://${host === '0.0.0.0' ? 'localhost' : host}:${port}`);
}

bootstrap();
