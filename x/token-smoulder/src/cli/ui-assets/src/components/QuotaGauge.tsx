type Props = {
  label: string;
  value: number;
};

export function QuotaGauge({ label, value }: Props) {
  const pct = Math.round(value * 100);
  const level = pct < 40 ? 'critical' : pct < 70 ? 'warning' : 'ok';

  return (
    <div className="quota-row">
      <span className="quota-label">{label}</span>
      <div className="gauge-bar">
        <div className="gauge-fill" data-level={level} style={{ width: `${pct}%` }} />
      </div>
      <span className={`quota-pct ${level === 'critical' ? 'err' : level === 'warning' ? 'warn' : 'ok'}`}>{pct}%</span>
    </div>
  );
}
