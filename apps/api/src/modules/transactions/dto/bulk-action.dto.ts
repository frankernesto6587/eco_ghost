import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsOptional, IsString, MinLength } from 'class-validator';

export class BulkUpdateDto {
  @ApiProperty({ example: ['clxyz123', 'clxyz456'] })
  @IsArray()
  @IsString({ each: true })
  ids: string[];

  @ApiPropertyOptional({ example: 'clxyz789' })
  @IsOptional()
  @IsString()
  categoryId?: string;

  @ApiPropertyOptional({ example: 'clxyz000' })
  @IsOptional()
  @IsString()
  accountId?: string;
}

export class BulkDeleteDto {
  @ApiProperty({ example: ['clxyz123', 'clxyz456'] })
  @IsArray()
  @IsString({ each: true })
  ids: string[];

  @ApiProperty({ example: 'Duplicate entries' })
  @IsString()
  @MinLength(1)
  reason: string;
}
