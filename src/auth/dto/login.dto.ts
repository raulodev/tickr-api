import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsEnum, IsOptional, IsString } from 'class-validator';
import { i18nValidationMessage } from 'nestjs-i18n';
import { AuthProvider } from '../providers/base-auth.provider.js';

export class LoginDto {
  @ApiProperty()
  @IsEmail({}, { message: i18nValidationMessage('validation.EMAIL_INVALID') })
  email: string;

  @ApiProperty({ enum: AuthProvider })
  @IsEnum(AuthProvider, {
    message: i18nValidationMessage('validation.AUTH_PROVIDER_INVALID'),
  })
  provider: AuthProvider;

  @ApiProperty()
  @IsString()
  oAuthToken: string;

  @ApiProperty({ type: String, nullable: true, required: false })
  @IsString()
  @IsOptional()
  oAuthTokenSecret?: string;

  @ApiProperty({ type: String, nullable: true, required: false })
  @IsOptional()
  @IsString()
  name?: string;
}
