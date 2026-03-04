import { IsEnum } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { Role } from '@prisma/client';

export class UpdateRoleDto {
  @ApiProperty({ description: 'New role for the member', enum: Role })
  @IsEnum(Role)
  role: Role;
}
