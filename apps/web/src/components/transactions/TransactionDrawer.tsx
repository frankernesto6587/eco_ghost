import { Drawer, Button, Popconfirm } from 'antd';
import { EditOutlined, DeleteOutlined } from '@ant-design/icons';
import { formatCurrency } from '@/lib/formatters';
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
  canWrite: boolean;
}

const TYPE_LABELS: Record<string, string> = {
  INCOME: 'Ingreso',
  EXPENSE: 'Gasto',
  TRANSFER: 'Transferencia',
  EXCHANGE: 'Cambio',
};

export default function TransactionDrawer({ transaction: tx, open, onClose, onEdit, onDelete, canWrite }: TransactionDrawerProps) {
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
      width={420}
      closable={false}
      styles={{ body: { padding: 0, background: 'var(--eco-surface)', color: 'var(--eco-fg)' }, header: { display: 'none' } }}
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
      </div>

      {/* Footer actions */}
      {canWrite && (
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
