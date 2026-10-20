import { Module } from '@nestjs/common';
import { BudgetsController } from './budgets.controller';
import { BudgetsService } from './budgets.service';
import { AuditModule } from '../audit/audit.module';
import { ValuationModule } from '../valuation/valuation.module';

@Module({
  imports: [AuditModule, ValuationModule],
  controllers: [BudgetsController],
  providers: [BudgetsService],
  exports: [BudgetsService],
})
export class BudgetsModule {}
