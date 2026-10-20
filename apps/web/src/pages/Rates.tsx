import { useMemo, useState } from 'react';
import { Alert, App, Button, DatePicker, InputNumber, Modal, Select, Spin, Tag } from 'antd';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import dayjs, { type Dayjs } from 'dayjs';
import 'dayjs/locale/es';
import { valuationService } from '@/services/valuation.service';
import { useValuationStatus } from '@/hooks/useValuation';
import { usePermissions } from '@/hooks/usePermissions';
import { useAuthStore } from '@/store/auth.store';
import { invalidateMoneyQueries } from '@/lib/invalidateMoney';
import css from './Approvals.module.css';

const CURRENCIES = ['USD', 'EUR', 'MLC', 'USDT'];
const num = (v: number) => new Intl.NumberFormat('es-ES', { maximumFractionDigits: 2 }).format(v);
const hintRow = { display: 'flex', flexWrap: 'wrap' as const, gap: 8, alignItems: 'center', justifyContent: 'space-between' };

/**
 * Tasas de referencia (MN por unidad) y cierres de mes.
 *
 * Las tasas llegan solas de elTOQUE cada dia a las 7:30; aqui se ven, se
 * corrigen a mano y se ponen las que falten (el cuadro sugiere la de elTOQUE
 * de ese dia, o la ultima anterior; sin ellas, lo que entro en MN
 * ese dia queda sin valorar y los gastos de ese dia se valoran a mercado con
 * la tasa anterior, como estimados). Cerrar un mes congela sus numeros.
 */
