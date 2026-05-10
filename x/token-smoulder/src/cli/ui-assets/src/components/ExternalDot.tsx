type Props = {
  active: boolean;
};

export function ExternalDot({ active }: Props) {
  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}>
      <div style={{
        width: 10,
        height: 10,
        borderRadius: '50%',
        background: active ? '#c44' : '#4a4',
        boxShadow: active ? '0 0 6px #c44' : 'none',
      }} />
      <span style={{ fontSize: '0.75rem', color: '#aaa' }}>
        {active ? 'external: active (blocked)' : 'external: idle'}
      </span>
    </div>
  );
}
