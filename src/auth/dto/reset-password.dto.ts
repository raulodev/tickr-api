import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength, MinLength } from 'class-validator';
import { TokenDto } from './token.dto.js';

export class ResetPasswordDto extends TokenDto {
  @ApiProperty({ minLength: 8, example: 'NewPass123!' })
  @IsString()
  @MinLength(8)
  @MaxLength(72)
  newPassword: string;
}
