import { Prisma } from '../generated/prisma/client.js';

/** Modelos con columna tenantId. Al crear un modelo nuevo con tenant, agrégalo aquí. */
const TENANT_MODELS: ReadonlySet<string> = new Set<Prisma.ModelName>([
  'Project',
  'Issue',
  'Comment',
]);

const FILTERED = new Set([
  'findUnique',
  'findUniqueOrThrow',
  'findFirst',
  'findFirstOrThrow',
  'findMany',
  'count',
  'aggregate',
  'groupBy',
  'update',
  'updateMany',
  'updateManyAndReturn',
  'upsert',
  'delete',
  'deleteMany',
]);
const CREATING = new Set(['create', 'createMany', 'createManyAndReturn']);

/** Fija el tenantId; si el código pasó otro distinto, es un bug o un ataque: se rechaza. */
function stamp(data: Record<string, any>, tenantId: string) {
  if (data.tenantId !== undefined && data.tenantId !== tenantId) {
    throw new Error('Tenant mismatch: cannot write data for another tenant');
  }
  return { ...data, tenantId };
}

/** Impide mover una fila a otro tenant desde un update. */
function withoutTenantId(data?: Record<string, any>) {
  if (!data) return data;
  const { tenantId: _ignored, ...rest } = data;
  return rest;
}

export const tenantExtension = (getTenantId: () => string | undefined) =>
  Prisma.defineExtension({
    name: 'tenant-isolation',
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          if (!TENANT_MODELS.has(model)) return query(args);

          const tenantId = getTenantId();
          if (!tenantId) {
            throw new Error(`Missing tenant context for ${model}.${operation}`);
          }
          if (!FILTERED.has(operation) && !CREATING.has(operation)) {
            throw new Error(
              `${model}.${operation} is not supported on tenant-scoped models`,
            );
          }

          const a = (args ?? {}) as Record<string, any>;

          if (FILTERED.has(operation)) a.where = { ...a.where, tenantId };

          switch (operation) {
            case 'create':
              a.data = stamp(a.data, tenantId);
              break;
            case 'createMany':
            case 'createManyAndReturn':
              a.data = Array.isArray(a.data)
                ? a.data.map((d: Record<string, any>) => stamp(d, tenantId))
                : stamp(a.data, tenantId);
              break;
            case 'upsert':
              a.create = stamp(a.create, tenantId);
              a.update = withoutTenantId(a.update);
              break;
            case 'update':
            case 'updateMany':
            case 'updateManyAndReturn':
              a.data = withoutTenantId(a.data);
              break;
          }

          return query(a as typeof args);
        },
      },
    },
  });
