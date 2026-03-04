import {
  Controller,
  Post,
  Get,
  Body,
  Headers,
  HttpCode,
  HttpStatus,
  ForbiddenException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiTags, ApiOperation, ApiExcludeEndpoint, ApiBearerAuth } from '@nestjs/swagger';
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
    // Validate webhook secret if configured
    if (this.webhookSecret && secretToken !== this.webhookSecret) {
      throw new ForbiddenException();
    }

    await this.telegramService.handleUpdate(update as any);
    return { ok: true };
  }

  @Get('webhook-info')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get current webhook info' })
  async getWebhookInfo() {
    return this.telegramService.getWebhookInfo();
  }

  @Post('set-webhook')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Set Telegram webhook URL' })
  async setWebhook(@Body() body: { url: string }) {
    return this.telegramService.setWebhook(body.url);
  }
}
