import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { CalendarRange, CreditCard, MapPin, RefreshCw, Users } from "lucide-react";
import toast from "react-hot-toast";
import { bookingApi, paymentApi } from "../services/api";
import { useAuth } from "../context/AuthContext";
import LoadingGrid from "../components/LoadingGrid";
import {
  formatCurrency,
  formatDate,
  formatDateRange,
  formatGuestLabel,
  formatStatusLabel,
} from "../utils/formatters";

function getStatusMessage(status) {
  switch (status) {
    case "pending":
      return "Đơn Bella này đang chờ bước thanh toán trước khi được xác nhận đầy đủ.";
    case "confirmed":
      return "Kỳ nghỉ Bella của bạn đã được xác nhận. Nếu cần thay đổi sau khi đã thanh toán, vui lòng liên hệ hỗ trợ.";
    case "completed":
      return "Kỳ nghỉ này đã hoàn tất và được lưu trong lịch sử đặt phòng của bạn.";
    case "cancelled":
      return "Đơn này đã được hủy và bạn không cần thực hiện thêm thao tác nào.";
    default:
      return "Xem lại chi tiết đơn và trạng thái thanh toán tại đây.";
  }
}

export default function Bookings() {
  const { user } = useAuth();
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [statusFilter, setStatusFilter] = useState("");
  const [paymentLookup, setPaymentLookup] = useState({});

  const fetchBookings = async () => {
    if (!user?.id) return;
    try {
      setLoading(true);
      setLoadError(false);
      const response = await bookingApi.get("/bookings", {
        params: {
          ...(statusFilter && { status: statusFilter }),
        },
      });
      setBookings(response.data.bookings || []);
    } catch (error) {
      setLoadError(true);
      toast.error("Không thể tải danh sách đặt phòng.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchBookings();
  }, [user?.id, statusFilter]);

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
      toast.error("Hiện chưa có thông tin thanh toán cho đơn này.");
    }
  };

  if (!user?.id) {
    return (
      <section className="page-section">
        <div className="shell-container">
          <div className="empty-state">Vui lòng đăng nhập để xem các đơn Bella của bạn.</div>
        </div>
      </section>
    );
  }

  const summary = bookings.reduce(
    (accumulator, booking) => {
      accumulator.total += 1;
      accumulator[booking.status] = (accumulator[booking.status] || 0) + 1;
      return accumulator;
    },
    { total: 0, pending: 0, confirmed: 0, completed: 0, cancelled: 0 },
  );

  return (
    <section className="page-section">
      <div className="shell-container section-stack">
        <div className="page-hero">
          <div>
            <p className="eyebrow">Đơn đặt phòng của tôi</p>
            <h1 className="section-title">Theo dõi toàn bộ kỳ nghỉ Bella trong một nơi.</h1>
            <p className="section-copy">
              Xem lại các đơn sắp tới, tình trạng thanh toán và trạng thái lưu trú của bạn bất cứ
              khi nào cần.
            </p>
          </div>
          <div className="results-toolbar-actions">
            <select
              className="text-input text-input-select"
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
            >
              <option value="">Tất cả trạng thái</option>
              <option value="pending">Chờ xác nhận</option>
              <option value="confirmed">Đã xác nhận</option>
              <option value="cancelled">Đã hủy</option>
              <option value="completed">Hoàn tất</option>
            </select>
            <button type="button" className="button button-secondary" onClick={fetchBookings}>
              <RefreshCw size={16} />
              Làm mới
            </button>
          </div>
        </div>

        <div className="stats-row stats-row-four">
          <article className="stat-card">
            <span>Tổng đơn</span>
            <strong>{summary.total}</strong>
            <p>Tất cả đơn Bella đang liên kết với tài khoản của bạn.</p>
          </article>
          <article className="stat-card">
            <span>Đã xác nhận</span>
            <strong>{summary.confirmed}</strong>
            <p>Những kỳ nghỉ đã sẵn sàng để nhận phòng.</p>
          </article>
          <article className="stat-card">
            <span>Chờ xác nhận</span>
            <strong>{summary.pending}</strong>
            <p>Các đơn vẫn đang chờ bước tiếp theo.</p>
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
              <button type="button" className="button button-secondary" onClick={fetchBookings}>
                Thử lại
              </button>
            </div>
          </div>
        ) : bookings.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-stack">
              <p>Bạn chưa có đơn đặt phòng Bella nào.</p>
              <span>Hãy chọn một hạng phòng trên trang Bella để bắt đầu lịch sử lưu trú của bạn.</span>
              <Link to="/#rooms" className="button button-secondary">
                Xem hạng phòng Bella
              </Link>
            </div>
          </div>
        ) : (
          <div className="booking-grid">
            {bookings.map((booking) => (
              <article
                key={booking.id}
                className={`booking-card booking-card-${booking.status || "pending"}`}
              >
                <div className="booking-card-header">
                  <div>
                    <p className="booking-label">Đơn #{booking.id}</p>
                    <h3>{booking.room?.hotel?.name || "Lưu trú tại khách sạn"}</h3>
                    <p className="booking-location">
                      <MapPin size={15} />
                      {[booking.room?.hotel?.city, booking.room?.hotel?.country]
                        .filter(Boolean)
                        .join(", ")}
                    </p>
                  </div>
                  <span className={`status-pill status-pill-${booking.status}`}>
                    {formatStatusLabel(booking.status)}
                  </span>
                </div>

                <p className="booking-status-copy">{getStatusMessage(booking.status)}</p>

                <div className="booking-metadata">
                  <span>
                    <CalendarRange size={15} />
                    {formatDateRange(booking.check_in_date, booking.check_out_date)}
                  </span>
                  <span>
                    <Users size={15} />
                    {formatGuestLabel(booking.num_guests)}
                  </span>
                  <span>
                    Phòng {booking.room?.room_number} · {booking.room?.room_type}
                  </span>
                </div>

                <div className="booking-total-row">
                  <div>
                    <span>Tổng tiền</span>
                    <strong>{formatCurrency(booking.total_price)}</strong>
                  </div>
                  <Link to="/#rooms" className="text-link">
                    Đặt phòng mới
                  </Link>
                </div>

                <div className="booking-actions">
                  {booking.status === "pending" && (
                    <button
                      type="button"
                      className="button button-secondary button-danger"
                      onClick={() => handleCancel(booking.id)}
                    >
                      Hủy đơn
                    </button>
                  )}
                  <button
                    type="button"
                    className="button button-secondary"
                    onClick={() => handlePaymentLookup(booking.id)}
                  >
                    <CreditCard size={16} />
                    {paymentLookup[booking.id] ? "Đã có thanh toán" : "Chi tiết thanh toán"}
                  </button>
                </div>

                {paymentLookup[booking.id] && (
                  <div className="payment-inline">
                    <p>
                      Trạng thái thanh toán:{" "}
                      {formatStatusLabel(paymentLookup[booking.id].payment_status)}
                    </p>
                    <p>Hình thức thanh toán: {paymentLookup[booking.id].payment_method}</p>
                    {paymentLookup[booking.id].payment_date ? (
                      <p>Ghi nhận lúc: {formatDate(paymentLookup[booking.id].payment_date)}</p>
                    ) : null}
                  </div>
                )}
              </article>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
