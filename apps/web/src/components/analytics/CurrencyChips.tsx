import s from './Analytics.module.css';

const CURRENCY_ICONS: Record<string, string> = {
  USD: '/icons/currencies/usd.png',
  EUR: '/icons/currencies/eur.png',
  MN: '/icons/currencies/mn.png',
  MLC: '/icons/currencies/mlc.png',
  USDT: '/icons/currencies/usdt.png',
};

interface Props {
  currencies: string[];
  value: string | null;
  onChange: (currency: string) => void;
}

/**
 * Selector de moneda. Se puebla con las monedas que la org REALMENTE tiene en
 * cuentas, no con la constante CURRENCIES: una org con solo MN y USD no debe
 * ver chips de EUR y MLC.
 */
export function CurrencyChips({ currencies, value, onChange }: Props) {
  if (currencies.length <= 1) return null;

  return (
    <div className={s.chipRow} role="group" aria-label="Moneda">
      {currencies.map((cur) => (
        <button
          key={cur}
          type="button"
          className={cur === value ? s.chipOn : s.chip}
          onClick={() => onChange(cur)}
          aria-pressed={cur === value}
        >
          {CURRENCY_ICONS[cur] && (
            <img src={CURRENCY_ICONS[cur]} alt="" className={s.chipIcon} />
          )}
          {cur}
        </button>
      ))}
    </div>
  );
}
