import { ApiProperty } from '@nestjs/swagger';
import { Role } from '../../generated/prisma/client.js';
import { AuthSessionResponseDto } from './auth-session-response.dto.js';

export class AuthOrganizationResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty()
  slug!: string;

  @ApiProperty({ enum: Role, enumName: 'Role' })
  role!: Role;
}

export class AuthLoginResponseDto extends AuthSessionResponseDto {
  @ApiProperty({ type: [AuthOrganizationResponseDto] })
  organizations!: AuthOrganizationResponseDto[];
}
