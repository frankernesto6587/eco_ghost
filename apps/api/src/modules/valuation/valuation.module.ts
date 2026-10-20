import { Module } from '@nestjs/common';
import { RatesService } from './rates.service';
import { ValuationController } from './valuation.controller';
import { ValuationService } from './valuation.service';

@Module({
  controllers: [ValuationController],
  providers: [ValuationService, RatesService],
  exports: [ValuationService],
})
export class ValuationModule {}
