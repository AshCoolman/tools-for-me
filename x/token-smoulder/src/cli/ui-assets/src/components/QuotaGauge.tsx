type Props = {
  label: string;
  value: number;
};

export function QuotaGauge({ label, value }: Props) {
  const pct = Math.round(value * 100);
  const colorClass = pct < 40 ? 'err' : pct < 70 ? 'warn' : 'ok';
  const colorVar = `var(--${colorClass})`;

  return (
    <div className="quota-row" style={{ marginTop: 4 }}>
      <span className="quota-label">{label}</span>
      <div className="gauge-bar">
        <div className="gauge-fill" style={{ width: `${pct}%`, background: colorVar }} />
      </div>
      <span className={`quota-pct ${colorClass}`}>{pct}%</span>
    </div>
  );
}
