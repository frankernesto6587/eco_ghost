import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Min,
} from 'class-validator';
import { CURRENCY_CODES } from '@ecoghost/shared';

/** 'YYYY-MM'. String y no DateTime: elimina el problema de zona horaria y ordena lexicograficamente. */
export const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

export class CreateBudgetDto {
  @ApiPropertyOptional({
    example: 'clxyz123',
    description: 'null o ausente = presupuesto total de la moneda (todos los gastos)',
  })
  @IsOptional()
  @IsString()
  categoryId?: string | null;

  @ApiProperty({ example: 'MN' })
  @IsString()
  @IsIn(CURRENCY_CODES, { message: `currency debe ser una de: ${CURRENCY_CODES.join(', ')}` })
  currency: string;

  @ApiProperty({ example: 1500000, description: 'Tope en centavos' })
  @IsInt()
  @Min(1)
  amount: number;

  @ApiProperty({ example: '2026-08', description: 'Primer mes en que aplica' })
  @IsString()
  @Matches(MONTH_RE, { message: 'startMonth debe tener formato YYYY-MM' })
  startMonth: string;

  @ApiPropertyOptional({
    example: '2026-12',
    description: 'Ultimo mes inclusive. Ausente o null = abierto, se repite cada mes',
  })
  @IsOptional()
  @Matches(MONTH_RE, { message: 'endMonth debe tener formato YYYY-MM' })
  endMonth?: string | null;

  @ApiPropertyOptional({ default: false, description: 'Arrastrar sobrante al mes siguiente (fase 2)' })
  @IsOptional()
  @IsBoolean()
  rollover?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;
}
