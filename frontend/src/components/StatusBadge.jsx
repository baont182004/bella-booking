import { CheckCircle2, Clock3, XCircle } from "lucide-react";
import { formatBookingStatusLabel, formatPaymentStatusLabel } from "../utils/formatters";

export default function StatusBadge({ status, type = "booking" }) {
  const normalized = status || "pending_payment";
  const isSuccess = ["confirmed", "succeeded", "authorized", "completed"].includes(normalized);
  const isFailed = ["failed", "payment_failed", "cancelled", "expired"].includes(normalized);
  const Icon = isSuccess ? CheckCircle2 : isFailed ? XCircle : Clock3;
  const label = type === "payment" ? formatPaymentStatusLabel(normalized) : formatBookingStatusLabel(normalized);

  return (
    <span className={isSuccess ? "status-pill status-pill-confirmed" : isFailed ? "status-pill status-pill-cancelled" : "status-pill status-pill-pending"}>
      <Icon size={14} />
      {label}
    </span>
  );
}
