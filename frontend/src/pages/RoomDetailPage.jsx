import { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import {
  ArrowLeft,
  BedDouble,
  Calendar,
  Gift,
  DoorOpen,
  Droplets,
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
import RoomHighlights from "../components/RoomHighlights";
import RoomPriceBlock from "../components/RoomPriceBlock";
import { useAuth } from "../context/auth-context";
import { bellaContent } from "../content/bellaContent";
import { useBellaHotelData } from "../hooks/useBellaHotelData";
import { useCombos } from "../hooks/useCombos";
import { bookingApi } from "../services/api";
import {
  formatAccessModeLabel,
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

const leadDraftTtlMs = 7 * 24 * 60 * 60 * 1000;
const phonePattern = /^\+?[0-9][0-9\s().-]{5,39}$/;

function isValidEmail(value = "") {
  return !value || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

const HOLD_SYSTEM_UNREACHABLE_MESSAGE =
  "Không thể kết nối tới hệ thống giữ chỗ. Vui lòng thử lại hoặc liên hệ Bella.";

function getApiErrorMessage(error, fallback) {
  if (!error.response) {
    return HOLD_SYSTEM_UNREACHABLE_MESSAGE;
  }

  const { status, data } = error.response;
  const backendMessage =
    data && typeof data === "object"
      ? data.details?.[0]?.message || data.error || data.message
      : null;

  if (backendMessage) {
    return backendMessage;
  }

  if ([404, 502, 503, 504].includes(status) || typeof data === "string") {
    return HOLD_SYSTEM_UNREACHABLE_MESSAGE;
  }

  if (status === 401 || status === 403) {
    return "Hệ thống giữ chỗ đang từ chối yêu cầu. Vui lòng thử lại hoặc liên hệ Bella.";
  }

  return status >= 500 ? HOLD_SYSTEM_UNREACHABLE_MESSAGE : fallback;
}

function getLeadDraftKey(roomCode) {
  return `bella_landing_lead_draft_${roomCode || "unknown"}`;
}

function readLeadDraft(roomCode) {
  if (typeof window === "undefined") return {};

  try {
    const draftKey = getLeadDraftKey(roomCode);
    const rawDraft = window.sessionStorage.getItem(draftKey);
    if (!rawDraft) return {};

    const parsed = JSON.parse(rawDraft);
    if (parsed.expiresAt && parsed.expiresAt < Date.now()) {
      window.sessionStorage.removeItem(draftKey);
      window.sessionStorage.setItem(`${draftKey}:expired`, "1");
      return { expired: true };
    }

    return parsed;
  } catch {
    return {};
  }
}

function consumeLeadDraftExpired(roomCode) {
  if (typeof window === "undefined") return false;
  const expiredKey = `${getLeadDraftKey(roomCode)}:expired`;
  const expired = window.sessionStorage.getItem(expiredKey) === "1";
  window.sessionStorage.removeItem(expiredKey);
  return expired;
}

function buildInitialBookingData(roomCode) {
  const params = new URLSearchParams(typeof window !== "undefined" ? window.location.search : "");
  const draft = readLeadDraft(roomCode);
  const guestsFromQuery = Number(params.get("guests") || draft.numGuests || 1);

  return {
    checkInDate: params.get("checkIn") || draft.checkInDate || "",
    checkOutDate: params.get("checkOut") || draft.checkOutDate || "",
    numGuests: Number.isFinite(guestsFromQuery) && guestsFromQuery > 0 ? guestsFromQuery : 1,
    guestFullName: draft.guestFullName || "",
    guestEmail: draft.guestEmail || "",
    guestPhone: draft.guestPhone || "",
    guestArea: draft.guestArea || "",
    specialRequests: draft.specialRequests || "",
  };
}

export default function RoomDetailPage() {
  const { code } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { hotel, roomCatalog, loading, loadError } = useBellaHotelData();

  const [bookingData, setBookingData] = useState(() => buildInitialBookingData(code));
  const [bookingResult, setBookingResult] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [availabilityResult, setAvailabilityResult] = useState(null);
  const [isCheckingAvailability, setIsCheckingAvailability] = useState(false);
  const [selectedComboSlug, setSelectedComboSlug] = useState(() => {
    const params = new URLSearchParams(typeof window !== "undefined" ? window.location.search : "");
    const draft = readLeadDraft(code);
    return params.get("combo") || draft.selectedComboSlug || "";
  });
  const [draftExpired] = useState(() => consumeLeadDraftExpired(code));

  const room = useMemo(
    () => roomCatalog.find((item) => item.code === code) || null,
    [code, roomCatalog],
  );
  useEffect(() => {
    if (!room) return;
    document.title = `${room.displayName} | Bella Hotel Phú Quốc`;
  }, [room]);

  useEffect(() => {
    if (draftExpired) {
      toast("Thông tin giữ chỗ nháp đã hết hạn. Bạn vui lòng kiểm tra lại ngày ở và thông tin liên hệ.");
    }
  }, [draftExpired]);

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
    if (typeof window === "undefined") return;

    window.sessionStorage.setItem(
      getLeadDraftKey(code),
      JSON.stringify({
        ...bookingData,
        selectedComboSlug,
        expiresAt: Date.now() + leadDraftTtlMs,
      }),
    );
  }, [bookingData, code, selectedComboSlug]);

  useEffect(() => {
    const nextParams = new URLSearchParams(location.search);

    if (bookingData.checkInDate) nextParams.set("checkIn", bookingData.checkInDate);
    else nextParams.delete("checkIn");

    if (bookingData.checkOutDate) nextParams.set("checkOut", bookingData.checkOutDate);
    else nextParams.delete("checkOut");

    if (bookingData.numGuests) nextParams.set("guests", String(bookingData.numGuests));
    else nextParams.delete("guests");

    if (selectedComboSlug) nextParams.set("combo", selectedComboSlug);
    else nextParams.delete("combo");

    const nextSearch = nextParams.toString() ? `?${nextParams.toString()}` : "";
    if (nextSearch !== location.search) {
      navigate(
        {
          pathname: location.pathname,
          search: nextSearch,
          hash: location.hash,
        },
        { replace: true },
      );
    }
  }, [
    bookingData.checkInDate,
    bookingData.checkOutDate,
    bookingData.numGuests,
    location.hash,
    location.pathname,
    location.search,
    navigate,
    selectedComboSlug,
  ]);

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

  const reservationStage = bookingResult ? "received" : "planning";
  const appliedPromotion = availabilityResult?.promotion || null;
  const selectedCombo = useMemo(
    () => availableCombos.find((combo) => combo.slug === selectedComboSlug) || null,
    [availableCombos, selectedComboSlug],
  );
  const hasSelectedCombo = Boolean(selectedComboSlug && selectedCombo);
  const appliedCombo = hasSelectedCombo ? selectedCombo : null;
  const serverEstimatedTotal = availabilityResult?.totalPrice || estimatedTotal;
  const activePriceBreakdown = availabilityResult?.priceBreakdown || null;
  const canSubmitBooking = !isSubmitting && !bookingResult;

  useEffect(() => {
    if (!selectedComboSlug || combosLoading) return;
    if (!selectedCombo && (availableCombos.length > 0 || nights > 0)) {
      setSelectedComboSlug("");
      setAvailabilityResult(null);
      toast("Combo đã chọn không còn phù hợp với ngày ở hoặc số khách hiện tại.");
    }
  }, [availableCombos.length, combosLoading, nights, selectedCombo, selectedComboSlug]);

  const reservationSteps = [
    {
      id: "stay",
      label: "1. Chọn ngày lưu trú và số khách",
      helper: "Bella dùng thông tin này để tư vấn phòng phù hợp.",
    },
    {
      id: "room",
      label: "2. Chọn hạng phòng / xem chi tiết phòng",
      helper: "Bạn đang xem hạng phòng quan tâm trước khi để lại thông tin.",
    },
    {
      id: "combo",
      label: "3. Chọn combo hoặc không chọn combo",
      helper: "Combo là lựa chọn bổ sung, không bắt buộc.",
    },
    {
      id: "contact",
      label: "4. Để lại thông tin giữ chỗ",
      helper: "Nhân viên Bella sẽ liên hệ lại để xác nhận phòng.",
    },
  ];

  const handleBookingChange = (event) => {
    const { name, value } = event.target;
    setBookingData((prev) => ({ ...prev, [name]: value }));
    if (["checkInDate", "checkOutDate", "numGuests"].includes(name)) {
      setAvailabilityResult(null);
    }
  };

  const handleCreateBooking = async (event) => {
    event.preventDefault();

    if (bookingFeedback) {
      toast.error("Bella chưa thể nhận yêu cầu với thông tin ngày ở hiện tại.");
      return;
    }

    if (nights === 0) {
      toast.error("Vui lòng chọn ngày nhận và trả phòng hợp lệ.");
      return;
    }

    if (!bookingData.guestFullName.trim() || !bookingData.guestPhone.trim() || !bookingData.guestArea.trim()) {
      toast.error("Vui lòng nhập họ tên, số điện thoại và khu vực đang ở.");
      return;
    }

    if (!phonePattern.test(bookingData.guestPhone.trim())) {
      toast.error("Số điện thoại chưa đúng định dạng. Vui lòng kiểm tra lại.");
      return;
    }

    if (!isValidEmail(bookingData.guestEmail.trim())) {
      toast.error("Email chưa đúng định dạng. Bạn có thể bỏ trống email nếu không muốn cung cấp.");
      return;
    }

    if (Number(bookingData.numGuests || 0) < 1) {
      toast.error("Số khách phải từ 1 trở lên.");
      return;
    }

    if (!room?.code && !room?.displayName) {
      toast.error("Bella chưa nhận diện được hạng phòng bạn đang quan tâm.");
      return;
    }

    try {
      setIsSubmitting(true);
      const response = await bookingApi.post("/bookings/booking-requests", {
        roomId: room.id || undefined,
        roomTypeId: room.id || room.code,
        roomCode: room.code,
        roomName: room.displayName,
        checkInDate: bookingData.checkInDate,
        checkOutDate: bookingData.checkOutDate,
        numGuests: Number(bookingData.numGuests || 1),
        guestFullName: bookingData.guestFullName.trim(),
        guestEmail: bookingData.guestEmail.trim() || undefined,
        guestPhone: bookingData.guestPhone.trim(),
        guestArea: bookingData.guestArea.trim(),
        note: bookingData.specialRequests.trim() || undefined,
        noCombo: !selectedCombo,
        comboSlug: selectedCombo?.slug || undefined,
        comboName: selectedCombo?.name || "Không chọn combo",
        estimatedTotal: serverEstimatedTotal || 0,
        context: {
          landingPath: `${location.pathname}${location.search}${location.hash}`,
          roomIsLive: Boolean(room.isLive),
        },
      });
      setBookingResult(response.data.reservationRequest || response.data.bookingRequest);
      toast.success("Bella đã nhận thông tin giữ chỗ của bạn. Nhân viên sẽ liên hệ xác nhận trong thời gian sớm nhất.");
      scrollToSection("book");
    } catch (error) {
      toast.error(getApiErrorMessage(error, "Không thể gửi yêu cầu giữ chỗ."));
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
            <Link to={`/rooms${location.search}`} className="text-link room-back-link" data-testid="back-to-rooms">
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
                      reservationStage === "received"
                        ? "status-pill status-pill-confirmed"
                        : "status-pill"
                    }
                  >
                    {reservationStage === "received" ? "Đã gửi yêu cầu" : "Để lại thông tin"}
                  </span>
                </div>

                <div className="reservation-steps" aria-label="Quy trình đặt phòng">
                  {reservationSteps.map((step) => {
                    const isCurrent = reservationStage === "planning" && step.id === "contact";
                    const isComplete = reservationStage === "received";

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

                <BookingSummary
                  checkInDate={bookingData.checkInDate}
                  checkOutDate={bookingData.checkOutDate}
                  guests={bookingData.numGuests}
                  combo={appliedCombo}
                  total={serverEstimatedTotal}
                />

                {!room.isLive ? (
                  <div className="booking-note-card booking-note-card-soft">
                    <div className="empty-state-stack">
                      <p>Hạng phòng này hiện chưa mở đặt trực tuyến.</p>
                      <span>
                        Bạn vẫn có thể để lại thông tin tư vấn. Bella sẽ gọi lại để kiểm tra phòng,
                        ngày ở và phương án giữ chỗ thủ công phù hợp.
                      </span>
                      <button
                        type="button"
                        className="button button-secondary"
                        onClick={() => scrollToSection("book")}
                      >
                        Để lại thông tin tư vấn
                      </button>
                    </div>
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

                  <div className="booking-form-section">
                    <div className="booking-form-section-head">
                      <p className="eyebrow">Bước 2</p>
                      <h3>Chọn hạng phòng / xem chi tiết phòng</h3>
                      <p>Hạng phòng này sẽ được gửi kèm yêu cầu để nhân viên biết bạn đang quan tâm lựa chọn nào.</p>
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
                      className={hasSelectedCombo ? "combo-none-option" : "combo-none-option combo-none-option-active"}
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
                            onDeselect={() => {
                              setSelectedComboSlug("");
                              setAvailabilityResult(null);
                            }}
                          />
                        ))}
                      </div>
                    ) : (
                      <p className="field-note">
                        Hiện chưa có combo phù hợp với hạng phòng/thời gian lưu trú này. Bạn vẫn
                        có thể gửi yêu cầu tư vấn, nhân viên Bella sẽ gợi ý thêm khi liên hệ.
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
                      nhân viên liên hệ xác nhận.
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
                        <span>Tạm tính hệ thống</span>
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
                      <p className="eyebrow">Bước 4</p>
                      <h3>Để lại thông tin giữ chỗ</h3>
                      <p>
                        Bella dùng thông tin này để gọi lại hoặc nhắn tin xác nhận phòng, chưa tạo
                        thanh toán và chưa đánh dấu đặt phòng thành công.
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
                        <span>Số điện thoại</span>
                        <input
                          name="guestPhone"
                          className="text-input"
                          value={bookingData.guestPhone}
                          onChange={handleBookingChange}
                          data-testid="booking-phone"
                          autoComplete="tel"
                          placeholder="+84 000 000 000"
                          required
                        />
                      </label>

                      <label className="form-field">
                        <span>Địa chỉ hoặc khu vực đang ở</span>
                        <input
                          name="guestArea"
                          className="text-input"
                          value={bookingData.guestArea}
                          onChange={handleBookingChange}
                          data-testid="booking-area"
                          autoComplete="address-level2"
                          placeholder="Ví dụ: TP.HCM, Hà Nội, An Thới..."
                          required
                        />
                      </label>
                    </div>

                    <div className="form-grid">
                      <label className="form-field">
                        <span>Email (không bắt buộc)</span>
                        <input
                          type="email"
                          name="guestEmail"
                          className="text-input"
                          value={bookingData.guestEmail}
                          onChange={handleBookingChange}
                          data-testid="booking-email"
                          autoComplete="email"
                          placeholder="tenban@example.com"
                        />
                      </label>
                    </div>
                  </div>

                  <div className="booking-form-section">
                    <div className="booking-form-section-head">
                      <p className="eyebrow">Ghi chú</p>
                      <h3>Thông tin nhân viên cần biết thêm</h3>
                      <p>Ghi chú này sẽ đi cùng yêu cầu tư vấn để Bella chuẩn bị trước khi liên hệ.</p>
                    </div>

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
                      Bella chỉ ghi nhận yêu cầu giữ chỗ / tư vấn và chuyển thông tin cho nhân
                      viên liên hệ xác nhận. Trang này không tạo payment link và không đánh dấu
                      đặt phòng là đã thanh toán.
                    </p>
                  </div>

                  <button
                    type="submit"
                    className="button button-primary button-block"
                    disabled={!canSubmitBooking}
                    data-testid="submit-booking"
                  >
                    {bookingResult
                      ? "Đã gửi yêu cầu"
                      : room.isLive
                        ? "Gửi yêu cầu giữ chỗ"
                        : "Yêu cầu nhân viên liên hệ"}
                  </button>
                </form>

                {bookingResult ? (
                  <div
                    className="booking-confirmation-card booking-confirmation-card-emphasis"
                    data-testid="booking-result"
                  >
                    <div className="booking-confirmation-row">
                      <span>Kết quả</span>
                      <strong>Bella đã nhận thông tin giữ chỗ của bạn</strong>
                    </div>
                    <div className="booking-confirmation-row">
                      <span>Mã yêu cầu</span>
                      <strong>{bookingResult.requestReference}</strong>
                    </div>
                    <div className="booking-confirmation-row">
                      <span>Trạng thái</span>
                      <strong>Nhân viên sẽ liên hệ xác nhận trong thời gian sớm nhất</strong>
                    </div>
                    <div className="booking-confirmation-row">
                      <span>Hạng phòng quan tâm</span>
                      <strong>{bookingResult.roomName || room.displayName}</strong>
                    </div>
                    <div className="booking-confirmation-row">
                      <span>Thời gian lưu trú</span>
                      <strong>
                        {formatDateRange(bookingData.checkInDate, bookingData.checkOutDate)} · {nights} đêm
                      </strong>
                    </div>
                    {bookingResult.combo ? (
                      <div className="booking-confirmation-row">
                        <span>Combo</span>
                        <strong>{bookingResult.combo.name}</strong>
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </div>

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
