import { Drawer, Button, Popconfirm } from 'antd';
import { EditOutlined, DeleteOutlined } from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { formatCurrency } from '@/lib/formatters';
import { reportMoney, signedMoney, useValuationStatus } from '@/hooks/useValuation';
import { valuationService } from '@/services/valuation.service';
import dayjs from 'dayjs';
import css from './TransactionDrawer.module.css';

// The Transaction type - match what Transactions.tsx uses
export interface DrawerTransaction {
  id: string;
  date: string;
  description: string;
  amount: number;
  type: string; // 'INCOME' | 'EXPENSE' | 'TRANSFER' | 'EXCHANGE'
  notes: string | null;
  category: { id: string; name: string; icon: string | null; color: string | null } | null;
  account: { id: string; name: string; type: string; currency: string; icon: string | null };
  toAccount?: { id: string; name: string; currency: string } | null;
  toAmount?: number | null;
  linkedTransactionId?: string | null;
  createdAt?: string;
  updatedAt?: string;
  deleteReason?: string | null;
}

interface TransactionDrawerProps {
  transaction: DrawerTransaction | null;
  open: boolean;
  onClose: () => void;
  onEdit?: (tx: DrawerTransaction) => void;
  onDelete?: (tx: DrawerTransaction) => void;
  /** Edit/delete saved transactions (OWNER, ADMIN) */
  canEdit: boolean;
  isMobile?: boolean;
}

const TYPE_LABELS: Record<string, string> = {
  INCOME: 'Ingreso',
  EXPENSE: 'Gasto',
  TRANSFER: 'Transferencia',
  EXCHANGE: 'Cambio',
};

export default function TransactionDrawer({ transaction: tx, open, onClose, onEdit, onDelete, canEdit, isMobile }: TransactionDrawerProps) {
  if (!tx) return null;

  const currency = tx.account?.currency ?? 'USD';
  const isIncome = tx.type === 'INCOME';
  const isExpense = tx.type === 'EXPENSE';
  const isTransfer = tx.type === 'TRANSFER';
  const isExchange = tx.type === 'EXCHANGE';

  const amtClass = isIncome ? css.amtPos : isExpense ? css.amtNeg : css.amtNeu;
  const prefix = isIncome ? '+' : isExpense ? '\u2212' : '\u2194 ';

  const typeClass = isIncome ? css.typeBadgeInc : isExpense ? css.typeBadgeExp
    : isTransfer ? css.typeBadgeTr : css.typeBadgeFx;

  return (
    <Drawer
      open={open}
      onClose={onClose}
      placement={isMobile ? 'bottom' : 'right'}
      width={isMobile ? '100%' : 420}
      height={isMobile ? '85vh' : undefined}
      closable={false}
      styles={{
        body: { padding: 0, background: 'var(--eco-surface)', color: 'var(--eco-fg)', overflowY: 'auto' },
        header: { display: 'none' },
        wrapper: isMobile ? { borderRadius: '14px 14px 0 0', overflow: 'hidden' } : undefined,
      }}
    >
      {/* Header */}
      <div className={css.header}>
        <span className={`${css.typeBadge} ${typeClass}`}>
          <span className={css.typeDot} />
          {TYPE_LABELS[tx.type] ?? tx.type}
        </span>
        <span className={css.txId}>{tx.id.slice(0, 12)}</span>
        <button className={css.closeBtn} onClick={onClose} type="button">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 6l12 12M18 6 6 18" /></svg>
        </button>
      </div>

      {/* Body */}
      <div className={css.body}>
        {/* Amount */}
        <div className={`${css.amount} ${amtClass}`}>
          {prefix}{formatCurrency(Math.abs(tx.amount), currency)}
          <span className={css.amtCur}>{currency.toLowerCase()}</span>
        </div>
        {isExchange && tx.toAmount && tx.toAccount && (
          <div className={css.exchangeInfo}>
            &rarr; {formatCurrency(Math.abs(tx.toAmount), tx.toAccount.currency)} {tx.toAccount.currency.toLowerCase()}
          </div>
        )}
        <div className={css.desc}>{tx.description}</div>

        {/* Meta fields */}
        <dl className={css.meta}>
          <dt>Fecha</dt>
          <dd>{dayjs(tx.date).format('ddd DD MMM YYYY \u00B7 HH:mm')}</dd>

          <dt>Cuenta</dt>
          <dd>
            <span className={css.chip}>
              <span className={css.chipDot} style={{ background: 'var(--eco-accent)' }} />
              {tx.account.name}
            </span>
          </dd>

          {(isTransfer || isExchange) && tx.toAccount && (
            <>
              <dt>Cuenta destino</dt>
              <dd>
                <span className={css.chip}>
                  <span className={css.chipDot} style={{ background: 'var(--eco-pos)' }} />
                  {tx.toAccount.name}
                </span>
              </dd>
            </>
          )}

          {/* Transferencias y cambios no llevan categoria. */}
          {!isTransfer && !isExchange && (
            <>
              <dt>Categor&iacute;a</dt>
              <dd>
                {tx.category ? (
                  <span className={css.chip}>
                    <span className={css.chipDot} style={{ background: tx.category.color ?? 'var(--eco-fg4)' }} />
                    {tx.category.name}
                  </span>
                ) : (
                  <span className={css.dimmed}>sin categor&iacute;a</span>
                )}
              </dd>
            </>
          )}

          {tx.notes && (
            <>
              <dt>Notas</dt>
              <dd className={css.notes}>{tx.notes}</dd>
            </>
          )}

          {tx.createdAt && (
            <>
              <dt>Creado</dt>
              <dd>{dayjs(tx.createdAt).format('DD MMM YYYY \u00B7 HH:mm')}</dd>
            </>
          )}
        </dl>

        {(isExpense || isExchange) && <FxDetail txId={tx.id} currency={currency} />}
      </div>

      {/* Footer actions */}
      {canEdit && (
        <div className={css.footer}>
          {onEdit && (
            <Button icon={<EditOutlined />} onClick={() => onEdit(tx)}>
              Editar
            </Button>
          )}
          {onDelete && (
            <Popconfirm
              title="Eliminar transacci&oacute;n"
              description="&iquest;Est&aacute;s seguro?"
              onConfirm={() => onDelete(tx)}
              okText="Eliminar"
              cancelText="Cancelar"
            >
              <Button danger icon={<DeleteOutlined />}>
                Eliminar
              </Button>
            </Popconfirm>
          )}
        </div>
      )}
    </Drawer>
  );
}

