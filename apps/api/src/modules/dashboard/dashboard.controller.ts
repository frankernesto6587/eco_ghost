import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsDateString } from 'class-validator';
import { DashboardService } from './dashboard.service';
import { OrgId } from '../../common/decorators';
import { RolesGuard } from '../../common/guards';

export class DashboardQueryDto {
  @ApiPropertyOptional({ example: '2026-01-01' })
  @IsOptional()
  @IsDateString()
  from?: string;

  @ApiPropertyOptional({ example: '2026-01-31' })
  @IsOptional()
  @IsDateString()
  to?: string;
}

@ApiTags('dashboard')
@ApiBearerAuth()
@UseGuards(RolesGuard)
@Controller('dashboard')
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get('overview')
  getOverview(@OrgId() orgId: string, @Query() query: DashboardQueryDto) {
    return this.dashboardService.getOverview(orgId, query.from, query.to);
  }
}
