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
import { DebtType } from '@prisma/client';

export class CreateDebtDto {
  @ApiProperty({ example: 'John Doe' })
  @IsString()
  @MinLength(1)
  personName: string;

  @ApiProperty({ example: 'Office equipment loan' })
  @IsString()
  @MinLength(1)
  description: string;

  @ApiProperty({ example: 100000, description: 'Total amount in centavos' })
  @IsInt()
  @Min(1)
  totalAmount: number;

  @ApiProperty({ enum: DebtType, example: DebtType.RECEIVABLE })
  @IsEnum(DebtType)
  type: DebtType;

  @ApiPropertyOptional({ example: '2026-06-30' })
  @IsOptional()
  @IsDateString()
  dueDate?: string;

  @ApiProperty({ example: 'clxyz456', description: 'Account for initial transaction' })
  @IsString()
  @MinLength(1)
  accountId: string;
}
