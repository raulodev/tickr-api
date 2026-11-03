import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class TokenDto {
  @ApiProperty({ description: 'Token received by mail' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  token: string;
}
