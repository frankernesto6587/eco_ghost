import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Min,
  MinLength,
} from 'class-validator';
import { TransactionType } from '@prisma/client';

export class CreateTransactionDto {
  @ApiProperty({ example: '2026-02-22' })
  @IsDateString()
  date: string;

  @ApiProperty({ example: 'Monthly salary' })
  @IsString()
  @MinLength(1)
  description: string;

  @ApiProperty({ example: 500000, description: 'Amount in centavos' })
  @IsInt()
  @Min(1)
  amount: number;

  @ApiProperty({ enum: TransactionType, example: TransactionType.INCOME })
  @IsEnum(TransactionType)
  type: TransactionType;

  @ApiPropertyOptional({ example: 'Payment for February' })
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiPropertyOptional({ example: 'clxyz123' })
  @IsOptional()
  @IsString()
  categoryId?: string;

  @ApiProperty({ example: 'clxyz456' })
  @IsString()
  @MinLength(1)
  accountId: string;

  @ApiPropertyOptional({ example: 'clxyz789' })
  @IsOptional()
  @IsString()
  projectId?: string;

  @ApiPropertyOptional({ example: 'clxyz000' })
  @IsOptional()
  @IsString()
  debtId?: string;

  @ApiPropertyOptional({ example: 'clxyz111', description: 'Destination account for TRANSFER/EXCHANGE type' })
  @IsOptional()
  @IsString()
  toAccountId?: string;

  @ApiPropertyOptional({ example: 360000, description: 'Destination amount in centavos (EXCHANGE only)' })
  @IsOptional()
  @IsInt()
  @Min(1)
  toAmount?: number;
}
