import { formatCurrency } from "../utils/formatters";
import { formatPricingUnit, getBookingBadges, getRoomPricing } from "../utils/roomPresentation";
import RoomHighlights from "./RoomHighlights";

export default function RoomPriceBlock({
  room,
  variant = "card",
  showBadges = true,
}) {
  const pricing = getRoomPricing(room);
  const hasPrice = Number(pricing.currentPrice) > 0;
  const hasBasePrice = Number(pricing.basePrice) > Number(pricing.currentPrice || 0);
  const badges = showBadges ? getBookingBadges(room, variant === "detail" ? 4 : 2) : [];

  return (
    <div className={`room-price-block room-price-block-${variant}`}>
      {pricing.discountPercent ? (
        <span className="room-price-save">Tiết kiệm {pricing.discountPercent}%</span>
      ) : null}

      {hasBasePrice ? (
        <span className="room-price-base">{formatCurrency(pricing.basePrice)}</span>
      ) : null}

      <div className="room-price-current-row">
        <strong>{hasPrice ? formatCurrency(pricing.currentPrice) : "Xem giá hiện tại"}</strong>
        {hasPrice ? <span>{formatPricingUnit(room)}</span> : null}
      </div>

      {variant === "detail" ? (
        <div className="room-price-meta">
          {pricing.taxesIncluded === true ? (
            <p>Đã bao gồm thuế và phí</p>
          ) : pricing.taxesIncluded === false ? (
            <p>Thuế và phí có thể được cập nhật khi xác nhận cuối cùng</p>
          ) : (
            <p>Tổng tiền cuối cùng sẽ được hệ thống Bella xác nhận khi tạo đơn</p>
          )}
        </div>
      ) : null}

      {badges.length ? <RoomHighlights items={badges} className="room-chip-row-compact" /> : null}
    </div>
  );
}
