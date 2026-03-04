import { Global, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import { TelegramController } from './telegram.controller';
import { TelegramService } from './telegram.service';

@Global()
@Module({
  imports: [ConfigModule],
  controllers: [TelegramController],
  providers: [PrismaService, TelegramService],
  exports: [TelegramService],
})
export class TelegramModule {}
