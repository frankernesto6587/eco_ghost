import { Module } from '@nestjs/common';
import { TransactionsController } from './transactions.controller';
import { TransactionsService } from './transactions.service';
import { AuditModule } from '../audit/audit.module';
import { ValuationModule } from '../valuation/valuation.module';

@Module({
  imports: [AuditModule, ValuationModule],
  controllers: [TransactionsController],
  providers: [TransactionsService],
  exports: [TransactionsService],
})
export class TransactionsModule {}
