import { Module } from '@nestjs/common';
import { DashboardController } from './dashboard.controller';
import { DashboardService } from './dashboard.service';
import { ValuationModule } from '../valuation/valuation.module';

@Module({
  imports: [ValuationModule],
  controllers: [DashboardController],
  providers: [DashboardService],
})
export class DashboardModule {}
