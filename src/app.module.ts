import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { ClsModule } from 'nestjs-cls';
import { AcceptLanguageResolver, I18nModule, QueryResolver } from 'nestjs-i18n';
import { join } from 'path';
import { AuthModule } from './auth/auth.module.js';
import { CommentModule } from './comment/comment.module.js';
import { t } from './i18n/t.js';
import { IssueModule } from './issue/issue.module.js';
import { PrismaModule } from './prisma/prisma.module.js';
import { ProjectModule } from './project/project.module.js';
import { TenantModule } from './tenant/tenant.module.js';
import { UsersModule } from './users/users.module.js';
import { HealthModule } from './health/health.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ThrottlerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        throttlers: [
          {
            name: 'default',
            ttl: Number(config.get('THROTTLE_TTL_MS') ?? 60_000), // en milisegundos
            limit: Number(config.get('THROTTLE_LIMIT') ?? 100),
          },
        ],
        skipIf: () => config.get('THROTTLE_DISABLED') === 'true',
        errorMessage: () => t('common.TOO_MANY_REQUESTS'),
      }),
    }),
    ClsModule.forRoot({ global: true, middleware: { mount: true } }),
    I18nModule.forRoot({
      fallbackLanguage: 'en',
      loaderOptions: {
        path: join(import.meta.dirname, 'i18n'),
        watch: process.env.NODE_ENV !== 'production',
      },
      resolvers: [
        { use: QueryResolver, options: ['lang'] }, // ?lang=es
        AcceptLanguageResolver, // Accept-Language: es
      ],
    }),
    PrismaModule,
    AuthModule,
    TenantModule,
    UsersModule,
    ProjectModule,
    IssueModule,
    CommentModule,
    HealthModule,
  ],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
