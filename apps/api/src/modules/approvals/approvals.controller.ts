import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { CurrentUser, OrgId, OrgRole, Roles } from '../../common/decorators';
import { RolesGuard } from '../../common/guards';
import { UpdateTransactionDto } from '../transactions/dto';
import { ApprovalsService } from './approvals.service';
import { ApprovalQueryDto, ApproveDto, RejectDto } from './dto';

@ApiTags('approvals')
@ApiBearerAuth()
@UseGuards(RolesGuard)
@Controller('approvals')
export class ApprovalsController {
  constructor(private readonly approvals: ApprovalsService) {}

  @Get()
  @ApiOperation({ summary: 'Bandeja: lo que espera revision (review) o lo que envie yo (mine)' })
  list(@OrgId() orgId: string, @CurrentUser('id') userId: string, @OrgRole() role: Role, @Query() q: ApprovalQueryDto) {
    return this.approvals.list(orgId, { userId, role }, q);
  }

  @Get('counts')
  @ApiOperation({ summary: 'Numeros para las insignias' })
  counts(@OrgId() orgId: string, @CurrentUser('id') userId: string, @OrgRole() role: Role) {
    return this.approvals.counts(orgId, { userId, role });
  }

  @Post(':id/approve')
  @Roles(Role.OWNER, Role.ADMIN)
  @ApiOperation({ summary: 'Aprobar, con correcciones opcionales' })
  approve(@OrgId() orgId: string, @CurrentUser('id') userId: string, @OrgRole() role: Role, @Param('id') id: string, @Body() dto: ApproveDto) {
    return this.approvals.approve(orgId, { userId, role }, id, dto.edits);
  }

  @Post(':id/reject')
  @Roles(Role.OWNER, Role.ADMIN)
  @ApiOperation({ summary: 'Rechazar con motivo' })
  reject(@OrgId() orgId: string, @CurrentUser('id') userId: string, @OrgRole() role: Role, @Param('id') id: string, @Body() dto: RejectDto) {
    return this.approvals.reject(orgId, { userId, role }, id, dto.reason);
  }

  @Patch(':id')
  @Roles(Role.OWNER, Role.ADMIN, Role.ACCOUNTANT)
  @ApiOperation({ summary: 'El autor corrige lo suyo pendiente o rechazado (un rechazado se reenvia)' })
  edit(@OrgId() orgId: string, @CurrentUser('id') userId: string, @OrgRole() role: Role, @Param('id') id: string, @Body() dto: UpdateTransactionDto) {
    return this.approvals.edit(orgId, { userId, role }, id, dto);
  }

  @Post(':id/resubmit')
  @Roles(Role.OWNER, Role.ADMIN, Role.ACCOUNTANT)
  @ApiOperation({ summary: 'Reenviar un rechazado sin cambios' })
  resubmit(@OrgId() orgId: string, @CurrentUser('id') userId: string, @OrgRole() role: Role, @Param('id') id: string) {
    return this.approvals.resubmit(orgId, { userId, role }, id);
  }

  @Post(':id/withdraw')
  @Roles(Role.OWNER, Role.ADMIN, Role.ACCOUNTANT)
  @ApiOperation({ summary: 'Retirar lo mio pendiente o rechazado' })
  withdraw(@OrgId() orgId: string, @CurrentUser('id') userId: string, @OrgRole() role: Role, @Param('id') id: string) {
    return this.approvals.withdraw(orgId, { userId, role }, id);
  }
}
