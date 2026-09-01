import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsInt, IsOptional, IsString, Matches, Min } from 'class-validator';
import { MONTH_RE } from './create-budget.dto';

/**
 * `categoryId` y `currency` NO son editables: cambiarlos convertiria el
 * presupuesto en otro distinto y burlaria la validacion de solapamiento
 * hecha al crearlo. Para eso se cierra el vigente y se crea uno nuevo.
 */
export class UpdateBudgetDto {
  @ApiPropertyOptional({ example: 2000000 })
  @IsOptional()
  @IsInt()
  @Min(1)
  amount?: number;

  @ApiPropertyOptional({ example: '2026-03', description: 'Cerrar la regla vigente' })
  @IsOptional()
  @Matches(MONTH_RE, { message: 'endMonth debe tener formato YYYY-MM' })
  endMonth?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  rollover?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
