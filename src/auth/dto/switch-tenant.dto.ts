import { IsUUID } from 'class-validator';
import { i18nValidationMessage } from 'nestjs-i18n';
import { ApiProperty } from '@nestjs/swagger';

export class SwitchTenantDto {
  @ApiProperty()
  @IsUUID('all', {
    message: i18nValidationMessage('validation.TENANT_ID_INVALID'),
  })
  tenantId: string;
}