const num = (v: number) => new Intl.NumberFormat('es-ES', { maximumFractionDigits: 2 }).format(v);

/**
 * El gasto (o la venta) en la moneda de estadisticas, como la NIC 21: a
 * mercado del dia, lo que costo por FIFO y, entre los dos, la diferencia de
 * cambio partida en "por cambio" y "por retener". Debajo, de que cambios salio.
 */
function FxDetail({ txId, currency }: { txId: string; currency: string }) {
  const valuation = useValuationStatus().data;
  const R = valuation?.reportCurrency;
  const enabled = !!valuation?.enabled && !!R && currency !== R;
  const { data } = useQuery({
    queryKey: ['analytics', 'breakdown', txId],
    queryFn: () => valuationService.breakdown(txId),
    enabled,
  });
  if (!enabled || !data || !R) return null;
  if (data.marketAmount === null || data.reportAmount === null) {
    return data.status === 'MISSING_RATE' ? <div className={css.fx}><div className={css.fxTitle}>En {R}</div><span className={css.dimmed}>falta una tasa para valorarlo</span></div> : null;
  }
  const tone = (c: number | null) => (c === null || c === 0 ? undefined : c < 0 ? css.amtNeg : css.amtPos);
  const rows: [string, number | null, boolean?][] = [
    ['A mercado del día', data.marketAmount],
    ['Costo real (FIFO)', data.reportAmount],
    ['Diferencia de cambio', data.fxResult, true],
  ];
  return (
    <div className={css.fx}>
      <div className={css.fxTitle}>
        En {R}
        {data.status === 'ESTIMATE' && <span className={css.dimmed}> · estimado</span>}
      </div>
      <dl className={css.fxRows}>
        {rows.map(([label, cents, signed]) => (
          <div key={label} className={css.fxRow}>
            <dt>{label}</dt>
            <dd className={signed ? tone(cents) : undefined}>{cents === null ? '—' : signed ? signedMoney(cents, R) : reportMoney(cents, R)}</dd>
          </div>
        ))}
        <div className={`${css.fxRow} ${css.fxSub}`}>
          <dt>por cambio</dt>
          <dd className={tone(data.fxExchange)}>{signedMoney(data.fxExchange ?? 0, R)}</dd>
        </div>
        <div className={`${css.fxRow} ${css.fxSub}`}>
          <dt>por retener</dt>
          <dd className={tone(data.fxHolding)}>{signedMoney(data.fxHolding ?? 0, R)}</dd>
        </div>
      </dl>
      {data.parts.length > 0 && (
        <ul className={css.fxParts}>
          {data.parts.map((p, i) => (
            <li key={i}>
              {formatCurrency(p.qty, p.currency)} {p.currency.toLowerCase()} ·{' '}
              {p.lot
                ? `${p.lot.origin === 'EXCHANGE' ? 'cambio' : p.lot.origin === 'CARRY' ? 'cambio entre monedas' : 'entrada'} del ${dayjs(p.lot.day).format('DD/MM')}` +
                  (p.lot.origin === 'EXCHANGE' && p.lot.rate ? ` a ${num(p.lot.rate)}` : '') +
                  (p.lot.marketRate ? ` (mercado ${num(p.lot.marketRate)})` : '')
                : 'sin bolsa: estimado a la tasa del día'}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
