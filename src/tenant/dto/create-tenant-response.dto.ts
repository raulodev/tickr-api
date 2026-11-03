import { ApiProperty } from '@nestjs/swagger';
import { Role } from '../../generated/prisma/client.js';

export class TenantOrganizationResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty()
  slug!: string;

  @ApiProperty({ enum: Role, enumName: 'Role' })
  role!: Role;
}

export class CreateTenantResponseDto {
  @ApiProperty({ type: TenantOrganizationResponseDto })
  organization!: TenantOrganizationResponseDto;

  @ApiProperty()
  access_token!: string;
}
