import { ApiProperty } from '@nestjs/swagger';
import { Role } from '../../generated/prisma/client.js';

export class AuthUserResponseDto {
  @ApiProperty()
  sub!: string;

  @ApiProperty()
  tenantId!: string;

  @ApiProperty({ enum: Role, enumName: 'Role' })
  role!: Role;
}