export default function RatesPage() {
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const { canApprove, role } = usePermissions();
  const orgId = useAuthStore((s) => s.currentOrg?.id);
  const status = useValuationStatus().data;
  const [month, setMonth] = useState<Dayjs>(dayjs().startOf('month'));
  const [editing, setEditing] = useState<{ day: string; currency: string; value: number | null } | null>(null);
  const [closeTo, setCloseTo] = useState<string | null>(null);

  const from = month.startOf('month').format('YYYY-MM-DD');
  const to = month.endOf('month').format('YYYY-MM-DD');
  const ratesQuery = useQuery({
    queryKey: ['analytics', 'rates', orgId, from],
    queryFn: () => valuationService.rates(from, to),
    enabled: !!orgId,
  });

  const changed = (msg: string) => {
    message.success(msg);
    invalidateMoneyQueries(queryClient);
  };
  const failed = (e: unknown) => {
    const m = (e as { response?: { data?: { message?: string } } }).response?.data?.message;
    message.error(m ?? 'No se pudo completar');
  };
  const setRate = useMutation({
    mutationFn: ({ day, currency, value }: { day: string; currency: string; value: number }) =>
      valuationService.setRates(day, { [currency]: value }),
    onSuccess: () => { setEditing(null); changed('Tasa guardada'); },
    onError: failed,
  });
  const delRate = useMutation({
    mutationFn: ({ day, currency }: { day: string; currency: string }) => valuationService.deleteRate(day, currency),
    onSuccess: () => changed('Vuelve la tasa de elTOQUE'),
    onError: failed,
  });
  // elTOQUE a veces no publica o no responde: se le vuelve a pedir ese dia.
  const fetchRate = useMutation({
    mutationFn: (day: string) => valuationService.fetchRate(day),
    onSuccess: (r) => {
      if (r.found > 0) { setEditing(null); changed('Llegó la tasa de elTOQUE'); }
      else if (r.unavailable) message.warning('elTOQUE no responde ahora; prueba en un minuto');
      else message.info('elTOQUE no tiene tasa de ese día (publica a las 7:00)');
    },
    onError: failed,
  });
  const close = useMutation({
    mutationFn: (m: string) => valuationService.closeMonth(m),
    onSuccess: (r) => { setCloseTo(null); changed(`Cerrado hasta ${r.closedThrough}`); },
    onError: failed,
  });
  const reopen = useMutation({
    mutationFn: (m: string) => valuationService.reopenMonth(m),
    onSuccess: () => changed('Mes reabierto'),
    onError: failed,
  });

  const days = useMemo(() => {
    const byDay = new Map((ratesQuery.data ?? []).map((r) => [r.day, r]));
    const out = [];
    for (let d = month.startOf('month'); !d.isAfter(month.endOf('month'), 'day') && !d.isAfter(dayjs(), 'day'); d = d.add(1, 'day')) {
      const key = d.format('YYYY-MM-DD');
      out.push({ day: key, row: byDay.get(key) });
    }
    return out.reverse();
  }, [ratesQuery.data, month]);

  // Lo que se sugiere en el cuadro de una tasa: la de elTOQUE de ese dia y, si
  // no la hay, la ultima anterior.
  const editingRow = editing ? ratesQuery.data?.find((r) => r.day === editing.day) : undefined;
  const editingAuto = editing ? editingRow?.eltoque[editing.currency] : undefined;
  const editingManual = editing ? editingRow?.manual[editing.currency] : undefined;
  const dayBefore = editing ? dayjs(editing.day).subtract(1, 'day').format('YYYY-MM-DD') : null;
  const previous = useQuery({
    queryKey: ['analytics', 'rates', 'suggest', orgId, dayBefore],
    queryFn: () => valuationService.suggest(dayBefore!),
    enabled: !!dayBefore && editingAuto === undefined,
  }).data?.rates[editing?.currency ?? ''];

  const missing = status?.missingRates ?? [];
  const closed = status?.closedThrough ?? null;
  const isClosed = (day: string) => !!closed && day.slice(0, 7) <= closed;
  const lastMonths = Array.from({ length: 12 }, (_, i) => dayjs().subtract(i + 1, 'month').format('YYYY-MM'));

  return (
    <div className={css.page}>
      <header className={css.pageHead}>
        <div>
          <h1 className={css.pageTitle}>Tasas y cierres</h1>
          <div className={css.pageSub}>
            MN por 1 unidad · elTOQUE (7:00 de Cuba) · {status?.enabled ? `estadísticas en ${status.reportCurrency}` : 'valoración desactivada'}
          </div>
        </div>
        <DatePicker picker="month" value={month} onChange={(m) => m && setMonth(m)} allowClear={false} format={(v) => v.locale('es').format('MMMM YYYY')} />
      </header>

      {!status?.enabled && (
        <Alert type="info" showIcon style={{ marginBottom: 16 }} message="Activa las estadísticas en una sola moneda en Organización → Configuración para que estas tasas se usen." />
      )}

      {missing.length > 0 && (
        <Alert
          type="error"
          showIcon
          style={{ marginBottom: 16 }}
          message={`Faltan ${missing.length} tasas: lo que entró en esa moneda esos días queda sin valorar, y los gastos, estimados con la tasa anterior`}
          description={
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 8 }}>
              {missing.slice(0, 30).map((m) => (
                <Button key={`${m.day}${m.currency}`} size="small" disabled={!canApprove} onClick={() => setEditing({ day: m.day, currency: m.currency, value: null })}>
                  {dayjs(m.day).format('DD/MM/YYYY')} · {m.currency}
                </Button>
              ))}
            </div>
          }
        />
      )}

      {ratesQuery.isLoading ? (
        <div className={css.empty}><Spin /></div>
      ) : (
        <div style={{ overflowX: 'auto', border: '1px solid var(--eco-line)', borderRadius: 'var(--eco-radius)', background: 'var(--eco-surface)' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontVariantNumeric: 'tabular-nums', minWidth: 520 }}>
            <thead>
              <tr style={{ color: 'var(--eco-fg3)', fontSize: 12, textAlign: 'right' }}>
                <th style={{ textAlign: 'left', padding: '10px 14px' }}>Día</th>
                {CURRENCIES.map((c) => <th key={c} style={{ padding: '10px 14px' }}>{c}</th>)}
              </tr>
            </thead>
            <tbody>
              {days.map(({ day, row }) => (
                <tr key={day} style={{ borderTop: '1px solid var(--eco-line-soft)' }}>
                  <td style={{ padding: '8px 14px', whiteSpace: 'nowrap' }}>
                    {dayjs(day).locale('es').format('ddd DD/MM')} {isClosed(day) && <Tag style={{ marginLeft: 6 }}>cerrado</Tag>}
                  </td>
                  {CURRENCIES.map((c) => {
                    const manual = row?.manual[c];
                    const auto = row?.eltoque[c];
                    const value = manual ?? auto;
                    const needed = missing.some((m) => m.day === day && m.currency === c);
                    const editable = canApprove && !isClosed(day);
                    return (
                      <td key={c} style={{ padding: '8px 14px', textAlign: 'right', color: needed ? 'var(--eco-neg)' : undefined }}>
                        <span
                          style={{ cursor: editable ? 'pointer' : 'default', borderBottom: editable ? '1px dashed var(--eco-line)' : undefined }}
                          onClick={() => editable && setEditing({ day, currency: c, value: value ?? null })}
                          title={manual !== undefined ? `puesta a mano (elTOQUE: ${auto !== undefined ? num(auto) : '—'})` : 'elTOQUE'}
                        >
                          {value !== undefined ? num(value) : needed ? 'falta' : '—'}
                        </span>
                        {manual !== undefined && <Tag color="purple" style={{ marginLeft: 6, marginRight: 0 }}>a mano</Tag>}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <section className={css.notes}>
        <div className={css.notesTitle}>Cierre de mes</div>
        <p style={{ color: 'var(--eco-fg2)', marginTop: 0 }}>
          {closed ? `Cerrado hasta ${dayjs(`${closed}-01`).locale('es').format('MMMM YYYY')}.` : 'No hay meses cerrados.'} Un mes cerrado queda congelado: no se anota, cambia, aprueba
          ni se tocan sus tasas. Para cerrar no puede quedar nada por aprobar ni sin valorar.
        </p>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <Select
            style={{ width: 200 }}
            placeholder="Cerrar hasta…"
            value={closeTo}
            onChange={setCloseTo}
            disabled={!canApprove}
            options={lastMonths.filter((m) => !closed || m > closed).map((m) => ({ value: m, label: dayjs(`${m}-01`).locale('es').format('MMMM YYYY') }))}
          />
          <Button type="primary" disabled={!closeTo || !canApprove} loading={close.isPending} onClick={() => closeTo && close.mutate(closeTo)}>
            Cerrar
          </Button>
          {closed && role === 'OWNER' && (
            <Button
              onClick={() =>
                Modal.confirm({
                  title: `Reabrir ${dayjs(`${closed}-01`).locale('es').format('MMMM YYYY')}`,
                  content: 'Se podrá volver a anotar y cambiar ese mes, y sus valores se recalcularán. Queda en el historial.',
                  okText: 'Reabrir',
                  cancelText: 'Cancelar',
                  onOk: () => reopen.mutateAsync(closed),
                })
              }
            >
              Reabrir el último mes cerrado
            </Button>
          )}
        </div>
      </section>

      <Modal
        open={!!editing}
        title={editing ? `Tasa del ${dayjs(editing.day).format('DD/MM/YYYY')} · ${editing.currency}` : ''}
        okText="Guardar"
        cancelText="Cancelar"
        confirmLoading={setRate.isPending}
        okButtonProps={{ disabled: !editing?.value || editing.value <= 0 }}
        onCancel={() => setEditing(null)}
        onOk={() => editing?.value && setRate.mutate({ day: editing.day, currency: editing.currency, value: editing.value })}
        footer={(orig) => (
          <>
            {editing && editingManual !== undefined && editingAuto === undefined && (
              <Button danger onClick={() => { delRate.mutate({ day: editing.day, currency: editing.currency }); setEditing(null); }}>
                Quitar la mía
              </Button>
            )}
            {orig}
          </>
        )}
        destroyOnClose
      >
        <p style={{ color: 'var(--eco-fg3)' }}>Cuántos MN vale 1 {editing?.currency} ese día. Gana a la de elTOQUE y queda en el historial.</p>
        <InputNumber
          autoFocus
          style={{ width: '100%' }}
          min={0.01}
          addonAfter={`MN / ${editing?.currency ?? ''}`}
          value={editing?.value ?? undefined}
          onChange={(v) => editing && setEditing({ ...editing, value: typeof v === 'number' ? v : null })}
        />
        {editing && (
          <div style={{ display: 'grid', gap: 6, marginTop: 12, fontSize: 13, color: 'var(--eco-fg2)' }}>
            {editingAuto !== undefined ? (
              <div style={hintRow}>
                <span>elTOQUE ese día: <b>{num(editingAuto)} MN</b></span>
                {editingManual !== undefined ? (
                  <Button size="small" loading={delRate.isPending} onClick={() => delRate.mutate({ day: editing.day, currency: editing.currency }, { onSuccess: () => setEditing(null) })}>
                    Volver a la de elTOQUE
                  </Button>
                ) : editing.value !== editingAuto && (
                  <Button size="small" onClick={() => setEditing({ ...editing, value: editingAuto })}>Usar</Button>
                )}
              </div>
            ) : (
              <>
                <div style={hintRow}>
                  <span>elTOQUE no tiene la de ese día.</span>
                  <Button size="small" loading={fetchRate.isPending} onClick={() => fetchRate.mutate(editing.day)}>Traer de elTOQUE</Button>
                </div>
                {previous && (
                  <div style={hintRow}>
                    <span>
                      La última anterior, del {dayjs(previous.day).format('DD/MM')}{previous.source === 'MANUAL' ? ' (puesta a mano)' : ''}: <b>{num(previous.value)} MN</b>
                    </span>
                    {editing.value !== previous.value && (
                      <Button size="small" onClick={() => setEditing({ ...editing, value: previous.value })}>Usar</Button>
                    )}
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}
