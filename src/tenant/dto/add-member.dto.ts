import { IsEmail, IsEnum, IsOptional } from 'class-validator';
import { i18nValidationMessage } from 'nestjs-i18n';
import { Role } from '../../generated/prisma/client.js';

export class AddMemberDto {
  @IsEmail({}, { message: i18nValidationMessage('validation.EMAIL_INVALID') })
  email: string;

  @IsOptional()
  @IsEnum(Role, { message: i18nValidationMessage('validation.ROLE_INVALID') })
  role?: Role;
}
