import {
  Controller,
  Post,
  Body,
  Headers,
  HttpCode,
  HttpStatus,
  ForbiddenException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiTags, ApiExcludeEndpoint } from '@nestjs/swagger';
import { Public } from '../../common/decorators';
import { TelegramService } from './telegram.service';

@ApiTags('Telegram')
@Controller('telegram')
export class TelegramController {
  private readonly webhookSecret: string;

  constructor(
    private readonly telegramService: TelegramService,
    private readonly config: ConfigService,
  ) {
    this.webhookSecret = this.config.get<string>('TELEGRAM_WEBHOOK_SECRET', '');
  }

  @Public()
  @Post('webhook')
  @HttpCode(HttpStatus.OK)
  @ApiExcludeEndpoint()
  async webhook(
    @Body() update: Record<string, unknown>,
    @Headers('x-telegram-bot-api-secret-token') secretToken?: string,
  ) {
    // Fail closed: without a configured secret anyone could post fake updates
    if (!this.webhookSecret || secretToken !== this.webhookSecret) {
      throw new ForbiddenException();
    }

    await this.telegramService.handleUpdate(update as any);
    return { ok: true };
  }
}
