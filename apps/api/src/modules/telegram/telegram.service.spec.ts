import { TelegramService } from './telegram.service';

// Los botones del bot (Confirmar, categoria, pagina) buscan el gasto a medio
// confirmar en memoria. Si esa busqueda falla, ningun gasto por Telegram se guarda.
describe('TelegramService: gastos a medio confirmar', () => {
  const chat = { id: -100, type: 'group' };
  const press = (data: string) => ({ callback_query: { id: 'q1', data, message: { message_id: 7, chat } } });
  const pendingExpense = (createdAt = Date.now()) => ({
    createdAt,
    amount: 640000,
    description: 'agro',
    orgId: 'org',
    userId: 'lidice',
    accountId: 'acc',
    accountName: 'Efectivo MN',
    currency: 'MN',
    botMessageId: 7,
    chatId: chat.id,
  });

  let service: any;
  beforeEach(() => {
    service = new TelegramService({} as any, { get: () => '' } as any);
    jest.spyOn(service, 'answerCallbackQuery').mockResolvedValue(undefined);
    jest.spyOn(service, 'deleteMessage').mockResolvedValue(undefined);
  });

  it('Confirmar pasa a elegir la categoria', async () => {
    const pending = pendingExpense();
    service.pendingExpenses.set('-100:7', pending);
    const show = jest.spyOn(service, 'showParentCategories').mockResolvedValue(undefined);

    await service.handleUpdate(press('exp_confirm'));

    expect(show).toHaveBeenCalledWith(-100, 7, pending, 0);
  });

  it('elegir la categoria guarda el gasto y lo quita de memoria', async () => {
    const pending = pendingExpense();
    service.pendingExpenses.set('-100:7', pending);
    const save = jest.spyOn(service, 'saveExpense').mockResolvedValue(undefined);

    await service.handleUpdate(press('exp_cat:mercado'));

    expect(save).toHaveBeenCalledWith(pending, 'mercado', -100, 7);
    expect(service.pendingExpenses.has('-100:7')).toBe(false);
  });

  it('pasados 15 minutos, avisa de que expiro y no guarda nada', async () => {
    service.pendingExpenses.set('-100:7', pendingExpense(Date.now() - 16 * 60 * 1000));
    const save = jest.spyOn(service, 'saveExpense').mockResolvedValue(undefined);

    await service.handleUpdate(press('exp_cat:mercado'));

    expect(save).not.toHaveBeenCalled();
    expect(service.answerCallbackQuery).toHaveBeenCalledWith('q1', 'Operacion expirada');
    expect(service.pendingExpenses.has('-100:7')).toBe(false);
  });
});
