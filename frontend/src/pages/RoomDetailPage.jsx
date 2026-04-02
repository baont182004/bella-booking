import { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import {
  ArrowLeft,
  BedDouble,
  Calendar,
  CheckCircle2,
  CreditCard,
  DoorOpen,
  Droplets,
  MapPin,
  ShieldCheck,
  Sparkles,
  Users,
} from "lucide-react";
import toast from "react-hot-toast";
import BookingBenefits from "../components/BookingBenefits";
import LoadingGrid from "../components/LoadingGrid";
import RoomHighlights from "../components/RoomHighlights";
import RoomPriceBlock from "../components/RoomPriceBlock";
import { useAuth } from "../context/AuthContext";
import { bellaContent } from "../content/bellaContent";
import { useBellaHotelData } from "../hooks/useBellaHotelData";
import { bookingApi, paymentApi } from "../services/api";
import {
  formatAccessModeLabel,
  formatCurrency,
  formatDateRange,
  formatGuestLabel,
  formatRoomCategory,
} from "../utils/formatters";
import {
  buildRoomGallery,
  getAmenityList,
  getBathroomFeatureTags,
  getCapacityLabel,
  getReadableBedSummary,
  getRoomFacts,
  getRoomHighlights,
  getSpaceTags,
  getViewTags,
} from "../utils/roomPresentation";

const paymentDefaults = {
  paymentMethod: "credit_card",
  cardNumber: "",
  cardHolderName: "",
  expiryDate: "",
  cvv: "",
};

function scrollToSection(sectionId) {
  document.getElementById(sectionId)?.scrollIntoView({ behavior: "smooth", block: "start" });
}

export default function RoomDetailPage() {
  const { code } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const { hotel, roomCatalog, loading, loadError } = useBellaHotelData();

  const [bookingData, setBookingData] = useState({
    checkInDate: "",
    checkOutDate: "",
    numGuests: 1,
    guestFullName: "",
    guestEmail: "",
    guestPhone: "",
    specialRequests: "",
  });
  const [bookingResult, setBookingResult] = useState(null);
  const [paymentData, setPaymentData] = useState(paymentDefaults);
  const [paymentResult, setPaymentResult] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const room = useMemo(
    () => roomCatalog.find((item) => item.code === code) || null,
    [code, roomCatalog],
  );

  useEffect(() => {
    if (!room) return;
    document.title = `${room.displayName} | Bella Hotel Phú Quốc`;
  }, [room]);

  useEffect(() => {
    const defaultFullName = [user?.firstName, user?.lastName].filter(Boolean).join(" ").trim();

    setBookingData((prev) => ({
      ...prev,
      guestFullName: prev.guestFullName || defaultFullName,
      guestEmail: prev.guestEmail || user?.email || "",
      guestPhone: prev.guestPhone || user?.phone || "",
    }));
  }, [user?.email, user?.firstName, user?.lastName, user?.phone]);

  useEffect(() => {
    if (!room?.capacity) return;
    if (Number(bookingData.numGuests) > room.capacity) {
      setBookingData((prev) => ({ ...prev, numGuests: room.capacity }));
    }
  }, [bookingData.numGuests, room?.capacity]);

  useEffect(() => {
    if (location.hash !== "#book" || loading) return;
    window.setTimeout(() => scrollToSection("book"), 120);
  }, [loading, location.hash]);

  const nights = useMemo(() => {
    if (!bookingData.checkInDate || !bookingData.checkOutDate) return 0;
    const start = new Date(bookingData.checkInDate);
    const end = new Date(bookingData.checkOutDate);
    const diff = Math.ceil((end - start) / (1000 * 60 * 60 * 24));
    return diff > 0 ? diff : 0;
  }, [bookingData.checkInDate, bookingData.checkOutDate]);

  const estimatedTotal = useMemo(() => {
    if (!room?.pricing?.currentPrice || nights === 0) return 0;
    return nights * Number(room.pricing.currentPrice);
  }, [nights, room]);

  const bookingFeedback = useMemo(() => {
    if (room?.capacity && Number(bookingData.numGuests || 1) > room.capacity) {
      return `Hạng phòng này cho phép tối đa ${formatGuestLabel(room.capacity)}.`;
    }

    if (
      bookingData.checkInDate &&
      bookingData.checkOutDate &&
      bookingData.checkOutDate <= bookingData.checkInDate
    ) {
      return "Ngày trả phòng phải sau ngày nhận phòng.";
    }

    return "";
  }, [bookingData.checkInDate, bookingData.checkOutDate, bookingData.numGuests, room]);

  const roomFacts = useMemo(() => getRoomFacts(room), [room]);
  const roomGallery = useMemo(
    () => buildRoomGallery(room, bellaContent.gallery),
    [room],
  );
  const roomViews = useMemo(() => getViewTags(room, 6), [room]);
  const roomHighlights = useMemo(() => getRoomHighlights(room, 8), [room]);
  const roomSpaces = useMemo(() => getSpaceTags(room), [room]);
  const bathroomFeatures = useMemo(() => getBathroomFeatureTags(room, 12), [room]);
  const amenityList = useMemo(() => getAmenityList(room, 24), [room]);

  const handleBookingChange = (event) => {
    const { name, value } = event.target;
    setBookingData((prev) => ({ ...prev, [name]: value }));
  };

  const handleCreateBooking = async (event) => {
    event.preventDefault();

    if (authLoading) return;

    if (!user?.id) {
      toast.error("Vui lòng đăng nhập để đặt hạng phòng này.");
      navigate("/login", { state: { redirectTo: `/rooms/${code}#book` } });
      return;
    }

    if (!room?.id || !room?.isLive) {
      toast.error("Hạng phòng này hiện chưa sẵn sàng để đặt trực tuyến.");
      return;
    }

    if (bookingFeedback) {
      toast.error(bookingFeedback);
      return;
    }

    if (nights === 0) {
      toast.error("Vui lòng chọn ngày nhận và trả phòng hợp lệ.");
      return;
    }

    try {
      setIsSubmitting(true);
      const response = await bookingApi.post("/bookings", {
        roomId: room.id,
        checkInDate: bookingData.checkInDate,
        checkOutDate: bookingData.checkOutDate,
        numGuests: Number(bookingData.numGuests || 1),
        guestFullName: bookingData.guestFullName,
        guestEmail: bookingData.guestEmail,
        guestPhone: bookingData.guestPhone || undefined,
        specialRequests: bookingData.specialRequests || undefined,
      });
      setBookingResult(response.data.booking);
      setPaymentResult(null);
      toast.success("Đã tạo đơn đặt phòng. Tiếp tục bước thanh toán.");
      scrollToSection("book");
    } catch (error) {
      toast.error(error.response?.data?.error || "Không thể tạo đơn đặt phòng.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handlePaymentChange = (event) => {
    const { name, value } = event.target;
    setPaymentData((prev) => ({ ...prev, [name]: value }));
  };

  const handlePayment = async (event) => {
    event.preventDefault();

    if (!bookingResult?.id) return;

    try {
      setIsSubmitting(true);
      const response = await paymentApi.post("/payments", {
        bookingId: bookingResult.id,
        paymentMethod: paymentData.paymentMethod,
        cardNumber: paymentData.cardNumber,
        cardHolderName: paymentData.cardHolderName,
        expiryDate: paymentData.expiryDate,
        cvv: paymentData.cvv,
      });
      setPaymentResult(response.data.payment);
      toast.success("Đã ghi nhận thanh toán. Đơn lưu trú của bạn đã được xác nhận.");
    } catch (error) {
      toast.error(error.response?.data?.error || "Không thể xử lý thanh toán.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const today = new Date().toISOString().split("T")[0];

  if (loading) {
    return (
      <section className="page-section">
        <div className="shell-container section-stack">
          <LoadingGrid count={1} />
        </div>
      </section>
    );
  }

  if (!room) {
    return (
      <section className="page-section">
        <div className="shell-container section-stack">
          <div className="empty-state">
            <div className="empty-state-stack">
              <p>Không tìm thấy hạng phòng này tại Bella.</p>
              <span>Quay lại danh sách phòng để chọn một lựa chọn lưu trú khác.</span>
              <Link to="/#rooms" className="button button-primary">
                Quay lại danh sách phòng
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
        <div className="room-detail-page">
          <div className="room-detail-breadcrumbs">
            <Link to="/#rooms" className="text-link room-back-link">
              <ArrowLeft size={16} />
              Quay lại danh sách phòng
            </Link>
          </div>

          {loadError ? (
            <div className="status-banner status-banner-warning">
              Hiện chưa thể làm mới dữ liệu phòng trực tuyến. Thông tin bên dưới vẫn dùng bộ dữ
              liệu phòng đã được chuẩn hóa của Bella.
            </div>
          ) : null}

          <section className="room-detail-hero">
            <div className="room-detail-hero-copy">
              <p className="eyebrow">Chi tiết hạng phòng</p>
              <div className="room-detail-title-row">
                <div>
                  <h1 className="section-title section-title-small">{room.displayName}</h1>
                  <p className="section-copy section-copy-tight">{room.summary}</p>
                </div>
                <RoomPriceBlock room={room} variant="detail" />
              </div>

              <div className="detail-trust-row">
                <span className="detail-trust-pill">
                  <Sparkles size={16} />
                  {formatRoomCategory(room.category)}
                </span>
                {getCapacityLabel(room) ? (
                  <span className="detail-trust-pill">
                    <Users size={16} />
                    {getCapacityLabel(room)}
                  </span>
                ) : null}
                <span className="detail-trust-pill">
                  <MapPin size={16} />
                  {hotel?.name || bellaContent.property.name}
                </span>
                <span className="detail-trust-pill">
                  <ShieldCheck size={16} />
                  Đặt phòng được hệ thống xác nhận
                </span>
              </div>

              <RoomHighlights items={roomViews} className="room-chip-row-tight" />
              <RoomHighlights items={roomHighlights} className="room-chip-row-tight" />

              {room.dataWarnings?.length ? (
                <div className="booking-note-card booking-note-card-soft">
                  <strong>Lưu ý dữ liệu</strong>
                  <p>{room.dataWarnings[0]}</p>
                </div>
              ) : null}
            </div>

            <div className="room-detail-gallery">
              <div className="room-detail-gallery-primary">
                <img
                  src={roomGallery[0]?.src || bellaContent.gallery[0].src}
                  alt={roomGallery[0]?.alt || room.displayName}
                />
              </div>
              <div className="room-detail-gallery-strip">
                {roomGallery.slice(1).map((image) => (
                  <div key={image.src} className="room-detail-gallery-item">
                    <img src={image.src} alt={image.alt} />
                  </div>
                ))}
              </div>
            </div>
          </section>

          <div className="detail-grid">
            <div className="detail-column">
              <article className="room-section-card">
                <div className="room-section-heading">
                  <h2>Thông tin cơ bản</h2>
                  <p>Các dữ kiện chính được gom gọn để bạn xem nhanh trước khi đặt phòng.</p>
                </div>
                <div className="room-fact-grid">
                  {roomFacts.map((fact) => (
                    <div key={fact.label} className="room-fact-card">
                      <span>{fact.label}</span>
                      <strong>{fact.value}</strong>
                    </div>
                  ))}
                </div>
              </article>

              <article className="room-section-card">
                <div className="room-section-heading">
                  <h2>Cấu hình giường</h2>
                  <p>{getReadableBedSummary(room.bedConfigs, 3)}</p>
                </div>
                <div className="info-list">
                  {room.bedConfigs.map((config) => (
                    <div key={config.label}>
                      <span>Bố trí giường</span>
                      <strong>{config.label}</strong>
                    </div>
                  ))}
                </div>
              </article>

              <article className="room-section-card">
                <div className="room-section-heading">
                  <h2>Tầm nhìn và bố cục</h2>
                  <p>Cách hạng phòng này mở ra không gian nghỉ ngơi và hướng nhìn xung quanh.</p>
                </div>
                <RoomHighlights items={roomViews} />
                {roomSpaces.length ? (
                  <>
                    <p className="section-copy section-copy-tight">Không gian đi kèm</p>
                    <RoomHighlights items={roomSpaces} />
                  </>
                ) : null}
              </article>

              <article className="room-section-card">
                <div className="room-section-heading">
                  <h2>Tiện nghi phòng tắm</h2>
                  <p>Những chi tiết nhỏ nhưng quan trọng khi bạn bắt đầu lưu trú.</p>
                </div>
                <RoomHighlights items={bathroomFeatures} />
              </article>

              <article className="room-section-card">
                <div className="room-section-heading">
                  <h2>Tiện nghi trong phòng</h2>
                  <p>Toàn bộ tiện nghi đã được cấu trúc cho hạng phòng này.</p>
                </div>
                <RoomHighlights items={amenityList} />
              </article>

              <BookingBenefits room={room} />

              <article className="room-section-card">
                <div className="room-section-heading">
                  <h2>Chính sách</h2>
                  <p>Một số chi tiết cần xem qua trước khi xác nhận đặt phòng.</p>
                </div>
                <div className="info-list">
                  <div>
                    <span>Hút thuốc</span>
                    <strong>
                      {room.policies?.smoking === "non_smoking"
                        ? "Phòng không hút thuốc"
                        : "Chưa có thông tin"}
                    </strong>
                  </div>
                  {room.accessibility?.accessModes?.length ? (
                    <div>
                      <span>Lối tiếp cận</span>
                      <strong>
                        {room.accessibility.accessModes.map((item) => formatAccessModeLabel(item)).join(" / ")}
                      </strong>
                    </div>
                  ) : null}
                  {room.accessibility?.accessNote ? (
                    <div>
                      <span>Ghi chú tiếp cận</span>
                      <strong>{room.accessibility.accessNote}</strong>
                    </div>
                  ) : null}
                  <div>
                    <span>Nhận / trả phòng</span>
                    <strong>
                      {bellaContent.policies.checkIn[0]} · {bellaContent.policies.checkOut[0]}
                    </strong>
                  </div>
                </div>
              </article>
            </div>

            <aside className="detail-column detail-column-sticky" id="book">
              <div className="panel booking-panel room-booking-panel">
                <div className="panel-heading">
                  <div>
                    <p className="eyebrow">Đặt phòng trực tiếp</p>
                    <h2 className="panel-title">Giữ chỗ tại Bella</h2>
                  </div>
                  {bookingResult ? (
                    <span className="status-pill status-pill-pending">Đã tạo đơn</span>
                  ) : null}
                </div>

                <div className="booking-room-summary">
                  <img
                    src={room.images?.[0] || bellaContent.gallery[0].src}
                    alt={room.displayName}
                    className="booking-room-image"
                  />
                  <div>
                    <h3>{room.displayName}</h3>
                    <p>
                      {[room.areaSqm ? `${room.areaSqm} m2` : null, getReadableBedSummary(room.bedConfigs)]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                    <RoomHighlights items={getRoomHighlights(room, 4)} className="room-chip-row-tight" />
                  </div>
                </div>

                {!room.isLive ? (
                  <div className="empty-state empty-state-inline">
                    <div className="empty-state-stack">
                      <p>Hạng phòng này hiện chưa mở đặt trực tuyến.</p>
                      <span>Xem lại thông tin phía trên hoặc quay lại danh sách phòng để chọn lựa chọn khác.</span>
                    </div>
                  </div>
                ) : null}

                <form className="form-stack" onSubmit={handleCreateBooking}>
                  <div className="form-grid">
                    <label className="form-field">
                      <span>Ngày nhận phòng</span>
                      <span className="input-shell">
                        <Calendar size={16} />
                        <input
                          type="date"
                          name="checkInDate"
                          min={today}
                          value={bookingData.checkInDate}
                          onChange={handleBookingChange}
                          required
                        />
                      </span>
                    </label>

                    <label className="form-field">
                      <span>Ngày trả phòng</span>
                      <span className="input-shell">
                        <Calendar size={16} />
                        <input
                          type="date"
                          name="checkOutDate"
                          min={bookingData.checkInDate || today}
                          value={bookingData.checkOutDate}
                          onChange={handleBookingChange}
                          required
                        />
                      </span>
                    </label>
                  </div>

                  <label className="form-field">
                    <span>Số khách</span>
                    <span className="input-shell">
                      <Users size={16} />
                      <input
                        type="number"
                        name="numGuests"
                        min="1"
                        max={room.capacity || 8}
                        value={bookingData.numGuests}
                        onChange={handleBookingChange}
                        required
                      />
                    </span>
                  </label>

                  <label className="form-field">
                    <span>Họ và tên khách lưu trú</span>
                    <input
                      name="guestFullName"
                      className="text-input"
                      value={bookingData.guestFullName}
                      onChange={handleBookingChange}
                      autoComplete="name"
                      placeholder="Nhập họ tên người lưu trú"
                      required
                    />
                  </label>

                  <div className="form-grid">
                    <label className="form-field">
                      <span>Email</span>
                      <input
                        type="email"
                        name="guestEmail"
                        className="text-input"
                        value={bookingData.guestEmail}
                        onChange={handleBookingChange}
                        autoComplete="email"
                        placeholder="tenban@example.com"
                        required
                      />
                    </label>

                    <label className="form-field">
                      <span>Số điện thoại</span>
                      <input
                        name="guestPhone"
                        className="text-input"
                        value={bookingData.guestPhone}
                        onChange={handleBookingChange}
                        autoComplete="tel"
                        placeholder="+84 000 000 000"
                      />
                    </label>
                  </div>

                  <label className="form-field">
                    <span>Yêu cầu thêm</span>
                    <textarea
                      name="specialRequests"
                      className="textarea-shell"
                      placeholder="Ví dụ: đến muộn, ghi chú đưa đón, yêu cầu về gối..."
                      value={bookingData.specialRequests}
                      onChange={handleBookingChange}
                    />
                  </label>

                  {bookingFeedback ? (
                    <p className="field-error">{bookingFeedback}</p>
                  ) : (
                    <p className="field-note">
                      Hệ thống sẽ xác nhận hạng phòng, ngày lưu trú, sức chứa và tổng tiền cuối
                      cùng trước khi tạo đơn đặt phòng.
                    </p>
                  )}

                  <div className="price-summary">
                    <div>
                      <span>Thời gian lưu trú</span>
                      <strong>
                        {bookingData.checkInDate && bookingData.checkOutDate
                          ? formatDateRange(bookingData.checkInDate, bookingData.checkOutDate)
                          : "Chọn ngày lưu trú"}
                      </strong>
                    </div>
                    <div>
                      <span>Số khách</span>
                      <strong>{formatGuestLabel(bookingData.numGuests)}</strong>
                    </div>
                    <div>
                      <span>Giá phòng hiện tại</span>
                      <strong>
                        {room.pricing?.currentPrice
                          ? formatCurrency(room.pricing.currentPrice)
                          : "Hiển thị khi giá trực tuyến sẵn sàng"}
                      </strong>
                    </div>
                    <div>
                      <span>Tạm tính</span>
                      <strong>{estimatedTotal ? formatCurrency(estimatedTotal) : "Chờ chọn ngày"}</strong>
                    </div>
                  </div>

                  <div className="booking-note-card">
                    <strong>Quy trình thanh toán</strong>
                    <p>
                      Website hiện xác nhận đơn đặt phòng bằng bước thanh toán thẻ ở ngay bên dưới
                      sau khi đơn được tạo thành công.
                    </p>
                  </div>

                  <button
                    type="submit"
                    className="button button-primary button-block"
                    disabled={isSubmitting || authLoading || !room.isLive || Boolean(bookingResult)}
                  >
                    {bookingResult
                      ? "Đã tạo đơn đặt phòng"
                      : user?.id
                        ? "Đặt phòng này"
                        : "Đăng nhập để đặt phòng"}
                  </button>
                </form>

                {bookingResult ? (
                  <div className="booking-confirmation-card">
                    <div className="booking-confirmation-row">
                      <span>Tổng tiền từ hệ thống</span>
                      <strong>{formatCurrency(bookingResult.totalPrice)}</strong>
                    </div>
                    <div className="booking-confirmation-row">
                      <span>Số đêm</span>
                      <strong>
                        {bookingResult.nights} đêm
                      </strong>
                    </div>
                  </div>
                ) : null}
              </div>

              {bookingResult ? (
                <div className="panel payment-panel">
                  <div className="payment-panel-header">
                    <div>
                      <p className="eyebrow">Thanh toán</p>
                      <h2 className="panel-title">Hoàn tất xác nhận đặt phòng</h2>
                      <p className="section-copy section-copy-tight">
                        Tổng tiền được hệ thống xác nhận: {formatCurrency(bookingResult.totalPrice)}
                      </p>
                    </div>
                    <span
                      className={
                        paymentResult
                          ? "status-pill status-pill-confirmed"
                          : "status-pill status-pill-pending"
                      }
                    >
                      <CheckCircle2 size={14} />
                      {paymentResult ? "Đã xác nhận" : "Sẵn sàng thanh toán"}
                    </span>
                  </div>

                  <form className="form-stack" onSubmit={handlePayment}>
                    <label className="form-field">
                      <span>Hình thức thanh toán</span>
                      <span className="input-shell">
                        <CreditCard size={16} />
                        <select
                          name="paymentMethod"
                          value={paymentData.paymentMethod}
                          onChange={handlePaymentChange}
                        >
                          <option value="credit_card">Thẻ tín dụng</option>
                          <option value="debit_card">Thẻ ghi nợ</option>
                        </select>
                      </span>
                    </label>

                    <label className="form-field">
                      <span>Số thẻ</span>
                      <input
                        name="cardNumber"
                        className="text-input"
                        value={paymentData.cardNumber}
                        onChange={handlePaymentChange}
                        inputMode="numeric"
                        autoComplete="cc-number"
                        placeholder="4111 1111 1111 1111"
                        required
                      />
                    </label>

                    <label className="form-field">
                      <span>Tên chủ thẻ</span>
                      <input
                        name="cardHolderName"
                        className="text-input"
                        value={paymentData.cardHolderName}
                        onChange={handlePaymentChange}
                        autoComplete="cc-name"
                        placeholder="Tên in trên thẻ"
                        required
                      />
                    </label>

                    <div className="form-grid">
                      <label className="form-field">
                        <span>Hiệu lực</span>
                        <input
                          name="expiryDate"
                          className="text-input"
                          placeholder="MM/YY"
                          value={paymentData.expiryDate}
                          onChange={handlePaymentChange}
                          autoComplete="cc-exp"
                          required
                        />
                      </label>
                      <label className="form-field">
                        <span>CVV</span>
                        <input
                          name="cvv"
                          className="text-input"
                          placeholder="123"
                          value={paymentData.cvv}
                          onChange={handlePaymentChange}
                          inputMode="numeric"
                          autoComplete="cc-csc"
                          required
                        />
                      </label>
                    </div>

                    <div className="booking-note-card booking-note-card-soft">
                      <strong>Phương thức xác nhận hiện tại</strong>
                      <p>Website hiện ghi nhận thanh toán thẻ như bước xác nhận đơn đặt phòng.</p>
                    </div>

                    <button
                      type="submit"
                      className="button button-primary button-block"
                      disabled={isSubmitting || Boolean(paymentResult)}
                    >
                      {paymentResult
                        ? "Đã ghi nhận thanh toán"
                        : `Thanh toán ${formatCurrency(bookingResult.totalPrice)}`}
                    </button>
                  </form>

                  {paymentResult ? (
                    <Link to="/bookings" className="button button-secondary button-block">
                      Xem đơn đặt phòng của tôi
                    </Link>
                  ) : null}
                </div>
              ) : null}

              <div className="panel panel-soft room-stay-note">
                <div className="room-stay-note-row">
                  <DoorOpen size={18} />
                  <div>
                    <strong>{bellaContent.policies.checkIn[0]}</strong>
                    <p>{bellaContent.policies.checkOut[0]}</p>
                  </div>
                </div>
                <div className="room-stay-note-row">
                  <Droplets size={18} />
                  <div>
                    <strong>{hotel?.name || bellaContent.property.name}</strong>
                    <p>{bellaContent.property.address}</p>
                  </div>
                </div>
                <div className="room-stay-note-row">
                  <BedDouble size={18} />
                  <div>
                    <strong>{getReadableBedSummary(room.bedConfigs, 3)}</strong>
                    <p>{formatRoomCategory(room.category)} tại Bella Hotel Phú Quốc</p>
                  </div>
                </div>
              </div>
            </aside>
          </div>
        </div>
      </div>
    </section>
  );
}
