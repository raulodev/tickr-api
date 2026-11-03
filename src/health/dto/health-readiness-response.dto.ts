import { ApiProperty } from '@nestjs/swagger';

export class HealthChecksResponseDto {
  @ApiProperty({ enum: ['up', 'down'] })
  database!: 'up' | 'down';
}

export class HealthReadinessResponseDto {
  @ApiProperty({ enum: ['ok', 'error'] })
  status!: 'ok' | 'error';

  @ApiProperty({ type: HealthChecksResponseDto })
  checks!: HealthChecksResponseDto;
}
