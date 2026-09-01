import { ApiPropertyOptional, ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsIn, IsOptional, IsString, Matches } from 'class-validator';
import { Transform } from 'class-transformer';
import { CURRENCY_CODES } from '@ecoghost/shared';
import { MONTH_RE } from './create-budget.dto';

const bool = () => Transform(({ value }) => value === true || value === 'true');

export class BudgetQueryDto {
  @ApiPropertyOptional({ example: 'MN' })
  @IsOptional()
  @IsString()
  @IsIn(CURRENCY_CODES)
  currency?: string;

  @ApiPropertyOptional({ example: '2026-08', description: 'Solo las reglas vigentes ese mes' })
  @IsOptional()
  @Matches(MONTH_RE, { message: 'month debe tener formato YYYY-MM' })
  month?: string;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @bool()
  @IsBoolean()
  includeInactive?: boolean;
}

export class BudgetProgressQueryDto {
  @ApiProperty({ example: 'MN' })
  @IsString()
  @IsIn(CURRENCY_CODES, { message: `currency debe ser una de: ${CURRENCY_CODES.join(', ')}` })
  currency: string;

  @ApiPropertyOptional({ example: '2026-08', description: 'Por defecto, el mes actual en APP_TZ' })
  @IsOptional()
  @Matches(MONTH_RE, { message: 'month debe tener formato YYYY-MM' })
  month?: string;
}
