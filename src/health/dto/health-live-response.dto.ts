import { ApiProperty } from '@nestjs/swagger';

export class HealthLiveResponseDto {
  @ApiProperty({ enum: ['ok'] })
  status!: 'ok';
}
