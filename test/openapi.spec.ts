import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AuthController } from '../src/auth/auth.controller.js';
import { AuthGuard } from '../src/auth/auth.guard.js';
import { AuthService } from '../src/auth/auth.service.js';
import { CommentController } from '../src/comment/comment.controller.js';
import { CommentService } from '../src/comment/comment.service.js';
import { HealthController } from '../src/health/health.controller.js';
import { HealthService } from '../src/health/health.service.js';
import { IssueController } from '../src/issue/issue.controller.js';
import { IssueService } from '../src/issue/issue.service.js';
import { ProjectController } from '../src/project/project.controller.js';
import { ProjectService } from '../src/project/project.service.js';
import { RolesGuard } from '../src/auth/roles.guard.js';
import { TenantController } from '../src/tenant/tenant.controller.js';
import { TenantService } from '../src/tenant/tenant.service.js';

describe('OpenAPI', () => {
  let app: INestApplication;
  let document: ReturnType<typeof getOpenApiDocument>;

  beforeAll(async () => {
    const builder = Test.createTestingModule({
      controllers: [
        AuthController,
        CommentController,
        HealthController,
        IssueController,
        ProjectController,
        TenantController,
      ],
      providers: [
        { provide: AuthService, useValue: {} },
        { provide: CommentService, useValue: {} },
        { provide: HealthService, useValue: {} },
        { provide: IssueService, useValue: {} },
        { provide: ProjectService, useValue: {} },
        { provide: TenantService, useValue: {} },
      ],
    })
      .overrideGuard(AuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true });
    const moduleRef = await builder.compile();

    app = moduleRef.createNestApplication();
    await app.init();
    document = getOpenApiDocument(app);
  });

  afterAll(async () => {
    await app?.close();
  });

  it('documenta los campos requeridos para iniciar sesión', () => {
    expect(document.components?.schemas?.LoginDto).toMatchObject({
      type: 'object',
      required: ['email', 'password'],
      properties: {
        email: { type: 'string' },
        password: { type: 'string' },
      },
    });
  });

  it('documenta las respuestas DTO de auth y health con sus códigos HTTP', () => {
    expect(responseSchema(document, '/auth/register', 'post', '201')).toEqual({
      $ref: '#/components/schemas/AuthSessionResponseDto',
    });
    expect(responseSchema(document, '/auth/login', 'post', '200')).toEqual({
      $ref: '#/components/schemas/AuthLoginResponseDto',
    });
    expect(responseSchema(document, '/auth/me', 'get', '200')).toEqual({
      $ref: '#/components/schemas/AuthUserResponseDto',
    });
    expect(
      responseSchema(document, '/auth/switch-tenant', 'post', '200'),
    ).toEqual({ $ref: '#/components/schemas/AccessTokenResponseDto' });
    expect(responseSchema(document, '/auth/refresh', 'post', '200')).toEqual({
      $ref: '#/components/schemas/AuthSessionResponseDto',
    });
    expect(responseSchema(document, '/auth/logout', 'post', '204')).toBe(
      undefined,
    );
    expect(responseSchema(document, '/health/live', 'get', '200')).toEqual({
      $ref: '#/components/schemas/HealthLiveResponseDto',
    });
    expect(responseSchema(document, '/health/ready', 'get', '200')).toEqual({
      $ref: '#/components/schemas/HealthReadinessResponseDto',
    });
    expect(responseSchema(document, '/health/ready', 'get', '503')).toEqual({
      $ref: '#/components/schemas/HealthReadinessResponseDto',
    });
    expect(document.paths?.['/auth/login']?.post?.responses?.['401']).toBeDefined();
    expect(document.paths?.['/auth/login']?.post?.responses?.['429']).toBeDefined();
  });

  it('documenta una respuesta exitosa para cada endpoint', () => {
    const endpoints = [
      ['/auth/register', 'post', '201'],
      ['/auth/login', 'post', '200'],
      ['/auth/me', 'get', '200'],
      ['/auth/switch-tenant', 'post', '200'],
      ['/auth/refresh', 'post', '200'],
      ['/auth/logout', 'post', '204'],
      ['/auth/logout-all', 'post', '204'],
      ['/health/live', 'get', '200'],
      ['/health/ready', 'get', '200'],
      ['/issues', 'get', '200'],
      ['/issues', 'post', '201'],
      ['/issues/{id}', 'get', '200'],
      ['/issues/{id}', 'patch', '200'],
      ['/issues/{id}', 'delete', '204'],
      ['/issues/{id}/history', 'get', '200'],
      ['/issues/{issueId}/comments', 'get', '200'],
      ['/issues/{issueId}/comments', 'post', '201'],
      ['/comments/{id}', 'patch', '200'],
      ['/comments/{id}', 'delete', '204'],
      ['/projects', 'get', '200'],
      ['/projects', 'post', '201'],
      ['/projects/{id}', 'get', '200'],
      ['/projects/{id}', 'patch', '200'],
      ['/projects/{id}', 'delete', '204'],
      ['/tenants', 'post', '201'],
      ['/tenants/current/members', 'get', '200'],
      ['/tenants/current/members', 'post', '201'],
      ['/tenants/current/members/{userId}', 'delete', '204'],
      ['/tenants/current/members/{userId}', 'patch', '200'],
    ] as const;

    for (const [path, method, statusCode] of endpoints) {
      expect(document.paths?.[path]?.[method]?.responses[statusCode]).toBeDefined();
    }

    expect(
      document.paths?.['/issues/{id}']?.delete?.responses['204']?.content,
    ).toBeUndefined();
    expect(
      document.paths?.['/comments/{id}']?.delete?.responses['204']?.content,
    ).toBeUndefined();
    expect(
      document.paths?.['/projects/{id}']?.delete?.responses['204']?.content,
    ).toBeUndefined();
    expect(
      document.paths?.['/tenants/current/members/{userId}']?.delete?.responses[
        '204'
      ]?.content,
    ).toBeUndefined();
  });

  it('documenta los DTOs de issues, comentarios, proyectos y tenants', () => {
    expect(responseSchema(document, '/issues', 'get', '200')).toEqual({
      $ref: '#/components/schemas/IssueListResponseDto',
    });
    expect(responseSchema(document, '/issues', 'post', '201')).toEqual({
      $ref: '#/components/schemas/IssueResponseDto',
    });
    expect(
      responseSchema(document, '/issues/{id}/history', 'get', '200'),
    ).toEqual({ $ref: '#/components/schemas/IssueHistoryResponseDto' });
    expect(
      responseSchema(document, '/issues/{issueId}/comments', 'get', '200'),
    ).toEqual({ $ref: '#/components/schemas/CommentListResponseDto' });
    expect(
      responseSchema(document, '/issues/{issueId}/comments', 'post', '201'),
    ).toEqual({ $ref: '#/components/schemas/CommentResponseDto' });
    expect(responseSchema(document, '/projects', 'get', '200')).toEqual({
      $ref: '#/components/schemas/ProjectListResponseDto',
    });
    expect(responseSchema(document, '/projects', 'post', '201')).toEqual({
      $ref: '#/components/schemas/ProjectResponseDto',
    });
    expect(
      responseSchema(document, '/tenants', 'post', '201'),
    ).toEqual({ $ref: '#/components/schemas/CreateTenantResponseDto' });
    expect(
      responseSchema(document, '/tenants/current/members', 'get', '200'),
    ).toMatchObject({
      type: 'array',
      items: { $ref: '#/components/schemas/TenantMemberResponseDto' },
    });
    expect(
      responseSchema(document, '/tenants/current/members', 'post', '201'),
    ).toEqual({ $ref: '#/components/schemas/TenantMemberResponseDto' });
  });

  it('incluye campos heredados y relaciones anidadas en los schemas', () => {
    const schemas = document.components?.schemas;
    const serializedSchemas = JSON.stringify(schemas);

    expect(serializedSchemas).toContain('access_token');
    expect(serializedSchemas).toContain('refresh_token');
    expect(serializedSchemas).toContain('organizations');
    expect(serializedSchemas).toContain('actor');
    expect(serializedSchemas).toContain('author');
    expect(serializedSchemas).toContain('checks');
  });

  it('usa el DTO común de error y documenta estados de error relevantes', () => {
    const responses = document.paths?.['/projects']?.post?.responses;

    expect(document.components?.schemas?.ApiErrorResponseDto?.properties).toMatchObject({
      statusCode: { type: 'number' },
      message: {
        oneOf: [
          { type: 'string' },
          { type: 'array', items: { type: 'string' } },
        ],
      },
      error: { type: 'string' },
    });
    expect(responses?.['401']?.content?.['application/json']?.schema).toEqual({
      $ref: '#/components/schemas/ApiErrorResponseDto',
    });
    expect(responses?.['400']).toBeDefined();
    expect(responses?.['403']).toBeDefined();
    expect(responses?.['409']).toBeDefined();
  });
});

function getOpenApiDocument(app: INestApplication) {
  return SwaggerModule.createDocument(app, new DocumentBuilder().build());
}

function responseSchema(
  document: ReturnType<typeof getOpenApiDocument>,
  path: string,
  method: 'get' | 'post' | 'patch' | 'delete',
  statusCode: string,
) {
  return document.paths?.[path]?.[method]?.responses?.[statusCode]?.content?.[
    'application/json'
  ]?.schema;
}
