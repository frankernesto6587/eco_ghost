import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsString, MinLength } from 'class-validator';

export class CreateCategoryDto {
  @ApiProperty({ example: 'Food & Drink' })
  @IsString()
  @MinLength(1)
  name: string;

  @ApiPropertyOptional({ example: 'utensils' })
  @IsOptional()
  @IsString()
  icon?: string;

  @ApiPropertyOptional({ example: '#FF5733' })
  @IsOptional()
  @IsString()
  color?: string;

  @ApiPropertyOptional({
    default: false,
    description: 'Ajuste (saldo inicial, correccion): no cuenta como ingreso ni gasto',
  })
  @IsOptional()
  @IsBoolean()
  isAdjustment?: boolean;

  @ApiPropertyOptional({ example: 'clxyz123', description: 'Parent category ID' })
  @IsOptional()
  @IsString()
  parentId?: string;
}
