import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsIn, IsObject, IsOptional, Matches } from 'class-validator';
import { CURRENCY_CODES } from '@ecoghost/shared';

const DAY = /^\d{4}-\d{2}-\d{2}$/;

export class ValuationSettingsDto {
  @ApiPropertyOptional({ description: 'Activar la valoracion FIFO de la organizacion' })
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @ApiPropertyOptional({ example: 'USD', description: 'Moneda de las estadisticas principales' })
  @IsOptional()
  @IsIn(CURRENCY_CODES)
  reportCurrency?: string;
}

export class RatesQueryDto {
  @ApiProperty({ example: '2026-10-01' })
  @Matches(DAY, { message: 'from debe ser YYYY-MM-DD' })
  from: string;

  @ApiProperty({ example: '2026-10-31' })
  @Matches(DAY, { message: 'to debe ser YYYY-MM-DD' })
  to: string;
}

export class SetRatesDto {
  @ApiProperty({ example: { USD: 810, MLC: 560 }, description: 'MN por 1 unidad de cada moneda' })
  @IsObject()
  rates: Record<string, number>;
}
