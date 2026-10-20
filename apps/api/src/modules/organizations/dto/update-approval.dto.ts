import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsObject, IsOptional } from 'class-validator';

export class UpdateMemberApprovalDto {
  @ApiProperty({ description: 'Lo que anota entra aprobado sin pasar por un admin' })
  @IsBoolean()
  autoApprove: boolean;

  @ApiPropertyOptional({
    example: { USD: 5000, MN: 2000000 },
    description: 'Topes por moneda, en centavos. Una moneda sin tope espera aprobacion; sin topes (o vacio), todo entra solo.',
  })
  @IsOptional()
  @IsObject()
  autoApproveLimits?: Record<string, number> | null;
}
