import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsDateString,
  IsInt,
  IsOptional,
  IsString,
  Min,
  MinLength,
} from 'class-validator';

export class AddPaymentDto {
  @ApiProperty({ example: 25000, description: 'Payment amount in centavos' })
  @IsInt()
  @Min(1)
  amount: number;

  @ApiProperty({ example: '2026-02-22' })
  @IsDateString()
  date: string;

  @ApiPropertyOptional({ example: 'First installment' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({ example: 'clxyz456' })
  @IsString()
  @MinLength(1)
  accountId: string;
}
