type Props = {
  label: string;
  value: number;
};

export function QuotaGauge({ label, value }: Props) {
  const pct = Math.round(value * 100);
  const color = pct > 50 ? '#4a4' : pct > 25 ? '#ca4' : '#c44';
  return (
    <div style={{ display: 'inline-block', marginRight: '1.5rem' }}>
      <div style={{ fontSize: '0.75rem', color: '#888', marginBottom: '0.25rem' }}>{label}</div>
      <div style={{ width: 120, height: 8, background: '#333', borderRadius: 4, overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, height: '100%', background: color, transition: 'width 0.3s' }} />
      </div>
      <div style={{ fontSize: '0.7rem', color: '#aaa', marginTop: '0.15rem' }}>{pct}%</div>
    </div>
  );
}
