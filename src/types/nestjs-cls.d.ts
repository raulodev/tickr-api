import 'nestjs-cls';

declare module 'nestjs-cls' {
  interface ClsStore {
    tenantId?: string;
  }
}
