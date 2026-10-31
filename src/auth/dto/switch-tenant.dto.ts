import { IsUUID } from 'class-validator';
import { i18nValidationMessage } from 'nestjs-i18n';

export class SwitchTenantDto {
  @IsUUID('all', {
    message: i18nValidationMessage('validation.TENANT_ID_INVALID'),
  })
  tenantId: string;
}
