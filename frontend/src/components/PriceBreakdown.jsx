import { formatCurrency } from "../utils/formatters";

export default function PriceBreakdown({ breakdown, fallbackTotal = 0 }) {
  const rows = breakdown?.items?.length
    ? breakdown.items
    : [
        {
          key: "room",
          label: "Giá phòng",
          amount: fallbackTotal,
        },
      ];

  return (
    <div className="price-breakdown" data-testid="price-breakdown">
      {rows.map((row) => (
        <div key={row.key} className="price-breakdown-row">
          <span>{row.label}</span>
          <strong>{formatCurrency(row.amount)}</strong>
        </div>
      ))}
      <div className="price-breakdown-row price-breakdown-total">
        <span>Tổng thanh toán</span>
        <strong>{formatCurrency(breakdown?.finalAmount ?? fallbackTotal)}</strong>
      </div>
    </div>
  );
}
