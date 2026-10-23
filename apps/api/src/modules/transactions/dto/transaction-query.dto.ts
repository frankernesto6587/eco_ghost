import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsDateString,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
  IsArray,
  IsEnum,
  MaxLength,
} from 'class-validator';
import { Type, Transform } from 'class-transformer';
import { TransactionStatus } from '@prisma/client';

export class TransactionQueryDto {
  @ApiPropertyOptional({ example: '2026-01-01' })
  @IsOptional()
  @IsDateString()
  from?: string;

  @ApiPropertyOptional({ example: '2026-02-28' })
  @IsOptional()
  @IsDateString()
  to?: string;

  @ApiPropertyOptional({
    description: 'Solo transacciones SIN categoria. Tiene prioridad sobre categoryId.',
  })
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  uncategorized?: boolean;

  @ApiPropertyOptional({ description: 'Comma-separated types: INCOME,EXPENSE,TRANSFER,EXCHANGE' })
  @IsOptional()
  @Transform(({ value }) => typeof value === 'string' ? value.split(',').filter(Boolean) : value)
  @IsArray()
  @IsString({ each: true })
  type?: string[];

  @ApiPropertyOptional({
    description: 'Comma-separated: PENDING,APPROVED,REJECTED. Por defecto APPROVED,PENDING (lo que el rol puede ver).',
  })
  @IsOptional()
  @Transform(({ value }) => typeof value === 'string' ? value.split(',').filter(Boolean) : value)
  @IsArray()
  @IsEnum(TransactionStatus, { each: true })
  status?: TransactionStatus[];

  @ApiPropertyOptional({ description: 'Comma-separated category IDs' })
  @IsOptional()
  @Transform(({ value }) => typeof value === 'string' ? value.split(',').filter(Boolean) : value)
  @IsArray()
  @IsString({ each: true })
  categoryId?: string[];

  @ApiPropertyOptional({ description: 'Comma-separated account IDs' })
  @IsOptional()
  @Transform(({ value }) => typeof value === 'string' ? value.split(',').filter(Boolean) : value)
  @IsArray()
  @IsString({ each: true })
  accountId?: string[];

  @ApiPropertyOptional({ example: 'USD', description: 'Filter by account currency' })
  @IsOptional()
  @IsString()
  currency?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  projectId?: string;

  @ApiPropertyOptional({
    example: 'cafe',
    description: 'Busca en descripcion, nota, categoria y cuenta, sin tildes; si es un importe (6400), tambien ese importe',
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  search?: string;

  @ApiPropertyOptional({ default: 1, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ default: 15, minimum: 1, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 15;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  deleted?: boolean;

  @ApiPropertyOptional({ example: 'date', description: 'Sort field: date | amount | description | createdAt' })
  @IsOptional()
  @IsString()
  sortBy?: string;

  @ApiPropertyOptional({ example: 'desc', description: 'Sort direction: asc | desc' })
  @IsOptional()
  @IsString()
  sortOrder?: 'asc' | 'desc';
}
