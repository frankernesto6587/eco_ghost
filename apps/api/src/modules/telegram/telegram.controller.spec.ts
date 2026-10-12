import { ForbiddenException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TelegramController } from './telegram.controller';
import { TelegramService } from './telegram.service';

function controller(secret: string | undefined) {
  const service = { handleUpdate: jest.fn().mockResolvedValue(undefined) };
  const config = { get: (_key: string, def: string) => secret ?? def } as unknown as ConfigService;
  return { ctrl: new TelegramController(service as unknown as TelegramService, config), service };
}

describe('TelegramController webhook', () => {
  it('accepts an update with the right secret', async () => {
    const { ctrl, service } = controller('s3cret');
    await expect(ctrl.webhook({ update_id: 1 }, 's3cret')).resolves.toEqual({ ok: true });
    expect(service.handleUpdate).toHaveBeenCalled();
  });

  it('rejects a wrong or missing secret', async () => {
    const { ctrl, service } = controller('s3cret');
    await expect(ctrl.webhook({ update_id: 1 }, 'nope')).rejects.toBeInstanceOf(ForbiddenException);
    await expect(ctrl.webhook({ update_id: 1 })).rejects.toBeInstanceOf(ForbiddenException);
    expect(service.handleUpdate).not.toHaveBeenCalled();
  });

  it('fails closed when no secret is configured', async () => {
    const { ctrl, service } = controller(undefined);
    await expect(ctrl.webhook({ update_id: 1 })).rejects.toBeInstanceOf(ForbiddenException);
    expect(service.handleUpdate).not.toHaveBeenCalled();
  });

  it('no longer exposes webhook-info or set-webhook', () => {
    expect((TelegramController.prototype as any).getWebhookInfo).toBeUndefined();
    expect((TelegramController.prototype as any).setWebhook).toBeUndefined();
  });
});
