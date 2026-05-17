import { useState } from "react";
import { Link } from "react-router-dom";
import { Search, ShieldCheck, Ticket } from "lucide-react";
import toast from "react-hot-toast";
import { bookingApi } from "../services/api";
import {
  formatBookingStatusDescription,
  formatBookingStatusLabel,
  formatCurrency,
  formatDateRange,
} from "../utils/formatters";

export default function BookingLookup() {
  const [formData, setFormData] = useState({ reference: "", email: "" });
  const [booking, setBooking] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleChange = (event) => {
    setFormData((prev) => ({ ...prev, [event.target.name]: event.target.value }));
  };

  const handleLookup = async (event) => {
    event.preventDefault();

    try {
      setIsSubmitting(true);
      const response = await bookingApi.get("/bookings/lookup", {
        params: {
          reference: formData.reference.trim().toUpperCase(),
          email: formData.email.trim().toLowerCase(),
        },
      });
      setBooking(response.data.booking);
    } catch (error) {
      setBooking(null);
      toast.error(error.response?.data?.error || "Không tìm thấy đơn đặt phòng.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <section className="page-section">
      <div className="shell-container section-stack">
        <div className="page-hero">
          <div>
            <p className="eyebrow">Tra cứu đặt phòng</p>
            <h1 className="section-title">Kiểm tra nhanh một đặt phòng Bella bằng mã và email.</h1>
            <p className="section-copy">
              Dùng trang này khi bạn cần xem lại ngày ở, tình trạng xác nhận hoặc tổng tiền nhưng
              chưa tiện đăng nhập vào tài khoản.
            </p>
          </div>
        </div>

        <div className="dashboard-grid lookup-layout">
          <div className="panel panel-hero lookup-intro-card">
            <p className="eyebrow">Bạn sẽ cần</p>
            <h2 className="panel-title">Hai thông tin để tra cứu chính xác</h2>
            <div className="lookup-tip-list">
              <div className="lookup-tip">
                <ShieldCheck size={18} />
                <div>
                  <strong>Mã đặt phòng Bella</strong>
                  <p>Mã này xuất hiện sau khi bạn giữ chỗ thành công hoặc trong email xác nhận.</p>
                </div>
              </div>
              <div className="lookup-tip">
                <Ticket size={18} />
                <div>
                  <strong>Email khách lưu trú</strong>
                  <p>Dùng đúng email đã nhập khi tạo đặt phòng để Bella đối chiếu thông tin.</p>
                </div>
              </div>
            </div>

            <form className="form-stack" onSubmit={handleLookup}>
              <label className="form-field">
                <span>Mã đặt phòng</span>
                <input
                  name="reference"
                  className="text-input"
                  placeholder="BEL-20260415-XXXXXX"
                  value={formData.reference}
                  onChange={handleChange}
                  data-testid="lookup-reference"
                  required
                />
              </label>
              <label className="form-field">
                <span>Email khách lưu trú</span>
                <input
                  type="email"
                  name="email"
                  className="text-input"
                  placeholder="tenban@example.com"
                  value={formData.email}
                  onChange={handleChange}
                  data-testid="lookup-email"
                  required
                />
              </label>
              <button
                type="submit"
                className="button button-primary"
                disabled={isSubmitting}
                data-testid="lookup-submit"
              >
                <Search size={16} />
                {isSubmitting ? "Đang tra cứu..." : "Tra cứu đặt phòng"}
              </button>
            </form>
          </div>

          <div className="panel lookup-result-card">
            <div className="panel-heading">
              <div>
                <p className="eyebrow">Kết quả tra cứu</p>
                <h2 className="panel-title">Thông tin lưu trú</h2>
                <p className="auth-card-copy">
                  Bella sẽ hiển thị những gì bạn cần nhất để kiểm tra nhanh đặt phòng.
                </p>
              </div>
            </div>

            {booking ? (
              <div className="lookup-result-stack" data-testid="lookup-result">
                <div className="booking-confirmation-card booking-confirmation-card-emphasis">
                  <div className="booking-confirmation-row">
                    <span>Mã đặt phòng</span>
                    <strong>{booking.bookingReference}</strong>
                  </div>
                  <div className="booking-confirmation-row">
                    <span>Trạng thái</span>
                    <strong>{formatBookingStatusLabel(booking.status)}</strong>
                  </div>
                  <div className="booking-confirmation-row">
                    <span>Tổng tiền</span>
                    <strong>{formatCurrency(booking.totalPrice)}</strong>
                  </div>
                </div>

                <div className="info-list">
                  <div>
                    <span>Thời gian lưu trú</span>
                    <strong>{formatDateRange(booking.checkInDate, booking.checkOutDate)}</strong>
                  </div>
                  <div>
                    <span>Hạng phòng</span>
                    <strong>
                      {booking.roomType} · {booking.roomNumber}
                    </strong>
                  </div>
                  <div>
                    <span>Khách lưu trú</span>
                    <strong>{booking.guestFullName}</strong>
                  </div>
                  <div>
                    <span>Khuyến mãi</span>
                    <strong>
                      {booking.promotion
                        ? `${booking.promotion.code} (-${formatCurrency(booking.promotion.discountAmount)})`
                        : "Không áp dụng"}
                    </strong>
                  </div>
                </div>

                <div className="booking-inline-note">
                  {formatBookingStatusDescription(booking.status)}
                </div>
              </div>
            ) : (
              <div className="empty-state empty-state-inline">
                <div className="empty-state-stack">
                  <p>Chưa có kết quả tra cứu.</p>
                  <span>Nhập đúng mã đặt phòng và email để xem thông tin đơn Bella.</span>
                </div>
              </div>
            )}

            <div className="lookup-result-actions">
              <Link to="/login" className="button button-secondary">
                <Ticket size={16} />
                Đăng nhập để quản lý toàn bộ đơn
              </Link>
              <Link to="/rooms" className="button button-ghost">
                Xem hạng phòng Bella
              </Link>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
