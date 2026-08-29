import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.setGlobalPrefix('api');

  app.enableCors({
    origin: ['http://localhost:5173', 'http://127.0.0.1:5173'],
    credentials: true,
  });

  const port = 3001;
  await app.listen(port);
  console.log(`BarakaMobile API listening on http://localhost:${port}/api`);
}

bootstrap();
