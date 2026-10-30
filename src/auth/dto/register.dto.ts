import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsOptional, IsString, MinLength } from 'class-validator';
import { i18nValidationMessage } from 'nestjs-i18n';

export class RegisterDto {
  @ApiProperty()
  @IsString({
    message: i18nValidationMessage('validation.TENANT_NAME_REQUIRED'),
  })
  @MinLength(2, {
    message: i18nValidationMessage('validation.TENANT_NAME_MIN_LENGTH'),
  })
  tenantName: string;

  @ApiProperty()
  @IsEmail({}, { message: i18nValidationMessage('validation.EMAIL_INVALID') })
  email: string;

  @ApiProperty()
  @IsString({ message: i18nValidationMessage('validation.PASSWORD_REQUIRED') })
  @MinLength(8, {
    message: i18nValidationMessage('validation.PASSWORD_MIN_LENGTH'),
  })
  password: string;

  @ApiProperty()
  @IsOptional()
  @IsString({ message: i18nValidationMessage('validation.NAME_INVALID') })
  name?: string;
}
