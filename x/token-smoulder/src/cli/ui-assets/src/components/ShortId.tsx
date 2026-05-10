type Props = {
  value: string;
  chars?: number;
};

export function ShortId({ value, chars = 7 }: Props) {
  return (
    <span
      title={value}
      style={{ fontFamily: 'monospace', fontSize: '0.75rem', color: '#888', cursor: 'default' }}
    >
      {value.slice(0, chars)}
    </span>
  );
}
