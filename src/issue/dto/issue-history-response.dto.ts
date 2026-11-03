import { ApiProperty } from '@nestjs/swagger';
import { IssueEventType } from '../../generated/prisma/client.js';
import { PaginationMetaDto } from '../../common/dto/pagination-meta.dto.js';

export class IssueEventActorResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty({ type: String, nullable: true })
  name!: string | null;

  @ApiProperty()
  email!: string;
}

export class IssueEventResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  seq!: number;

  @ApiProperty()
  tenantId!: string;

  @ApiProperty()
  issueId!: string;

  @ApiProperty()
  actorId!: string;

  @ApiProperty({ enum: IssueEventType, enumName: 'IssueEventType' })
  type!: IssueEventType;

  @ApiProperty({ type: String, nullable: true })
  oldValue!: string | null;

  @ApiProperty({ type: String, nullable: true })
  newValue!: string | null;

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt!: Date;

  @ApiProperty({ type: IssueEventActorResponseDto })
  actor!: IssueEventActorResponseDto;
}

export class IssueHistoryResponseDto {
  @ApiProperty({ type: [IssueEventResponseDto] })
  data!: IssueEventResponseDto[];

  @ApiProperty({ type: PaginationMetaDto })
  meta!: PaginationMetaDto;
}
