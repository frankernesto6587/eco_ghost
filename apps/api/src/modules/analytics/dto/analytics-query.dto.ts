import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  Min,
} from 'class-validator';
import { Type, Transform } from 'class-transformer';
import { CURRENCY_CODES } from '@ecoghost/shared';

/** Etiqueta de calendario. Se interpreta en APP_TZ, no en UTC. */
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

const csv = () =>
  Transform(({ value }) =>
    typeof value === 'string' ? value.split(',').filter(Boolean) : value,
  );

export class AnalyticsRangeDto {
  @ApiPropertyOptional({ example: '2026-08-01', description: 'Fecha inclusiva en APP_TZ' })
  @IsOptional()
  @Matches(DATE_ONLY, { message: 'from debe tener formato YYYY-MM-DD' })
  from?: string;

  @ApiPropertyOptional({ example: '2026-08-31', description: 'Fecha inclusiva en APP_TZ' })
  @IsOptional()
  @Matches(DATE_ONLY, { message: 'to debe tener formato YYYY-MM-DD' })
  to?: string;

  @ApiProperty({ example: 'MN', description: 'Obligatoria: el analisis nunca suma monedas distintas' })
  @IsString()
  @IsIn(CURRENCY_CODES, { message: `currency debe ser una de: ${CURRENCY_CODES.join(', ')}` })
  currency: string;

  @ApiPropertyOptional({ description: 'IDs de cuenta separados por coma' })
  @IsOptional()
  @csv()
  @IsArray()
  @IsString({ each: true })
  accountId?: string[];

  // ─── FASE 2 ───────────────────────────────────────────────────────
  // convertTo?: string;
  //
  // NO declarar hasta que el modulo ExchangeRate exista: con
  // `forbidNonWhitelisted: true` el ValidationPipe global rechaza con 400
  // cualquier query param no declarado, asi que el frontend tampoco debe
  // enviarlo antes de tiempo.
}

export class AnalyticsSummaryQueryDto extends AnalyticsRangeDto {
  @ApiPropertyOptional({ default: 8, minimum: 1, maximum: 25 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(25)
  topLimit?: number = 8;
}

export class TopCategoriesQueryDto extends AnalyticsRangeDto {
  @ApiPropertyOptional({ default: 5, minimum: 1, maximum: 10 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(10)
  limit?: number = 5;
}

/** La tendencia tiene rango propio (meses moviles), no el del selector. */
export class AnalyticsTrendQueryDto {
  @ApiProperty({ example: 'MN' })
  @IsString()
  @IsIn(CURRENCY_CODES, { message: `currency debe ser una de: ${CURRENCY_CODES.join(', ')}` })
  currency: string;

  @ApiPropertyOptional({ default: 12, minimum: 3, maximum: 36 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(3)
  @Max(36)
  months?: number = 12;

  @ApiPropertyOptional({ description: 'IDs de cuenta separados por coma' })
  @IsOptional()
  @csv()
  @IsArray()
  @IsString({ each: true })
  accountId?: string[];
}

export class AnalyticsRecurringQueryDto extends AnalyticsRangeDto {
  @ApiPropertyOptional({ default: 3, minimum: 2, maximum: 12 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(2)
  @Max(12)
  minCount?: number = 3;
}
