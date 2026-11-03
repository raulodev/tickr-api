import { ApiProperty } from '@nestjs/swagger';
import {
  IssuePriority,
  IssueStatus,
} from '../../generated/prisma/client.js';

export class IssueResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  tenantId!: string;

  @ApiProperty()
  projectId!: string;

  @ApiProperty()
  number!: number;

  @ApiProperty()
  key!: string;

  @ApiProperty()
  title!: string;

  @ApiProperty({ type: String, nullable: true })
  description!: string | null;

  @ApiProperty({ enum: IssueStatus, enumName: 'IssueStatus' })
  status!: IssueStatus;

  @ApiProperty({ enum: IssuePriority, enumName: 'IssuePriority' })
  priority!: IssuePriority;

  @ApiProperty()
  reporterId!: string;

  @ApiProperty({ type: String, nullable: true })
  assigneeId!: string | null;

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt!: Date;

  @ApiProperty({ type: String, format: 'date-time' })
  updatedAt!: Date;
}
