import { IsString, MinLength, IsOptional } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateOrgDto {
  @ApiProperty({ description: 'Organization name', minLength: 2 })
  @IsString()
  @MinLength(2)
  name: string;

  @ApiPropertyOptional({
    description: 'Base currency code',
    default: 'USD',
  })
  @IsOptional()
  @IsString()
  baseCurrency: string = 'USD';
}
