import { ApiProperty } from '@nestjs/swagger';
import {
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';
import { i18nValidationMessage } from 'nestjs-i18n';

export class RefreshTokenDto {
  @ApiProperty()
  @IsString({
    message: i18nValidationMessage('validation.REFRESH_TOKEN_REQUIRED'),
  })
  @IsNotEmpty({
    message: i18nValidationMessage('validation.REFRESH_TOKEN_REQUIRED'),
  })
  @MaxLength(256, {
    message: i18nValidationMessage('validation.REFRESH_TOKEN_REQUIRED'),
  })
  refreshToken: string;
}

export class RefreshDto extends RefreshTokenDto {
  @ApiProperty()
  @IsOptional()
  @IsUUID('all', {
    message: i18nValidationMessage('validation.TENANT_ID_INVALID'),
  })
  tenantId?: string;
}
