import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { CalendarRange, CreditCard, MapPin, RefreshCw, Users } from "lucide-react";
import toast from "react-hot-toast";
import { bookingApi, paymentApi } from "../services/api";
import { useAuth } from "../context/auth-context";
import LoadingGrid from "../components/LoadingGrid";
import {
  formatBookingStatusDescription,
  formatBookingStatusLabel,
  formatCurrency,
  formatDate,
  formatDateRange,
  formatGuestLabel,
  formatPaymentMethodLabel,
  formatPaymentStatusLabel,
} from "../utils/formatters";

export default function Bookings() {
  const { user } = useAuth();
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [statusFilter, setStatusFilter] = useState("");
  const [paymentLookup, setPaymentLookup] = useState({});

  const fetchBookings = useCallback(
    async (nextStatus = statusFilter) => {
      if (!user?.id) return;
      try {
        setLoading(true);
        setLoadError(false);
        const response = await bookingApi.get("/bookings", {
          params: {
            ...(nextStatus && { status: nextStatus }),
          },
        });
        setBookings(response.data.bookings || []);
      } catch {
        setLoadError(true);
        toast.error("Không thể tải danh sách đặt phòng.");
      } finally {
        setLoading(false);
      }
    },
    [statusFilter, user?.id],
  );

  useEffect(() => {
    void fetchBookings(statusFilter);
  }, [fetchBookings, statusFilter]);

  const handleCancel = async (bookingId) => {
    try {
      await bookingApi.put(`/bookings/${bookingId}/cancel`);
      toast.success("Đơn đặt phòng đã được hủy.");
      fetchBookings();
    } catch (error) {
      toast.error(error.response?.data?.error || "Không thể hủy đơn đặt phòng này.");
    }
  };

  const handlePaymentLookup = async (bookingId) => {
    try {
      const response = await paymentApi.get(`/payments/booking/${bookingId}`);
      setPaymentLookup((prev) => ({
        ...prev,
        [bookingId]: response.data.payment,
      }));
    } catch (error) {
      if (error.response?.status === 409) {
        toast("Bella đang đồng bộ trạng thái thanh toán. Hãy thử lại sau giây lát.");
        return;
      }

      toast.error("Hiện chưa có thông tin thanh toán cho đơn này.");
    }
  };

  const handleResumeCheckout = async (bookingId) => {
    try {
      const response = await paymentApi.post("/payments/checkout-sessions", {
        bookingId,
      });
      window.location.assign(response.data.checkoutSession.checkoutUrl);
    } catch (error) {
      toast.error(error.response?.data?.error || "Không thể tạo checkout session cho đơn này.");
    }
  };

  const summary = useMemo(
    () =>
      bookings.reduce(
        (accumulator, booking) => {
          accumulator.total += 1;
          accumulator[booking.status] = (accumulator[booking.status] || 0) + 1;
          return accumulator;
        },
        { total: 0, pending_payment: 0, payment_failed: 0, confirmed: 0, completed: 0, cancelled: 0, expired: 0 },
      ),
    [bookings],
  );

  const pendingPaymentCount = summary.pending_payment || 0;
  const nextPendingBooking = bookings.find((booking) => booking.status === "pending_payment");

  if (!user?.id) {
    return (
      <section className="page-section">
        <div className="shell-container">
          <div className="empty-state">
            <div className="empty-state-stack">
              <p>Vui lòng đăng nhập để xem các đơn Bella của bạn.</p>
              <Link to="/login" className="button button-primary">
                Đăng nhập
              </Link>
            </div>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="page-section">
      <div className="shell-container section-stack">
        <div className="page-hero">
          <div>
            <p className="eyebrow">Đặt phòng của tôi</p>
            <h1 className="section-title">Theo dõi toàn bộ kỳ nghỉ Bella trong một nơi.</h1>
            <p className="section-copy">
              Từ đây bạn có thể xem lại ngày ở, mã đặt phòng, tình trạng thanh toán và những lần
              lưu trú đã hoàn tất mà không phải tra cứu từng bước riêng lẻ.
            </p>
          </div>
          <div className="results-toolbar-actions">
            <Link to="/rooms" className="button button-secondary">
              Chọn phòng mới
            </Link>
            <select
              className="text-input text-input-select"
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
            >
              <option value="">Tất cả trạng thái</option>
              <option value="pending_payment">Chờ thanh toán</option>
              <option value="confirmed">Đã xác nhận</option>
              <option value="cancelled">Đã hủy</option>
              <option value="completed">Hoàn tất</option>
              <option value="expired">Đã hết hạn</option>
            </select>
            <button type="button" className="button button-secondary" onClick={() => fetchBookings()}>
              <RefreshCw size={16} />
              Làm mới
            </button>
          </div>
        </div>

        {pendingPaymentCount > 0 && nextPendingBooking ? (
          <div className="booking-summary-banner">
            <div>
              <p className="eyebrow">Cần hoàn tất</p>
              <h2 className="panel-title">Bạn vẫn còn đặt phòng đang chờ thanh toán.</h2>
              <p>
                Bella đã giữ chỗ cho mã {nextPendingBooking.bookingReference}. Hãy mở chi tiết bên
                dưới hoặc tra cứu bằng mã đặt phòng để tiếp tục xác nhận.
              </p>
            </div>
            <Link to="/lookup" className="button button-secondary">
              Tra cứu bằng mã đặt phòng
            </Link>
          </div>
        ) : null}

        <div className="stats-row stats-row-four">
          <article className="stat-card">
            <span>Tổng đơn</span>
            <strong>{summary.total}</strong>
            <p>Tất cả kỳ nghỉ Bella đang liên kết với tài khoản của bạn.</p>
          </article>
          <article className="stat-card">
            <span>Đã xác nhận</span>
            <strong>{summary.confirmed}</strong>
            <p>Những kỳ nghỉ đã sẵn sàng để nhận phòng.</p>
          </article>
          <article className="stat-card">
            <span>Chờ thanh toán</span>
            <strong>{pendingPaymentCount}</strong>
            <p>Các đơn còn đang ở bước cần xác nhận thanh toán.</p>
          </article>
          <article className="stat-card">
            <span>Hoàn tất</span>
            <strong>{summary.completed}</strong>
            <p>Những chuyến đi đã lưu trong lịch sử đặt phòng.</p>
          </article>
        </div>

        {loading ? (
          <LoadingGrid count={4} className="booking-grid loading-grid" variant="booking" />
        ) : loadError ? (
          <div className="empty-state">
            <div className="empty-state-stack">
              <p>Hiện chưa thể tải danh sách đặt phòng của bạn.</p>
              <button type="button" className="button button-secondary" onClick={() => fetchBookings()}>
                Thử lại
              </button>
            </div>
          </div>
        ) : bookings.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-stack">
              <p>Bạn chưa có đơn đặt phòng Bella nào.</p>
              <span>
                Hãy bắt đầu từ danh sách hạng phòng để tạo kỳ nghỉ đầu tiên và theo dõi toàn bộ
                thông tin ngay trong tài khoản này.
              </span>
              <Link to="/rooms" className="button button-secondary">
                Xem hạng phòng Bella
              </Link>
            </div>
          </div>
        ) : (
          <div className="booking-grid booking-grid-polished" data-testid="bookings-grid">
            {bookings.map((booking) => {
              const payment = paymentLookup[booking.id];

              return (
                <article
                  key={booking.id}
                  className={`booking-card booking-card-${booking.status || "pending"}`}
                  data-testid={`booking-card-${booking.id}`}
                >
                  <div className="booking-card-header">
                    <div>
                      <p className="booking-label">Mã đặt phòng {booking.bookingReference || booking.id}</p>
                      <h3>{booking.room?.room_type || "Hạng phòng Bella"}</h3>
                      <p className="booking-location">
                        <MapPin size={15} />
                        {booking.room?.hotel?.name || "Bella Hotel Phú Quốc"}
                      </p>
                    </div>
                    <span className={`status-pill status-pill-${booking.status}`}>
                      {formatBookingStatusLabel(booking.status)}
                    </span>
                  </div>

                  <p className="booking-status-copy">
                    {formatBookingStatusDescription(booking.status)}
                  </p>

                  <div className="booking-detail-grid">
                    <div>
                      <span>Ngày lưu trú</span>
                      <strong>
                        <CalendarRange size={15} />
                        {formatDateRange(booking.check_in_date, booking.check_out_date)}
                      </strong>
                    </div>
                    <div>
                      <span>Số khách</span>
                      <strong>
                        <Users size={15} />
                        {formatGuestLabel(booking.num_guests)}
                      </strong>
                    </div>
                    <div>
                      <span>Tổng tiền</span>
                      <strong>{formatCurrency(booking.total_price)}</strong>
                    </div>
                    <div>
                      <span>Hạng phòng</span>
                      <strong>
                        Phòng {booking.room?.room_number} · {booking.room?.room_type}
                      </strong>
                    </div>
                  </div>

                  {booking.promotion ? (
                    <div className="booking-inline-note">
                      Áp dụng {booking.promotion.code} giảm{" "}
                      {formatCurrency(booking.promotion.discountAmount)} cho đặt phòng này.
                    </div>
                  ) : null}

                  <div className="booking-actions">
                    {booking.status === "pending_payment" || booking.status === "payment_failed" ? (
                      <>
                        <button
                          type="button"
                          className="button button-primary"
                          onClick={() => handleResumeCheckout(booking.id)}
                          data-testid={`resume-checkout-${booking.id}`}
                        >
                          Tiếp tục thanh toán
                        </button>
                        <button
                          type="button"
                          className="button button-secondary button-danger"
                          onClick={() => handleCancel(booking.id)}
                        >
                          Hủy đơn
                        </button>
                      </>
                    ) : null}
                    <button
                      type="button"
                      className="button button-secondary"
                      onClick={() => handlePaymentLookup(booking.id)}
                    >
                      <CreditCard size={16} />
                      {payment ? "Cập nhật thanh toán" : "Xem thanh toán"}
                    </button>
                    <Link to="/rooms" className="button button-ghost">
                      Đặt kỳ nghỉ mới
                    </Link>
                  </div>

                  {payment ? (
                    <div className="payment-inline">
                      <p>Trạng thái thanh toán: {formatPaymentStatusLabel(payment.paymentStatus)}</p>
                      <p>Hình thức thanh toán: {formatPaymentMethodLabel(payment.paymentMethod)}</p>
                      {payment.provider ? <p>Provider: {payment.provider}</p> : null}
                      {payment.cardBrand && payment.cardLast4 ? (
                        <p>
                          Metadata thẻ: {payment.cardBrand.toUpperCase()} •••• {payment.cardLast4}
                        </p>
                      ) : null}
                      {payment.capturedAt ? (
                        <p>Ghi nhận lúc: {formatDate(payment.capturedAt)}</p>
                      ) : null}
                      {payment.checkoutSessionExpiresAt ? (
                        <p>Phiên checkout hết hạn lúc: {formatDate(payment.checkoutSessionExpiresAt)}</p>
                      ) : null}
                      {payment.failureMessage ? <p>Lý do thất bại: {payment.failureMessage}</p> : null}
                    </div>
                  ) : null}
                </article>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}
