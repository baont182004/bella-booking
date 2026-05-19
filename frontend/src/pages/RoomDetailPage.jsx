import { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import {
  ArrowLeft,
  BedDouble,
  Calendar,
  CheckCircle2,
  CreditCard,
  Gift,
  DoorOpen,
  Droplets,
  Landmark,
  MapPin,
  ShieldCheck,
  Sparkles,
  Users,
} from "lucide-react";
import toast from "react-hot-toast";
import BookingBenefits from "../components/BookingBenefits";
import BookingSummary from "../components/BookingSummary";
import ComboCard from "../components/ComboCard";
import LoadingGrid from "../components/LoadingGrid";
import PriceBreakdown from "../components/PriceBreakdown";
import PromotionCodeInput from "../components/PromotionCodeInput";
import RoomHighlights from "../components/RoomHighlights";
import RoomPriceBlock from "../components/RoomPriceBlock";
import { useAuth } from "../context/auth-context";
import { bellaContent } from "../content/bellaContent";
import { useBellaHotelData } from "../hooks/useBellaHotelData";
import { useCombos } from "../hooks/useCombos";
import { bookingApi, paymentApi } from "../services/api";
import {
  formatAccessModeLabel,
  formatBookingStatusLabel,
  formatCurrency,
  formatDateRange,
  formatGuestLabel,
  formatRoomCodeTitle,
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

function scrollToSection(sectionId) {
  document.getElementById(sectionId)?.scrollIntoView({ behavior: "smooth", block: "start" });
}

function formatCountdown(targetDate, nowDate = new Date()) {
  if (!targetDate) return "";
  const remainingMs = new Date(targetDate).getTime() - nowDate.getTime();
  if (!Number.isFinite(remainingMs) || remainingMs <= 0) return "00:00";
  const totalSeconds = Math.floor(remainingMs / 1000);
  const minutes = String(Math.floor(totalSeconds / 60)).padStart(2, "0");
  const seconds = String(totalSeconds % 60).padStart(2, "0");
  return `${minutes}:${seconds}`;
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
    promotionCode: "",
  });
  const [bookingResult, setBookingResult] = useState(null);
  const [checkoutSession, setCheckoutSession] = useState(null);
  const [checkoutError, setCheckoutError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [availabilityResult, setAvailabilityResult] = useState(null);
  const [isCheckingAvailability, setIsCheckingAvailability] = useState(false);
  const [selectedComboSlug, setSelectedComboSlug] = useState("");
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState("");
  const [statusChecking, setStatusChecking] = useState(false);
  const [now, setNow] = useState(() => new Date());

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
    if (location.hash !== "#book" || loading) return undefined;

    const timeoutId = window.setTimeout(() => scrollToSection("book"), 120);
    return () => window.clearTimeout(timeoutId);
  }, [loading, location.hash]);

  useEffect(() => {
    if (!bookingResult?.paymentExpiresAt) return undefined;
    const timerId = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(timerId);
  }, [bookingResult?.paymentExpiresAt]);

  const nights = useMemo(() => {
    if (!bookingData.checkInDate || !bookingData.checkOutDate) return 0;
    const start = new Date(bookingData.checkInDate);
    const end = new Date(bookingData.checkOutDate);
    const diff = Math.ceil((end - start) / (1000 * 60 * 60 * 24));
    return diff > 0 ? diff : 0;
  }, [bookingData.checkInDate, bookingData.checkOutDate]);

  const comboFilters = useMemo(
    () => ({
      roomType: room?.code || room?.room_type || "",
      guestCount: bookingData.numGuests,
      nights: nights || "",
      sort: "displayOrder",
    }),
    [bookingData.numGuests, nights, room?.code, room?.room_type],
  );
  const { combos: availableCombos, loading: combosLoading, error: combosError } = useCombos(comboFilters);

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
  const roomGallery = useMemo(() => buildRoomGallery(room, bellaContent.gallery), [room]);
  const roomViews = useMemo(() => getViewTags(room, 6), [room]);
  const roomHighlights = useMemo(() => getRoomHighlights(room, 8), [room]);
  const roomSpaces = useMemo(() => getSpaceTags(room), [room]);
  const bathroomFeatures = useMemo(() => getBathroomFeatureTags(room, 12), [room]);
  const amenityList = useMemo(() => getAmenityList(room, 24), [room]);
  const roomAlias = useMemo(() => {
    const nextAlias = room?.name?.en || formatRoomCodeTitle(room?.code || "");
    return nextAlias && nextAlias.toLowerCase() !== room?.displayName?.toLowerCase()
      ? nextAlias
      : "";
  }, [room]);

  const reservationStage = bookingResult?.status === "confirmed" ? "paid" : bookingResult ? "reserved" : "planning";
  const appliedPromotion = bookingResult?.promotion || availabilityResult?.promotion || null;
  const selectedCombo = useMemo(
    () => availableCombos.find((combo) => combo.slug === selectedComboSlug) || null,
    [availableCombos, selectedComboSlug],
  );
  const appliedCombo = bookingResult?.combo || availabilityResult?.combo || selectedCombo;
  const serverEstimatedTotal = bookingResult?.totalPrice || availabilityResult?.totalPrice || estimatedTotal;
  const activePriceBreakdown = bookingResult?.priceSnapshot?.breakdown || availabilityResult?.priceBreakdown || null;
  const canSubmitBooking =
    room?.isLive &&
    !isSubmitting &&
    !authLoading &&
    !bookingResult &&
    (!availabilityResult || availabilityResult.available !== false);
  const holdCountdown = bookingResult?.paymentExpiresAt
    ? formatCountdown(bookingResult.paymentExpiresAt, now)
    : "";

  const reservationSteps = [
    {
      id: "planning",
      label: "1. Chọn ngày và combo",
      helper: "Kiểm tra ngày lưu trú, sức chứa, combo và giá hiện tại.",
    },
    {
      id: "reserved",
      label: "2. Giữ chỗ",
      helper: "Bella tạo mã đặt phòng và khóa thông tin cho bạn.",
    },
    {
      id: "paid",
      label: "3. Xác nhận",
      helper: "Bella chỉ xác nhận sau khi cổng thanh toán gửi kết quả đã được backend kiểm chứng.",
    },
  ];

  const handleBookingChange = (event) => {
    const { name, value } = event.target;
    setBookingData((prev) => ({ ...prev, [name]: value }));
  };

  const handleCreateBooking = async (event) => {
    event.preventDefault();

    if (authLoading) return;

    if (bookingFeedback) {
      toast.error("Bella chưa thể giữ chỗ với thông tin ngày ở hiện tại.");
      return;
    }

    if (nights === 0) {
      toast.error("Vui lòng chọn ngày nhận và trả phòng hợp lệ.");
      return;
    }

    if (!user?.id) {
      toast.error("Vui lòng đăng nhập để giữ chỗ hạng phòng này.");
      navigate("/login", { state: { redirectTo: `/rooms/${code}#book` } });
      return;
    }

    if (!room?.id || !room?.isLive) {
      toast.error("Hạng phòng này hiện chưa sẵn sàng để đặt trực tuyến.");
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
        comboSlug: selectedComboSlug || undefined,
        promotionCode: bookingData.promotionCode.trim().toUpperCase() || undefined,
      });
      setBookingResult(response.data.booking);
      setCheckoutSession(null);
      setCheckoutError("");
      toast.success("Bella đã tạo mã đặt phòng. Bạn có thể chuyển sang cổng thanh toán sandbox.");
      scrollToSection("book");
    } catch (error) {
      toast.error(error.response?.data?.error || "Không thể tạo đơn đặt phòng.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCheckAvailability = async () => {
    if (!room?.id || bookingFeedback || nights === 0) {
      toast.error("Hãy nhập ngày lưu trú hợp lệ trước khi kiểm tra phòng.");
      return;
    }

    try {
      setIsCheckingAvailability(true);
      const response = await bookingApi.get("/bookings/availability", {
        params: {
          roomId: room.id,
          checkInDate: bookingData.checkInDate,
          checkOutDate: bookingData.checkOutDate,
          numGuests: Number(bookingData.numGuests || 1),
          comboSlug: selectedComboSlug || undefined,
          promotionCode: bookingData.promotionCode.trim().toUpperCase() || undefined,
        },
      });
      setAvailabilityResult(response.data);
      toast.success(
        response.data.available
          ? "Bella đã xác nhận hạng phòng này còn trống cho thời gian bạn chọn."
          : response.data.reason || "Bella hiện chưa thể xác nhận phòng này.",
      );
    } catch (error) {
      setAvailabilityResult(null);
      toast.error(error.response?.data?.error || "Không thể kiểm tra tình trạng phòng.");
    } finally {
      setIsCheckingAvailability(false);
    }
  };

  const handleStartCheckout = async (paymentMethodType = "hosted_checkout") => {
    if (!bookingResult?.id) return;

    try {
      setIsSubmitting(true);
      setSelectedPaymentMethod(paymentMethodType);
      setCheckoutError("");
      const response = await paymentApi.post("/payments/checkout-sessions", {
        bookingId: bookingResult.id,
        paymentMethodType,
        billingName: bookingData.guestFullName || undefined,
        billingEmail: bookingData.guestEmail || undefined,
      });
      const nextCheckoutSession = response.data.checkoutSession;
      setCheckoutSession(nextCheckoutSession);
      if (nextCheckoutSession.checkoutUrl) {
        window.location.assign(nextCheckoutSession.checkoutUrl);
      } else if (nextCheckoutSession.qrCode) {
        toast.success("Bella đã tạo mã QR ngân hàng. Hãy quét mã để thanh toán.");
      }
    } catch (error) {
      const nextCheckoutError =
        error.response?.data?.error || "Không thể khởi tạo cổng thanh toán.";
      setCheckoutError(nextCheckoutError);
      toast.error(nextCheckoutError);
    } finally {
      setIsSubmitting(false);
      setSelectedPaymentMethod("");
    }
  };

  const handleCheckPaymentStatus = async () => {
    if (!checkoutSession?.sessionId) return;

    try {
      setStatusChecking(true);
      const response = await paymentApi.get(`/payments/checkout-sessions/${checkoutSession.sessionId}/status`);
      const nextBooking = response.data.booking;
      const nextPayment = response.data.payment;
      if (nextBooking) {
        setBookingResult((previous) => ({
          ...(previous || {}),
          ...nextBooking,
          bookingReference: nextBooking.bookingReference || previous?.bookingReference,
          totalPrice: nextBooking.totalPrice || previous?.totalPrice,
        }));
      }

      if (nextPayment?.paymentStatus === "succeeded") {
        toast.success("Bella đã xác nhận thanh toán thành công.");
      } else {
        toast("Bella vẫn đang chờ ngân hàng xác nhận giao dịch.");
      }
    } catch (error) {
      toast.error(error.response?.data?.error || "Chưa thể kiểm tra trạng thái thanh toán.");
    } finally {
      setStatusChecking(false);
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
              <Link to="/rooms" className="button button-primary">
                Quay lại danh sách hạng phòng
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
            <Link to="/rooms" className="text-link room-back-link" data-testid="back-to-rooms">
              <ArrowLeft size={16} />
              Quay lại danh sách hạng phòng
            </Link>
          </div>

          {loadError ? (
            <div className="status-banner status-banner-warning">
              Bella chưa thể làm mới dữ liệu phòng trực tuyến. Phần thông tin dưới đây vẫn dùng bộ
              dữ liệu phòng đã được chuẩn hóa để bạn tiếp tục tham khảo.
            </div>
          ) : null}

          <section className="room-detail-hero">
            <div className="room-detail-hero-copy">
              <p className="eyebrow">Chi tiết hạng phòng</p>
              <div className="room-detail-title-row">
                <div>
                  <h1 className="section-title section-title-small">
                    <span>{room.displayName}</span>
                    {roomAlias ? <span className="room-title-alias">{roomAlias}</span> : null}
                  </h1>
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
                  Xác nhận trực tiếp trong hệ thống Bella
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
                  <h2>Phù hợp khi nào?</h2>
                  <p>Bella tóm tắt nhanh để bạn nhận biết hạng phòng này hợp với kiểu lưu trú nào.</p>
                </div>
                <div className="info-list">
                  <div>
                    <span>Kiểu nghỉ phù hợp</span>
                    <strong>
                      {room.category === "apartment"
                        ? "Gia đình hoặc nhóm bạn cần không gian sinh hoạt rộng hơn."
                        : room.category === "studio"
                          ? "Khách muốn sự gọn gàng nhưng vẫn có khu bếp riêng."
                          : "Kỳ nghỉ ngắn ngày, thoải mái và dễ chọn."}
                    </strong>
                  </div>
                  <div>
                    <span>Điểm nhấn chính</span>
                    <strong>
                      {getRoomHighlights(room, 3).join(" · ") ||
                        "Không gian nghỉ ngơi tiêu chuẩn tại Bella."}
                    </strong>
                  </div>
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
                  <p>Toàn bộ tiện nghi đã được cấu trúc lại để bạn quét nhanh hơn.</p>
                </div>
                <RoomHighlights items={amenityList} />
              </article>

              <BookingBenefits room={room} />

              <article className="room-section-card">
                <div className="room-section-heading">
                  <h2>Chính sách lưu trú</h2>
                  <p>Một số chi tiết nên đọc qua trước khi Bella xác nhận đơn đặt phòng của bạn.</p>
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
                        {room.accessibility.accessModes
                          .map((item) => formatAccessModeLabel(item))
                          .join(" / ")}
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
                    <p className="eyebrow">Đặt trực tiếp tại Bella</p>
                    <h2 className="panel-title">Giữ chỗ theo luồng rõ ràng</h2>
                  </div>
                  <span
                    className={
                      reservationStage === "paid"
                        ? "status-pill status-pill-confirmed"
                        : reservationStage === "reserved"
                          ? "status-pill status-pill-pending"
                          : "status-pill"
                    }
                  >
                    {reservationStage === "paid"
                      ? "Đã xác nhận"
                      : reservationStage === "reserved"
                        ? "Đã giữ chỗ"
                        : "Bắt đầu đặt phòng"}
                  </span>
                </div>

                <div className="reservation-steps" aria-label="Quy trình đặt phòng">
                  {reservationSteps.map((step) => {
                    const isCurrent =
                      (step.id === "planning" && reservationStage === "planning") ||
                      (step.id === "reserved" && reservationStage === "reserved") ||
                      (step.id === "paid" && reservationStage === "paid");
                    const isComplete =
                      (step.id === "planning" && reservationStage !== "planning") ||
                      (step.id === "reserved" && reservationStage === "paid");

                    return (
                      <div
                        key={step.id}
                        className={
                          isCurrent
                            ? "reservation-step reservation-step-current"
                            : isComplete
                              ? "reservation-step reservation-step-complete"
                              : "reservation-step"
                        }
                      >
                        <strong>{step.label}</strong>
                        <span>{step.helper}</span>
                      </div>
                    );
                  })}
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
                      {[
                        room.areaSqm ? `${room.areaSqm} m2` : null,
                        getReadableBedSummary(room.bedConfigs),
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                    <RoomHighlights
                      items={getRoomHighlights(room, 4)}
                      className="room-chip-row-tight"
                    />
                  </div>
                </div>

                <BookingSummary
                  checkInDate={bookingData.checkInDate}
                  checkOutDate={bookingData.checkOutDate}
                  guests={bookingData.numGuests}
                  combo={appliedCombo}
                  total={serverEstimatedTotal}
                />

                {!room.isLive ? (
                  <div className="empty-state empty-state-inline">
                    <div className="empty-state-stack">
                      <p>Hạng phòng này hiện chưa mở đặt trực tuyến.</p>
                      <span>
                        Bạn vẫn có thể xem đầy đủ thông tin phòng và quay lại danh sách để chọn
                        hạng phòng khác đang sẵn sàng nhận đặt.
                      </span>
                    </div>
                  </div>
                ) : null}

                {!user?.id ? (
                  <div className="booking-note-card booking-note-card-soft">
                    <strong>Chưa đăng nhập?</strong>
                    <p>
                      Bạn vẫn có thể chọn ngày ở và xem tổng tiền trước. Bella sẽ đưa bạn về đúng
                      bước giữ chỗ sau khi đăng nhập.
                    </p>
                  </div>
                ) : null}

                <form className="form-stack" onSubmit={handleCreateBooking} data-testid="booking-form">
                  <div className="booking-form-section">
                    <div className="booking-form-section-head">
                      <p className="eyebrow">Bước 1</p>
                      <h3>Chọn ngày lưu trú</h3>
                      <p>Hãy bắt đầu bằng thời gian ở và số khách để Bella kiểm tra lại sức chứa.</p>
                    </div>

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
                            data-testid="booking-check-in"
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
                            data-testid="booking-check-out"
                            required
                          />
                        </span>
                      </label>
                    </div>

                    <label className="form-field">
                      <span>Số khách lưu trú</span>
                      <span className="input-shell">
                        <Users size={16} />
                        <input
                          type="number"
                          name="numGuests"
                          min="1"
                          max={room.capacity || 8}
                          value={bookingData.numGuests}
                          onChange={handleBookingChange}
                          data-testid="booking-guests"
                          required
                        />
                      </span>
                    </label>
                  </div>

                  <div className="booking-form-section combo-picker-section">
                    <div className="booking-form-section-head">
                      <p className="eyebrow">Bước 3</p>
                      <h3>Chọn combo cho chuyến đi</h3>
                      <p>
                        Chọn một combo để chuyến đi Phú Quốc trọn vẹn hơn. Bạn vẫn có thể đặt phòng
                        mà không chọn combo.
                      </p>
                    </div>

                    <button
                      type="button"
                      className={selectedComboSlug ? "combo-none-option" : "combo-none-option combo-none-option-active"}
                      onClick={() => {
                        setSelectedComboSlug("");
                        setAvailabilityResult(null);
                      }}
                    >
                      <Gift size={17} />
                      <span>Không chọn combo</span>
                      <strong>Chỉ đặt phòng</strong>
                    </button>

                    {combosLoading ? (
                      <LoadingGrid count={2} className="combo-picker-grid loading-grid" />
                    ) : combosError ? (
                      <p className="field-error">{combosError}</p>
                    ) : availableCombos.length ? (
                      <div className="combo-picker-grid">
                        {availableCombos.slice(0, 3).map((combo) => (
                          <ComboCard
                            key={combo.id}
                            combo={combo}
                            compact
                            selected={selectedComboSlug === combo.slug}
                            onSelect={(nextCombo) => {
                              setSelectedComboSlug(nextCombo.slug);
                              setAvailabilityResult(null);
                            }}
                          />
                        ))}
                      </div>
                    ) : (
                      <p className="field-note">
                        Chưa có combo phù hợp với hạng phòng, số khách hoặc thời gian lưu trú này.
                      </p>
                    )}
                  </div>

                  <div className="booking-breakdown">
                    <div className="booking-breakdown-row">
                      <span>Thời gian lưu trú</span>
                      <strong>
                        {bookingData.checkInDate && bookingData.checkOutDate
                          ? formatDateRange(bookingData.checkInDate, bookingData.checkOutDate)
                          : "Chọn ngày lưu trú"}
                      </strong>
                    </div>
                    <div className="booking-breakdown-row">
                      <span>Giá hiện tại</span>
                      <strong>
                        {room.pricing?.currentPrice
                          ? `${formatCurrency(room.pricing.currentPrice)} / đêm`
                          : "Bella sẽ hiển thị khi giá trực tuyến sẵn sàng"}
                      </strong>
                    </div>
                    <div className="booking-breakdown-row">
                      <span>Số đêm</span>
                      <strong>{nights ? `${nights} đêm` : "Chưa chọn"}</strong>
                    </div>
                    <div className="booking-breakdown-row">
                      <span>Số khách</span>
                      <strong>{formatGuestLabel(bookingData.numGuests)}</strong>
                    </div>
                    {appliedPromotion ? (
                      <div className="booking-breakdown-row">
                        <span>Khuyến mãi</span>
                        <strong>
                          {appliedPromotion.code} (-{formatCurrency(appliedPromotion.discountAmount)})
                        </strong>
                      </div>
                    ) : null}
                    {appliedCombo ? (
                      <div className="booking-breakdown-row">
                        <span>Combo đã chọn</span>
                        <strong>{appliedCombo.name}</strong>
                      </div>
                    ) : null}
                    <div className="booking-breakdown-row booking-breakdown-total">
                      <span>Tạm tính hiện tại</span>
                      <strong>
                        {serverEstimatedTotal ? formatCurrency(serverEstimatedTotal) : "Chờ chọn ngày"}
                      </strong>
                    </div>
                  </div>

                  <PriceBreakdown breakdown={activePriceBreakdown} fallbackTotal={serverEstimatedTotal} />

                  {bookingFeedback ? (
                    <p className="field-error">{bookingFeedback}</p>
                  ) : (
                    <p className="field-note">
                      Bella sẽ kiểm tra lại phòng trống, sức chứa và tổng tiền cuối cùng trước khi
                      tạo mã đặt phòng.
                    </p>
                  )}

                  <button
                    type="button"
                    className="button button-secondary button-block"
                    onClick={handleCheckAvailability}
                    disabled={isCheckingAvailability || !room.isLive}
                    data-testid="check-availability"
                  >
                    {isCheckingAvailability ? "Đang kiểm tra..." : "Kiểm tra tình trạng phòng"}
                  </button>

                  {availabilityResult ? (
                    <div
                      className={
                        availabilityResult.available
                          ? "booking-confirmation-card availability-card availability-card-success"
                          : "booking-confirmation-card availability-card availability-card-warning"
                      }
                      data-testid="availability-result"
                    >
                      <div className="booking-confirmation-row">
                        <span>Tình trạng phòng</span>
                        <strong>
                          {availabilityResult.available
                            ? "Bella còn phòng cho lựa chọn này"
                            : availabilityResult.reason}
                        </strong>
                      </div>
                      <div className="booking-confirmation-row">
                        <span>Tổng tiền hệ thống tạm giữ</span>
                        <strong>{formatCurrency(availabilityResult.totalPrice)}</strong>
                      </div>
                      {availabilityResult.promotion ? (
                        <div className="booking-confirmation-row">
                          <span>Mã ưu đãi áp dụng</span>
                          <strong>
                            {availabilityResult.promotion.code} (-{formatCurrency(availabilityResult.promotion.discountAmount)})
                          </strong>
                        </div>
                      ) : null}
                    </div>
                  ) : null}

                  <div className="booking-form-section">
                    <div className="booking-form-section-head">
                      <p className="eyebrow">Bước 2</p>
                      <h3>Thông tin khách lưu trú</h3>
                      <p>
                        Thông tin này sẽ được gắn với mã đặt phòng và dùng cho bước liên hệ cần
                        thiết.
                      </p>
                    </div>

                    <label className="form-field">
                      <span>Họ và tên khách lưu trú</span>
                      <input
                        name="guestFullName"
                        className="text-input"
                        value={bookingData.guestFullName}
                        onChange={handleBookingChange}
                        data-testid="booking-full-name"
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
                          data-testid="booking-email"
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
                          data-testid="booking-phone"
                          autoComplete="tel"
                          placeholder="+84 000 000 000"
                        />
                      </label>
                    </div>
                  </div>

                  <div className="booking-form-section">
                    <div className="booking-form-section-head">
                      <p className="eyebrow">Bước 4</p>
                      <h3>Ghi chú thêm trước khi giữ chỗ</h3>
                      <p>
                        Mã khuyến mãi và yêu cầu đặc biệt được lưu cùng đơn đặt phòng để Bella xử lý
                        nhất quán hơn.
                      </p>
                    </div>

                    <PromotionCodeInput
                      value={bookingData.promotionCode}
                      onChange={handleBookingChange}
                      onValidate={handleCheckAvailability}
                      loading={isCheckingAvailability}
                    />

                    <label className="form-field">
                      <span>Yêu cầu thêm</span>
                      <textarea
                        name="specialRequests"
                        className="textarea-shell"
                        placeholder="Ví dụ: đến muộn, ghi chú đưa đón, yêu cầu thêm gối..."
                        value={bookingData.specialRequests}
                        onChange={handleBookingChange}
                        data-testid="booking-special-requests"
                      />
                    </label>
                  </div>

                  <div className="booking-note-card">
                    <strong>Sau khi bấm giữ chỗ</strong>
                    <p>
                      Bella sẽ tạo mã đặt phòng ở trạng thái chờ thanh toán. Bước tiếp theo là
                      chuyển bạn sang hosted checkout sandbox, nơi Bella không tự thu thập thông
                      tin thẻ thô.
                    </p>
                  </div>

                  <button
                    type="submit"
                    className="button button-primary button-block"
                    disabled={!canSubmitBooking}
                    data-testid="submit-booking"
                  >
                    {bookingResult
                      ? "Đã tạo mã đặt phòng"
                      : user?.id
                        ? "Giữ chỗ hạng phòng này"
                        : "Đăng nhập để giữ chỗ"}
                  </button>
                </form>

                {bookingResult ? (
                  <div
                    className="booking-confirmation-card booking-confirmation-card-emphasis"
                    data-testid="booking-result"
                  >
                    <div className="booking-confirmation-row">
                      <span>Mã đặt phòng</span>
                      <strong>{bookingResult.bookingReference}</strong>
                    </div>
                    <div className="booking-confirmation-row">
                      <span>Trạng thái hiện tại</span>
                      <strong>{formatBookingStatusLabel(bookingResult.status || "pending_payment")}</strong>
                    </div>
                    <div className="booking-confirmation-row">
                      <span>Tổng tiền hệ thống</span>
                      <strong>{formatCurrency(bookingResult.totalPrice)}</strong>
                    </div>
                    <div className="booking-confirmation-row">
                      <span>Số đêm lưu trú</span>
                      <strong>{bookingResult.nights} đêm</strong>
                    </div>
                    {bookingResult.promotion ? (
                      <div className="booking-confirmation-row">
                        <span>Mã ưu đãi</span>
                        <strong>
                          {bookingResult.promotion.code} (-{formatCurrency(bookingResult.promotion.discountAmount)})
                        </strong>
                      </div>
                    ) : null}
                    {bookingResult.combo ? (
                      <div className="booking-confirmation-row">
                        <span>Combo</span>
                        <strong>{bookingResult.combo.name}</strong>
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </div>

              {bookingResult ? (
                <div className="panel payment-panel">
                  <div className="payment-panel-header">
                    <div>
                      <p className="eyebrow">Thanh toán</p>
                      <h2 className="panel-title">Chuyển sang hosted checkout</h2>
                      <p className="section-copy section-copy-tight">
                        Bella đã giữ chỗ cho bạn ở trạng thái chờ thanh toán. Booking chỉ được xác
                        nhận sau khi backend nhận kết quả đã xác thực từ cổng thanh toán.
                      </p>
                    </div>
                    <span
                      className={
                        bookingResult.status === "confirmed"
                          ? "status-pill status-pill-confirmed"
                          : "status-pill status-pill-pending"
                      }
                    >
                      <CheckCircle2 size={14} />
                      {bookingResult.status === "confirmed" ? "Đã xác nhận" : "Chờ thanh toán"}
                    </span>
                  </div>

                  <div className="booking-note-card booking-note-card-soft">
                    <strong>Tổng cần thanh toán</strong>
                    <p>{formatCurrency(bookingResult.totalPrice)}</p>
                  </div>

                  <div className="booking-confirmation-card">
                    <div className="booking-confirmation-row">
                      <span>Khách sạn / hạng phòng</span>
                      <strong>{hotel?.name || bellaContent.property.name} · {room.displayName}</strong>
                    </div>
                    <div className="booking-confirmation-row">
                      <span>Thời gian lưu trú</span>
                      <strong>
                        {formatDateRange(bookingData.checkInDate, bookingData.checkOutDate)} · {nights} đêm
                      </strong>
                    </div>
                    <div className="booking-confirmation-row">
                      <span>Giữ chỗ còn lại</span>
                      <strong>{holdCountdown || "Đang cập nhật"}</strong>
                    </div>
                  </div>

                  <div className="form-stack" data-testid="payment-panel">
                    <div className="booking-note-card booking-note-card-soft">
                      <strong>Bella không lưu dữ liệu thẻ</strong>
                      <p>
                        Website này chỉ tạo checkout session và chuyển bạn sang sandbox hosted
                        checkout. Toan bộ xác nhận thanh toán được quyết định phía server sau khi có
                        callback/webhook hợp lệ.
                      </p>
                    </div>

                    <div className="booking-note-card booking-note-card-soft">
                      <strong>Kịch bản sandbox</strong>
                      <p>
                        Bạn có thể bắt đầu bằng thanh toán thẻ hoặc chuyển khoản ngân hàng sandbox.
                        Trang provider mô phỏng vẫn cho phép thử thành công, thất bại, hủy hoặc
                        hết hạn phiên để kiểm tra luồng nghiệp vụ.
                      </p>
                    </div>

                    {bookingResult.paymentExpiresAt ? (
                      <p className="field-note">
                        Bella đang giữ chỗ đến khoảng{" "}
                        {new Date(bookingResult.paymentExpiresAt).toLocaleString("vi-VN")}. Thời gian còn lại:{" "}
                        <strong>{holdCountdown}</strong>.
                      </p>
                    ) : null}

                    {checkoutError ? (
                      <p className="field-error" data-testid="payment-error">
                        {checkoutError}
                      </p>
                    ) : null}

                    <button
                      type="button"
                      className="button button-primary button-block"
                      onClick={() => handleStartCheckout("card")}
                      disabled={isSubmitting || bookingResult.status === "confirmed"}
                      data-testid="start-card-checkout"
                    >
                      <CreditCard size={16} />
                      {bookingResult.status === "confirmed"
                        ? "Đặt phòng đã được xác nhận"
                        : selectedPaymentMethod === "card"
                          ? "Đang tạo phiên thanh toán thẻ..."
                          : `Thanh toán thẻ ${formatCurrency(bookingResult.totalPrice)}`}
                    </button>

                    <button
                      type="button"
                      className="button button-secondary button-block"
                      onClick={() => handleStartCheckout("bank_transfer")}
                      disabled={isSubmitting || bookingResult.status === "confirmed"}
                      data-testid="start-bank-checkout"
                    >
                      <Landmark size={16} />
                      {selectedPaymentMethod === "bank_transfer"
                        ? "Đang tạo phiên quét QR..."
                        : "Quét QR ngân hàng"}
                    </button>

                    {checkoutSession?.checkoutUrl ? (
                      <Link
                        to="/bookings"
                        className="button button-secondary button-block"
                        data-testid="view-bookings-after-payment"
                      >
                        Theo dõi trạng thái trên trang đặt phòng
                      </Link>
                    ) : (
                      <Link to="/lookup" className="button button-ghost button-block">
                        Tra cứu bằng mã đặt phòng
                      </Link>
                    )}

                    {checkoutSession?.qrCode && !checkoutSession?.checkoutUrl ? (
                      <div className="booking-note-card booking-note-card-soft">
                        <strong>Quét QR ngân hàng</strong>
                        <p>Mở app ngân hàng và quét mã QR để thanh toán. Sau khi chuyển khoản, bấm kiểm tra trạng thái để Bella đọc kết quả từ backend.</p>
                        {String(checkoutSession.qrCode).startsWith("http") ||
                        String(checkoutSession.qrCode).startsWith("data:image") ? (
                          <img
                            src={checkoutSession.qrCode}
                            alt="Mã QR thanh toán ngân hàng Bella"
                            className="payment-qr-image"
                          />
                        ) : (
                          <code className="payment-qr-code">{checkoutSession.qrCode}</code>
                        )}
                        {checkoutSession.sessionId ? (
                          <button
                            type="button"
                            className="button button-primary button-block payment-status-check-button"
                            onClick={handleCheckPaymentStatus}
                            disabled={statusChecking}
                          >
                            {statusChecking ? "Đang kiểm tra..." : "Tôi đã thanh toán, kiểm tra trạng thái"}
                          </button>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
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
