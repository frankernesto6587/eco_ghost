import { useTranslation } from 'react-i18next';
import { Dropdown, DatePicker } from 'antd';
import dayjs, { Dayjs } from 'dayjs';
import { PRESET_ORDER, type AnalyticsPreset } from '@/lib/dateRanges';
import s from './Analytics.module.css';

const { RangePicker } = DatePicker;

interface Props {
  preset: AnalyticsPreset;
  from: string;
  to: string;
  onPreset: (preset: AnalyticsPreset) => void;
  onCustom: (from: string, to: string) => void;
}

export function RangePresetChips({ preset, from, to, onPreset, onCustom }: Props) {
  const { t } = useTranslation();

  const labels: Record<Exclude<AnalyticsPreset, 'custom'>, string> = {
    thisMonth: t('analytics.presetThisMonth'),
    lastMonth: t('analytics.presetLastMonth'),
    last3Months: t('analytics.presetLast3Months'),
    thisYear: t('analytics.presetThisYear'),
  };

  return (
    <div className={s.chipRow} role="group" aria-label={t('analytics.range')}>
      {PRESET_ORDER.map((p) => (
        <button
          key={p}
          type="button"
          className={preset === p ? s.chipOn : s.chip}
          onClick={() => onPreset(p)}
          aria-pressed={preset === p}
        >
          {labels[p]}
        </button>
      ))}

      <Dropdown
        trigger={['click']}
        dropdownRender={() => (
          <div
            style={{
              background: 'var(--eco-surface)',
              border: '1px solid var(--eco-line)',
              borderRadius: 12,
              padding: 10,
              boxShadow: 'var(--eco-shadow2)',
            }}
          >
            <RangePicker
              value={[dayjs(from), dayjs(to)] as [Dayjs, Dayjs]}
              onChange={(range) => {
                if (range?.[0] && range?.[1]) {
                  onCustom(range[0].format('YYYY-MM-DD'), range[1].format('YYYY-MM-DD'));
                }
              }}
            />
          </div>
        )}
      >
        <button
          type="button"
          className={preset === 'custom' ? s.chipOn : s.chip}
          aria-pressed={preset === 'custom'}
        >
          {t('analytics.presetCustom')}
        </button>
      </Dropdown>
    </div>
  );
}
