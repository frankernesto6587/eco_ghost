import { Button, Form, type FormInstance } from 'antd';
import { useQuery } from '@tanstack/react-query';
import dayjs, { type Dayjs } from 'dayjs';
import { valuationService } from '@/services/valuation.service';
import { useAuthStore } from '@/store/auth.store';

const num = (v: number) => new Intl.NumberFormat('es-ES', { maximumFractionDigits: 2 }).format(v);
const cents = (v: number) => new Intl.NumberFormat('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v);

/**
 * Bajo "lo que se recibe" de un cambio: la tasa de elTOQUE de ese dia (o la
 * ultima anterior), cuanto se aparta el cambio de ella y un boton para
 * rellenar lo que se recibe a esa tasa. Lee del formulario los campos
 * accountId, toAccountId, amount, toAmount y date.
 */
export function ExchangeRateHint({ form, accounts }: { form: FormInstance; accounts: { id: string; currency: string }[] }) {
  const orgId = useAuthStore((s) => s.currentOrg?.id);
  const from = accounts.find((a) => a.id === Form.useWatch('accountId', form))?.currency;
  const to = accounts.find((a) => a.id === Form.useWatch('toAccountId', form))?.currency;
  const amount: number | null | undefined = Form.useWatch('amount', form);
  const toAmount: number | null | undefined = Form.useWatch('toAmount', form);
  const date: Dayjs | undefined = Form.useWatch('date', form);
  const day = date?.format('YYYY-MM-DD');
  const ready = !!from && !!to && from !== to && !!day;

  const q = useQuery({
    queryKey: ['analytics', 'rates', 'suggest', orgId, day],
    queryFn: () => valuationService.suggest(day!),
    enabled: ready && !!orgId,
    staleTime: 5 * 60_000,
  });
  if (!ready || !q.data) return null;

  // Las tasas van en MN por unidad; el MN vale 1.
  const rateOf = (c: string) => (c === 'MN' ? null : q.data.rates[c]);
  const ra = rateOf(from);
  const rb = rateOf(to);
  const mnA = from === 'MN' ? 1 : ra?.value;
  const mnB = to === 'MN' ? 1 : rb?.value;
  const style = { margin: '-12px 0 16px', fontSize: 12, color: 'var(--eco-fg3)', display: 'flex', flexWrap: 'wrap' as const, gap: '2px 8px', alignItems: 'center' };
  if (!mnA || !mnB) {
    return <div style={style}>elTOQUE no tiene tasa de {from === 'MN' ? to : from} para ese día ni el mes anterior.</div>;
  }

  const per = mnA / mnB; // unidades de `to` por 1 de `from`
  // "1 <la que mas vale> = N <la otra>", sea cual sea el sentido del cambio
  const quote = (k: number) => (k >= 1 ? `1 ${from} = ${num(k)} ${to}` : `1 ${to} = ${num(1 / k)} ${from}`);
  const used = [ra, rb].filter((r): r is NonNullable<typeof r> => !!r);
  const rateDay = used.map((r) => r.day).sort()[0];
  const manual = used.some((r) => r.source === 'MANUAL');
  const source = `${manual ? 'Tasa' : 'elTOQUE'} del ${dayjs(rateDay).format('DD/MM')}${rateDay < day ? ' (la última)' : ''}${manual ? ', puesta a mano' : ''}`;

  const suggested = amount && amount > 0 ? Math.round(amount * per * 100) / 100 : null;
  const diff = amount && amount > 0 && toAmount && toAmount > 0 ? toAmount / (amount * per) - 1 : null;
  return (
    <div style={style}>
      <span>{source}: {quote(per)}</span>
      {diff !== null && (
        <span>
          · el tuyo: {quote(toAmount! / amount!)},{' '}
          {Math.abs(diff) < 0.0005 ? 'igual' : `${new Intl.NumberFormat('es-ES', { maximumFractionDigits: 1 }).format(Math.abs(diff) * 100)} % ${diff > 0 ? 'más' : 'menos'}`}
        </span>
      )}
      {suggested !== null && suggested !== toAmount && (
        <Button type="link" size="small" style={{ padding: 0, height: 'auto', fontSize: 12 }} onClick={() => form.setFieldValue('toAmount', suggested)}>
          Usar: {cents(suggested)} {to}
        </Button>
      )}
    </div>
  );
}
