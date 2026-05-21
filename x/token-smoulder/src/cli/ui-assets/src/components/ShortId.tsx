type Props = {
  value: string;
  chars?: number;
};

export function ShortId({ value, chars = 7 }: Props) {
  return (
    <span className="short-id" title={value}>
      {value.slice(0, chars)}
    </span>
  );
}
