import { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import helmet from 'helmet';
import { I18nValidationExceptionFilter, I18nValidationPipe } from 'nestjs-i18n';

export function setupApp(app: INestApplication) {
  const config = app.get(ConfigService);

  app.use(
    helmet({
      // Swagger UI necesita scripts y estilos inline; el resto de la API responde JSON
      contentSecurityPolicy: {
        directives: {
          scriptSrc: [`'self'`, `'unsafe-inline'`],
          styleSrc: [`'self'`, `'unsafe-inline'`],
          imgSrc: [`'self'`, 'data:', 'validator.swagger.io'],
        },
      },
    }),
  );

  // Sin CORS_ORIGINS no se emiten cabeceras CORS y los navegadores bloquean los orígenes externos
  const origins = (config.get<string>('CORS_ORIGINS') ?? '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

  if (origins.length > 0) {
    app.enableCors({
      origin: origins, // lista exacta, nunca '*'
      methods: ['GET', 'POST', 'PATCH', 'DELETE'],
      allowedHeaders: ['Content-Type', 'Authorization', 'Accept-Language'],
      exposedHeaders: ['Retry-After'], // para que el cliente lea cuándo reintentar tras un 429
      maxAge: 600,
    });
  }
  app.enableShutdownHooks();
  app.useGlobalPipes(
    new I18nValidationPipe({ whitelist: true, transform: true }),
  );
  app.useGlobalFilters(new I18nValidationExceptionFilter());
}
