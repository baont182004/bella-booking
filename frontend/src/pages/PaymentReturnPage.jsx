import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { CheckCircle2, Clock3, RefreshCw, ShieldCheck, XCircle } from "lucide-react";
import toast from "react-hot-toast";
import { paymentApi } from "../services/api";
import {
  formatBookingStatusLabel,
  formatCurrency,
  formatPaymentStatusLabel,
} from "../utils/formatters";

const terminalPaymentStatuses = new Set(["authorized", "succeeded", "failed", "cancelled", "refunded", "expired"]);
const MAX_POLL_ATTEMPTS = 24;

function isTerminalStatus(status) {
  return terminalPaymentStatuses.has(status);
}

function getStatusCopy(status) {
  if (status === "succeeded" || status === "authorized") {
    return {
      title: "Thanh toán đã được xác thực",
      body: "Bella đã nhận kết quả thanh toán hợp lệ từ phía provider. Booking của bạn có thể được xác nhận ở backend mà không cần tin vào URL redirect.",
      icon: CheckCircle2,
      className: "status-pill status-pill-confirmed",
    };
  }

  if (status === "failed") {
    return {
      title: "Thanh toán chưa thành công",
      body: "Provider đã trả về kết quả thất bại. Bạn có thể tạo checkout session mới để thử lại.",
      icon: XCircle,
      className: "status-pill status-pill-cancelled",
    };
  }

  if (status === "expired") {
    return {
      title: "Phiên checkout đã hết hạn",
      body: "Checkout session đã quá hạn trước khi Bella nhận được kết quả thành công đã xác thực.",
      icon: Clock3,
      className: "status-pill status-pill-pending",
    };
  }

  if (status === "cancelled") {
    return {
      title: "Phiên thanh toán đã hủy",
      body: "Phiên checkout đã bị hủy. Bạn có thể quay lại danh sách đặt phòng để tạo phiên thanh toán mới nếu đơn vẫn còn hợp lệ.",
      icon: XCircle,
      className: "status-pill status-pill-cancelled",
    };
  }

  return {
    title: "Đang chờ ngân hàng xác nhận",
    body: "Bella đang kiểm tra trạng thái thật từ backend. Webhook từ ngân hàng có thể đến chậm trong vài chục giây.",
    icon: RefreshCw,
    className: "status-pill status-pill-pending",
  };
}

