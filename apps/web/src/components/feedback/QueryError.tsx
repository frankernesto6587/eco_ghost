import { Button } from 'antd';
import { useTranslation } from 'react-i18next';

interface Props {
  message?: string;
  onRetry?: () => void;
}

/** Estado de error reutilizable para bloques que cargan datos. */
export function QueryError({ message, onRetry }: Props) {
  const { t } = useTranslation();
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 10,
        padding: '32px 20px',
        textAlign: 'center',
      }}
    >
      <div style={{ fontSize: 13, color: 'var(--eco-fg2)' }}>
        {message ?? t('common.errorLoading')}
      </div>
      {onRetry && (
        <Button size="small" onClick={onRetry}>
          {t('common.retry')}
        </Button>
      )}
    </div>
  );
}
