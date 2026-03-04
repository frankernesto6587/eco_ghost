import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_FILTER } from '@nestjs/core';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { OrganizationsModule } from './modules/organizations/organizations.module';
import { AccountsModule } from './modules/accounts/accounts.module';
import { TransactionsModule } from './modules/transactions/transactions.module';
import { CategoriesModule } from './modules/categories/categories.module';
import { DebtsModule } from './modules/debts/debts.module';
import { DashboardModule } from './modules/dashboard/dashboard.module';
import { TelegramModule } from './modules/telegram/telegram.module';
import { GlobalExceptionFilter } from './common/filters';

@Module({
  imports: [
    // Load .env file globally
    ConfigModule.forRoot({ isGlobal: true }),

    // Global Prisma access
    PrismaModule,

    // Feature modules
    AuthModule,
    UsersModule,
    OrganizationsModule,
    AccountsModule,
    TransactionsModule,
    CategoriesModule,
    DebtsModule,
    DashboardModule,
    TelegramModule,
  ],
  providers: [
    // Global exception filter for consistent error responses
    {
      provide: APP_FILTER,
      useClass: GlobalExceptionFilter,
    },
  ],
})
export class AppModule {}
