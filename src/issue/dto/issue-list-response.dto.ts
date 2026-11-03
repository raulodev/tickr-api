import { ApiProperty } from '@nestjs/swagger';
import { PaginationMetaDto } from '../../common/dto/pagination-meta.dto.js';
import { IssueResponseDto } from './issue-response.dto.js';

export class IssueListResponseDto {
  @ApiProperty({ type: [IssueResponseDto] })
  data!: IssueResponseDto[];

  @ApiProperty({ type: PaginationMetaDto })
  meta!: PaginationMetaDto;
}
