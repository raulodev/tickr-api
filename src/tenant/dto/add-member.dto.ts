import { IsEmail, IsEnum, IsOptional } from 'class-validator';
import { i18nValidationMessage } from 'nestjs-i18n';
import { ApiProperty } from '@nestjs/swagger';
import { Role } from '../../generated/prisma/client.js';

export class AddMemberDto {
  @ApiProperty()
  @IsEmail({}, { message: i18nValidationMessage('validation.EMAIL_INVALID') })
  email: string;

  @ApiProperty()
  @IsOptional()
  @IsEnum(Role, { message: i18nValidationMessage('validation.ROLE_INVALID') })
  role?: Role;
}
