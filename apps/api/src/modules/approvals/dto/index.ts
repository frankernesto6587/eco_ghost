import { ApiPropertyOptional, ApiProperty } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { IsArray, IsEnum, IsIn, IsOptional, IsString, MinLength, ValidateNested } from 'class-validator';
import { TransactionStatus } from '@prisma/client';
import { UpdateTransactionDto } from '../../transactions/dto';

export class ApprovalQueryDto {
  @ApiPropertyOptional({ enum: ['review', 'mine'], default: 'review', description: 'review: lo que espera revision (propietario/admin). mine: lo que envie yo.' })
  @IsOptional()
  @IsIn(['review', 'mine'])
  scope?: 'review' | 'mine' = 'review';

  @ApiPropertyOptional({ description: 'Comma-separated: PENDING,REJECTED,APPROVED. Por defecto: review → PENDING; mine → PENDING,REJECTED' })
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.split(',').filter(Boolean) : value))
  @IsArray()
  @IsEnum(TransactionStatus, { each: true })
  status?: TransactionStatus[];
}

export class ApproveDto {
  @ApiPropertyOptional({ type: UpdateTransactionDto, description: 'Correcciones antes de aprobar (mismo formato que editar un movimiento)' })
  @IsOptional()
  @ValidateNested()
  @Type(() => UpdateTransactionDto)
  edits?: UpdateTransactionDto;
}

export class RejectDto {
  @ApiProperty({ example: 'Fue con la tarjeta, no en efectivo' })
  @IsString()
  @MinLength(3)
  reason: string;
}
