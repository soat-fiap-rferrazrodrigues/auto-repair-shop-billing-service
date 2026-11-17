import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { JsonLogger, correlationMiddleware } from './logging/json.logger';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    logger: new JsonLogger(process.env.DD_SERVICE ?? 'billing-service'),
  });
  app.use(correlationMiddleware);
  app.enableShutdownHooks();
  await app.listen(process.env.PORT ?? 3001);
}
void bootstrap();
