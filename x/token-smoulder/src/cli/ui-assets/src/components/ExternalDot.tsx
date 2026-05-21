type Props = {
  active: boolean;
};

export function ExternalDot({ active }: Props) {
  if (active) {
    return (
      <span className="external-blocking" title="Another Claude session is active — dispatch paused">
        <span className="external-dot-warn" />
        session active
      </span>
    );
  }
  return null;
}
