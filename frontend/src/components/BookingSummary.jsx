import { CalendarDays, Gift, Users } from "lucide-react";
import { formatCurrency, formatDateRange, formatGuestLabel } from "../utils/formatters";

export default function BookingSummary({ checkInDate, checkOutDate, guests, combo, total }) {
  return (
    <div className="booking-summary-card">
      <div className="booking-summary-head">
        <span>Tóm tắt giữ chỗ</span>
        <strong>{total ? formatCurrency(total) : "Chờ chọn ngày"}</strong>
      </div>
      <div className="booking-summary-lines">
        <span>
          <CalendarDays size={15} />
          {checkInDate && checkOutDate ? formatDateRange(checkInDate, checkOutDate) : "Chưa chọn ngày"}
        </span>
        <span>
          <Users size={15} />
          {formatGuestLabel(guests)}
        </span>
        <span>
          <Gift size={15} />
          {combo?.name || "Không chọn combo"}
        </span>
      </div>
    </div>
  );
}
