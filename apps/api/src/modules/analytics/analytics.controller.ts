import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { AnalyticsService } from './analytics.service';
import { OrgId } from '../../common/decorators';
import { RolesGuard } from '../../common/guards';
import {
  AnalyticsRecurringQueryDto,
  AnalyticsSummaryQueryDto,
  AnalyticsTrendQueryDto,
  TopCategoriesQueryDto,
} from './dto';

/**
 * Lectura para cualquier miembro de la org: sin `@Roles()`, igual que el dashboard.
 * `RolesGuard` resuelve el tenant; `@OrgId()` falla cerrado si falta la cabecera.
 */
@ApiTags('analytics')
@ApiBearerAuth()
@UseGuards(RolesGuard)
@Controller('analytics')
export class AnalyticsController {
  constructor(private readonly analyticsService: AnalyticsService) {}

  @Get('summary')
  @ApiOperation({ summary: 'Ranking por categoria, comparativa vs periodo anterior y calidad de datos' })
  getSummary(@OrgId() orgId: string, @Query() query: AnalyticsSummaryQueryDto) {
    return this.analyticsService.getSummary(orgId, query);
  }

  @Get('top-categories')
  @ApiOperation({ summary: 'Top N categorias de gasto — version ligera para el widget del dashboard' })
  getTopCategories(@OrgId() orgId: string, @Query() query: TopCategoriesQueryDto) {
    return this.analyticsService.getTopCategories(orgId, query);
  }

  @Get('trend')
  @ApiOperation({ summary: 'Serie mensual de ingresos/gastos/neto (rango propio en meses moviles)' })
  getTrend(@OrgId() orgId: string, @Query() query: AnalyticsTrendQueryDto) {
    return this.analyticsService.getTrend(orgId, query);
  }

  @Get('recurring')
  @ApiOperation({ summary: 'Gastos repetidos, agrupados por descripcion normalizada (heuristica)' })
  getRecurring(@OrgId() orgId: string, @Query() query: AnalyticsRecurringQueryDto) {
    return this.analyticsService.getRecurring(orgId, query);
  }
}
