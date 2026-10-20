import { Module } from '@nestjs/common';
import { AnalyticsController } from './analytics.controller';
import { AnalyticsService } from './analytics.service';
import { ValuationModule } from '../valuation/valuation.module';

// PrismaModule es global (app.module.ts), no hace falta importarlo aqui.
@Module({
  imports: [ValuationModule],
  controllers: [AnalyticsController],
  providers: [AnalyticsService],
  exports: [AnalyticsService],
})
export class AnalyticsModule {}
