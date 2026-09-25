import { formatMoney } from "@/domain/format";

export function Amount({ value }: { value: number | null | undefined }) {
  if (value == null || !Number.isFinite(value)) {
    return (
      <span className="amount">
        <span className="num">—</span> <span className="tag">Needs price</span>
      </span>
    );
  }
  return <span className="num">{formatMoney(value)}</span>;
}