export default function PaymentReturnPage() {
  const [searchParams] = useSearchParams();
  const bookingId = searchParams.get("booking_id");
  const sessionId = searchParams.get("session_id");
  const hasStatusLookupInput = Boolean(bookingId || sessionId);
  const [payment, setPayment] = useState(null);
  const [booking, setBooking] = useState(null);
  const [loading, setLoading] = useState(hasStatusLookupInput);
  const [error, setError] = useState(
    hasStatusLookupInput
      ? ""
      : "Thiếu thông tin phiên checkout để Bella kiểm tra trạng thái thanh toán.",
  );

  const paymentStatus = payment?.paymentStatus || "processing";
  const statusCopy = useMemo(() => getStatusCopy(paymentStatus), [paymentStatus]);

  useEffect(() => {
    document.title = "Payment Return | Bella Hotel";
  }, []);

  useEffect(() => {
    if (!hasStatusLookupInput) {
      return;
    }

    let cancelled = false;
    let timerId = null;
    let attempts = 0;

    const loadStatus = async () => {
      try {
        const response = sessionId
          ? await paymentApi.get(`/payments/checkout-sessions/${sessionId}/status`)
          : await paymentApi.get(`/payments/booking/${bookingId}`);

        if (cancelled) {
          return;
        }

        const nextPayment = response.data.payment;
        const nextBooking = response.data.booking;
        setPayment(nextPayment);
        setBooking(nextBooking);
        setError("");

        if (!isTerminalStatus(nextPayment?.paymentStatus || "processing") && attempts < MAX_POLL_ATTEMPTS) {
          attempts += 1;
          timerId = window.setTimeout(loadStatus, 2500);
        } else {
          setLoading(false);
        }
      } catch (requestError) {
        if (cancelled) {
          return;
        }

        if (requestError.response?.status === 409 && attempts < MAX_POLL_ATTEMPTS) {
          attempts += 1;
          timerId = window.setTimeout(loadStatus, 1500);
          return;
        }

        setError(requestError.response?.data?.error || "Không thể đọc trạng thái thanh toán.");
        setLoading(false);
      }
    };

    void loadStatus();

    return () => {
      cancelled = true;
      window.clearTimeout(timerId);
    };
  }, [bookingId, hasStatusLookupInput, sessionId]);

  const handleResumeCheckout = async () => {
    if (!booking?.id) return;

    try {
      const response = await paymentApi.post("/payments/checkout-sessions", {
        bookingId: booking.id,
      });
      window.location.assign(response.data.checkoutSession.checkoutUrl);
    } catch (requestError) {
      const message =
        requestError.response?.data?.error || "Không thể tạo checkout session mới.";
      setError(message);
      toast.error(message);
    }
  };

  const StatusIcon = statusCopy.icon;

  return (
    <section className="page-section">
      <div className="shell-container section-stack">
        <div className="page-hero">
          <div>
            <p className="eyebrow">Payment return</p>
            <h1 className="section-title">Bella xác minh lại trạng thái thanh toán từ backend.</h1>
            <p className="section-copy">
              Redirect thành công từ provider không đủ để xác nhận booking. Trang này chỉ dựa vào
              trạng thái mà backend đã kiểm chứng.
            </p>
          </div>
        </div>

        <article className="panel">
          <div className="payment-panel-header">
            <div>
              <p className="eyebrow">Trạng thái hiện tại</p>
              <h2 className="panel-title">{statusCopy.title}</h2>
              <p className="section-copy section-copy-tight">{statusCopy.body}</p>
            </div>
            <span className={statusCopy.className}>
              <StatusIcon size={14} />
              {loading ? "Đang đồng bộ" : formatPaymentStatusLabel(paymentStatus)}
            </span>
          </div>

          <div className="booking-note-card booking-note-card-soft">
            <strong>
              <ShieldCheck size={16} /> Kết quả authoritative
            </strong>
            <p>
              Bella chỉ xác nhận sau khi trạng thái này được cập nhật phía server. Nếu provider còn
              đang xử lý, booking vẫn giữ ở trạng thái chờ.
            </p>
          </div>

          {error ? (
            <p className="field-error" data-testid="payment-return-error">
              {error}
            </p>
          ) : null}

          {payment || booking ? (
            <div className="booking-confirmation-card booking-confirmation-card-emphasis" data-testid="payment-return-result">
              <div className="booking-confirmation-row">
                <span>Mã đặt phòng</span>
                <strong>{booking?.bookingReference || "Đang tải"}</strong>
              </div>
              <div className="booking-confirmation-row">
                <span>Trạng thái booking</span>
                <strong>{formatBookingStatusLabel(booking?.status || "pending_payment")}</strong>
              </div>
              <div className="booking-confirmation-row">
                <span>Trạng thái payment</span>
                <strong>{formatPaymentStatusLabel(paymentStatus)}</strong>
              </div>
              <div className="booking-confirmation-row">
                <span>Tổng tiền</span>
                <strong>{formatCurrency(payment?.amount || booking?.totalPrice || 0)}</strong>
              </div>
              {booking?.combo ? (
                <div className="booking-confirmation-row">
                  <span>Combo đã chọn</span>
                  <strong>{booking.combo.name}</strong>
                </div>
              ) : null}
              {booking?.combo?.includedServices?.length ? (
                <div className="booking-confirmation-row booking-confirmation-row-stack">
                  <span>Dịch vụ bao gồm</span>
                  <strong>{booking.combo.includedServices.join(" · ")}</strong>
                </div>
              ) : null}
              {payment?.cardBrand && payment?.cardLast4 ? (
                <div className="booking-confirmation-row">
                  <span>Metadata thẻ an toàn</span>
                  <strong>
                    {payment.cardBrand.toUpperCase()} •••• {payment.cardLast4}
                  </strong>
                </div>
              ) : null}
              {payment?.failureMessage ? (
                <div className="booking-confirmation-row">
                  <span>Lý do thất bại</span>
                  <strong>{payment.failureMessage}</strong>
                </div>
              ) : null}
            </div>
          ) : null}

          <div className="post-booking-actions">
            {["failed", "cancelled", "expired"].includes(paymentStatus) ? (
              <button
                type="button"
                className="button button-primary button-block"
                onClick={handleResumeCheckout}
                data-testid="resume-checkout"
              >
                Tạo checkout session mới
              </button>
            ) : null}
            <Link to="/bookings" className="button button-secondary button-block">
              Xem đặt phòng của tôi
            </Link>
            <Link to="/lookup" className="button button-ghost button-block">
              Tra cứu bằng mã đặt phòng
            </Link>
          </div>
        </article>
      </div>
    </section>
  );
}
