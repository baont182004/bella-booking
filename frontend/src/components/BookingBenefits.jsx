import { AlertCircle, Coffee, CreditCard, ReceiptText, ShieldCheck } from "lucide-react";
import { getBookingBenefits } from "../utils/roomPresentation";

const iconMap = {
  "Bữa sáng": Coffee,
  "Chính sách hủy": ShieldCheck,
  "Thuế và phí": ReceiptText,
  "Thanh toán": CreditCard,
  "Thanh toán trước": CreditCard,
};

export default function BookingBenefits({ room }) {
  const benefits = getBookingBenefits(room);

  if (!benefits.length) {
    return (
      <article className="room-section-card">
        <div className="room-section-heading">
          <h2>Quyền lợi đặt phòng</h2>
        </div>
        <div className="info-list">
          <div>
            <span>Quy trình hiện tại</span>
            <strong>Bella xác nhận đơn đặt phòng thông qua biểu mẫu đặt trực tiếp trên website.</strong>
          </div>
          <div>
            <span>Thông tin giá</span>
            <strong>Hạng phòng này hiện chưa có thêm quyền lợi giá được tách riêng.</strong>
          </div>
        </div>
      </article>
    );
  }

  return (
    <article className="room-section-card">
      <div className="room-section-heading">
        <h2>Quyền lợi đặt phòng</h2>
        <p>Những ghi chú ngắn gọn về mức giá và dịch vụ đi kèm với hạng phòng này.</p>
      </div>
      <div className="booking-benefits-grid">
        {benefits.map((benefit) => {
          const Icon = iconMap[benefit.title] || AlertCircle;
          return (
            <div key={benefit.title} className="booking-benefit-card">
              <span className="booking-benefit-icon">
                <Icon size={18} />
              </span>
              <div>
                <strong>{benefit.title}</strong>
                <p>{benefit.copy}</p>
              </div>
            </div>
          );
        })}
      </div>
    </article>
  );
}
