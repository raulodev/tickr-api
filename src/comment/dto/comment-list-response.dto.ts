import { ApiProperty } from '@nestjs/swagger';
import { PaginationMetaDto } from '../../common/dto/pagination-meta.dto.js';
import { CommentResponseDto } from './comment-response.dto.js';

export class CommentListResponseDto {
  @ApiProperty({ type: [CommentResponseDto] })
  data!: CommentResponseDto[];

  @ApiProperty({ type: PaginationMetaDto })
  meta!: PaginationMetaDto;
}
