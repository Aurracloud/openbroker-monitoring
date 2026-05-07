import { classNames } from '../util';

export interface WindowOption {
  key: string;
  label: string;
  /** Window length in ms, or null for "all history". */
  ms: number | null;
}

export const WINDOW_OPTIONS: WindowOption[] = [
  { key: '1h', label: '1H', ms: 60 * 60_000 },
  { key: '6h', label: '6H', ms: 6 * 60 * 60_000 },
  { key: '24h', label: '24H', ms: 24 * 60 * 60_000 },
  { key: '7d', label: '7D', ms: 7 * 24 * 60 * 60_000 },
  { key: '30d', label: '30D', ms: 30 * 24 * 60 * 60_000 },
  { key: 'all', label: 'ALL', ms: null },
];

interface Props {
  value: string;
  onChange: (key: string) => void;
  options?: WindowOption[];
}

export function TimeWindow({ value, onChange, options = WINDOW_OPTIONS }: Props) {
  return (
    <div className="window-pills">
      {options.map((o) => (
        <button
          key={o.key}
          className={classNames('window-pill', value === o.key && 'active')}
          onClick={() => onChange(o.key)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
