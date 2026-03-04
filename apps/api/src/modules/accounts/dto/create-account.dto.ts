import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString, MinLength } from 'class-validator';
import { AccountType } from '@prisma/client';

export class CreateAccountDto {
  @ApiProperty({ example: 'Main Bank Account', minLength: 1 })
  @IsString()
  @MinLength(1)
  name: string;

  @ApiProperty({ enum: AccountType, example: AccountType.BANK })
  @IsEnum(AccountType)
  type: AccountType;

  @ApiProperty({ example: 'USD' })
  @IsString()
  @MinLength(1)
  currency: string;

  @ApiPropertyOptional({ example: 'bank' })
  @IsOptional()
  @IsString()
  icon?: string;
}
