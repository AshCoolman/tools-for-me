type Props = {
  active: boolean;
};

export function ExternalDot({ active }: Props) {
  return (
    <span className="dim">
      external: {active ? 'active' : 'idle'}
    </span>
  );
}
