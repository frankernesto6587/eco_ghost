import { IsString, IsArray, IsOptional } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class JoinOrgDto {
  @ApiProperty({ description: 'Invitation token of the organization to join' })
  @IsString()
  token: string;
}

export class RegenerateTokenDto {
  @ApiPropertyOptional({
    description: 'IDs of members to expel when regenerating the token',
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  expelMemberIds?: string[];
}
