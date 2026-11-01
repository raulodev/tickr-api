import { join } from 'path';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AuthModule } from './auth/auth.module.js';
import { TenantModule } from './tenant/tenant.module.js';
import { UsersModule } from './users/users.module.js';
import { PrismaModule } from './prisma/prisma.module.js';
import { AcceptLanguageResolver, I18nModule, QueryResolver } from 'nestjs-i18n';
import { ClsModule } from 'nestjs-cls';
import { ProjectModule } from './project/project.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
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
  ],
})
export class AppModule {}
