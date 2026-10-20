import { BadRequestException, Body, Controller, Delete, Get, Param, Patch, Post, Put, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { CURRENCY_CODES } from '@ecoghost/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { CurrentUser, OrgId, Roles } from '../../common/decorators';
import { RolesGuard } from '../../common/guards';
import { dayKey } from '../../common/date-range.util';
import { RatesService } from './rates.service';
import { ValuationService } from './valuation.service';
import { RatesQueryDto, SetRatesDto, ValuationSettingsDto } from './dto';

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;

@ApiTags('valuation')
@ApiBearerAuth()
@UseGuards(RolesGuard)
@Controller()
export class ValuationController {
  constructor(
    private readonly valuation: ValuationService,
    private readonly rates: RatesService,
    private readonly prisma: PrismaService,
  ) {}

  @Get('valuation/status')
  @ApiOperation({ summary: 'Estado de la valoracion: tasas que faltan, estimados, deficits' })
  status(@OrgId() orgId: string) {
    return this.valuation.status(orgId);
  }

  @Get('valuation/patrimony')
  @ApiOperation({ summary: 'Patrimonio en la moneda de estadisticas: a costo y a tasa de hoy' })
  patrimony(@OrgId() orgId: string) {
    return this.valuation.patrimony(orgId);
  }

  @Get('valuation/transactions/:id')
  @ApiOperation({ summary: 'De que cambios (lotes) sale el valor de un movimiento' })
  breakdown(@OrgId() orgId: string, @Param('id') id: string) {
    return this.valuation.breakdown(orgId, id);
  }

  @Patch('valuation/settings')
  @Roles(Role.OWNER)
  @ApiOperation({ summary: 'Activar la valoracion y elegir la moneda de estadisticas' })
  async settings(@OrgId() orgId: string, @CurrentUser('id') userId: string, @Body() dto: ValuationSettingsDto) {
    const before = await this.prisma.organization.findUniqueOrThrow({ where: { id: orgId }, select: { valuationEnabled: true, reportCurrency: true, closedThrough: true } });
    // Con meses cerrados, cambiar la moneda cambiaria sus numeros congelados.
    if (dto.reportCurrency !== undefined && dto.reportCurrency !== before.reportCurrency && before.closedThrough) {
      throw new BadRequestException('Hay meses cerrados: reábrelos antes de cambiar la moneda de estadísticas');
    }
    const org = await this.prisma.organization.update({
      where: { id: orgId },
      data: {
        ...(dto.enabled !== undefined && { valuationEnabled: dto.enabled }),
        ...(dto.reportCurrency !== undefined && { reportCurrency: dto.reportCurrency }),
        valuationFingerprint: null,
      },
      select: { valuationEnabled: true, reportCurrency: true },
    });
    await this.prisma.auditLog.create({ data: { action: 'VALUATION_SETTINGS', entity: 'Organization', entityId: orgId, changes: { before, after: org }, userId, orgId } });
    // Al activar, bajar en segundo plano las tasas desde el primer movimiento.
    if (org.valuationEnabled) this.rates.syncEnabledOrgs().catch(() => undefined);
    return org;
  }

  @Post('valuation/recompute')
  @Roles(Role.OWNER, Role.ADMIN)
  @ApiOperation({ summary: 'Recalcular ya (normalmente se hace solo al leer)' })
  async recompute(@OrgId() orgId: string) {
    const org = await this.prisma.organization.findUniqueOrThrow({ where: { id: orgId }, select: { reportCurrency: true } });
    await this.valuation.recompute(orgId, org.reportCurrency);
    return this.valuation.status(orgId);
  }

  @Post('valuation/months/:month/close')
  @Roles(Role.OWNER, Role.ADMIN)
  @ApiOperation({ summary: 'Cerrar hasta un mes: no se anota ni cambia nada en el y sus valores quedan congelados' })
  close(@OrgId() orgId: string, @CurrentUser('id') userId: string, @Param('month') month: string) {
    if (!MONTH.test(month)) throw new BadRequestException('month debe ser YYYY-MM');
    return this.valuation.closeMonth(orgId, userId, month);
  }

  @Post('valuation/months/:month/reopen')
  @Roles(Role.OWNER)
  @ApiOperation({ summary: 'Reabrir desde un mes (incluido)' })
  reopen(@OrgId() orgId: string, @CurrentUser('id') userId: string, @Param('month') month: string) {
    if (!MONTH.test(month)) throw new BadRequestException('month debe ser YYYY-MM');
    return this.valuation.reopenMonth(orgId, userId, month);
  }

  @Get('rates')
  @ApiOperation({ summary: 'Tasas por dia: las de elTOQUE y las corregidas a mano' })
  list(@OrgId() orgId: string, @Query() q: RatesQueryDto) {
    return this.rates.list(orgId, q.from, q.to);
  }

  @Put('rates/:day')
  @Roles(Role.OWNER, Role.ADMIN)
  @ApiOperation({ summary: 'Poner o corregir la tasa de un dia (MN por unidad)' })
  async set(@OrgId() orgId: string, @CurrentUser('id') userId: string, @Param('day') day: string, @Body() dto: SetRatesDto) {
    if (!DAY.test(day) || day > dayKey(new Date())) throw new BadRequestException('day debe ser YYYY-MM-DD y no futuro');
    await this.assertDayOpen(orgId, day);
    for (const [c, v] of Object.entries(dto.rates)) {
      if (!CURRENCY_CODES.includes(c) || c === 'MN') throw new BadRequestException(`Moneda ${c} no valida`);
      if (typeof v !== 'number' || !(v > 0) || v > 1_000_000) throw new BadRequestException(`Tasa de ${c} no valida`);
    }
    await this.rates.setOverride(orgId, userId, day, dto.rates);
    return this.rates.list(orgId, day, day);
  }

  @Delete('rates/:day/:currency')
  @Roles(Role.OWNER, Role.ADMIN)
  @ApiOperation({ summary: 'Quitar una tasa puesta a mano (vuelve la de elTOQUE)' })
  async remove(@OrgId() orgId: string, @CurrentUser('id') userId: string, @Param('day') day: string, @Param('currency') currency: string) {
    await this.assertDayOpen(orgId, day);
    await this.rates.deleteOverride(orgId, userId, day, currency);
    return this.rates.list(orgId, day, day);
  }

  /** La tasa de un dia de un mes cerrado no se toca: cambiaria sus valores congelados. */
  private async assertDayOpen(orgId: string, day: string) {
    const org = await this.prisma.organization.findUniqueOrThrow({ where: { id: orgId }, select: { closedThrough: true } });
    if (org.closedThrough && day.slice(0, 7) <= org.closedThrough) {
      throw new BadRequestException(`El mes ${day.slice(0, 7)} está cerrado`);
    }
  }
}
