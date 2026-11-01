import { IsEnum } from 'class-validator';
import { i18nValidationMessage } from 'nestjs-i18n';
import { ApiProperty } from '@nestjs/swagger';
import { Role } from '../../generated/prisma/client.js';

export class ChangeRoleDto {
  @ApiProperty()
  @IsEnum(Role, { message: i18nValidationMessage('validation.ROLE_INVALID') })
  role: Role;
}
