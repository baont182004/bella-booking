import { useCallback, useEffect, useMemo, useState } from "react";
import { Plus, RefreshCw, Search, ShieldCheck, Trash2 } from "lucide-react";
import toast from "react-hot-toast";
import { bookingApi, hotelApi, userApi } from "../services/api";
import { useAuth } from "../context/auth-context";
import {
  formatBookingStatusLabel,
  formatCurrency,
  formatDate,
  formatDateRange,
} from "../utils/formatters";

const emptyRoomForm = {
  roomNumber: "",
  roomType: "",
  description: "",
  pricePerNight: "",
  capacity: "",
  amenities: "",
};

const emptyPromotionForm = {
  code: "",
  name: "",
  description: "",
  type: "percentage",
  value: "",
  maxDiscount: "",
  minNights: 1,
  minSpend: 0,
};

export default function AdminPanel() {
  const { user } = useAuth();
  const [stats, setStats] = useState(null);
  const [hotels, setHotels] = useState([]);
  const [selectedHotelId, setSelectedHotelId] = useState("");
  const [rooms, setRooms] = useState([]);
  const [bookings, setBookings] = useState([]);
  const [bookingRequests, setBookingRequests] = useState([]);
  const [promotions, setPromotions] = useState([]);
  const [users, setUsers] = useState([]);
  const [logs, setLogs] = useState([]);
  const [roomForm, setRoomForm] = useState(emptyRoomForm);
  const [promotionForm, setPromotionForm] = useState(emptyPromotionForm);
  const [roomQuery, setRoomQuery] = useState("");
  const [bookingFilter, setBookingFilter] = useState("");
  const [promotionFilter, setPromotionFilter] = useState("all");
  const [loading, setLoading] = useState(true);

  const loadAdminData = useCallback(async (nextHotelId) => {
    const [statsResponse, bookingsResponse, bookingRequestsResponse, promotionsResponse, usersResponse, logsResponse] =
      await Promise.all([
        bookingApi.get("/bookings/admin/stats"),
        bookingApi.get("/bookings", { params: { scope: "all", limit: 50 } }),
        bookingApi.get("/booking-requests", { params: { limit: 20 } }),
        bookingApi.get("/bookings/promotions/admin/all"),
        userApi.get("/users", { params: { limit: 20 } }),
        bookingApi.get("/bookings/audit-logs", { params: { limit: 12 } }),
      ]);

    setStats(statsResponse.data);
    setBookings(bookingsResponse.data.bookings || []);
    setBookingRequests(bookingRequestsResponse.data.bookingRequests || []);
    setPromotions(promotionsResponse.data.promotions || []);
    setUsers(usersResponse.data.users || []);
    setLogs(logsResponse.data.logs || []);

    if (nextHotelId) {
      const roomsResponse = await hotelApi.get(`/hotels/${nextHotelId}/rooms`);
      setRooms(roomsResponse.data.rooms || []);
    }
  }, []);

  useEffect(() => {
    document.title = "Admin | Bella Hotel";
  }, []);

  useEffect(() => {
    const loadInitial = async () => {
      try {
        setLoading(true);
        const hotelsResponse = await hotelApi.get("/hotels");
        const nextHotels = hotelsResponse.data.hotels || [];
        setHotels(nextHotels);
        const nextHotelId = nextHotels[0]?.id || "";
        setSelectedHotelId(nextHotelId);
        await loadAdminData(nextHotelId);
      } catch {
        toast.error("Không thể tải bảng điều khiển quản trị.");
      } finally {
        setLoading(false);
      }
    };

    void loadInitial();
  }, [loadAdminData]);

  const refreshAll = async () => {
    try {
      setLoading(true);
      await loadAdminData(selectedHotelId);
      toast.success("Đã làm mới dữ liệu quản trị.");
    } catch {
      toast.error("Không thể làm mới dữ liệu quản trị.");
    } finally {
      setLoading(false);
    }
  };

  const handleRoomFieldChange = (event) => {
    setRoomForm((prev) => ({ ...prev, [event.target.name]: event.target.value }));
  };

  const handlePromotionFieldChange = (event) => {
    setPromotionForm((prev) => ({ ...prev, [event.target.name]: event.target.value }));
  };

  const handleCreateRoom = async (event) => {
    event.preventDefault();

    try {
      await hotelApi.post(`/hotels/${selectedHotelId}/rooms`, {
        roomNumber: roomForm.roomNumber.trim(),
        roomType: roomForm.roomType.trim(),
        description: roomForm.description.trim(),
        pricePerNight: Number(roomForm.pricePerNight),
        capacity: Number(roomForm.capacity),
        amenities: roomForm.amenities
          .split(",")
          .map((item) => item.trim())
          .filter(Boolean),
        images: [],
        isAvailable: true,
      });
      setRoomForm(emptyRoomForm);
      await loadAdminData(selectedHotelId);
      toast.success("Đã tạo phòng mới.");
    } catch (error) {
      toast.error(error.response?.data?.error || "Không thể tạo phòng.");
    }
  };

  const handleToggleRoomAvailability = async (room) => {
    try {
      await hotelApi.put(`/hotels/${selectedHotelId}/rooms/${room.id}`, {
        isAvailable: !room.is_available,
      });
      await loadAdminData(selectedHotelId);
      toast.success("Đã cập nhật trạng thái phòng.");
    } catch (error) {
      toast.error(error.response?.data?.error || "Không thể cập nhật phòng.");
    }
  };

  const handleDeleteRoom = async (roomId) => {
    try {
      await hotelApi.delete(`/hotels/${selectedHotelId}/rooms/${roomId}`);
      await loadAdminData(selectedHotelId);
      toast.success("Đã xóa phòng.");
    } catch (error) {
      toast.error(error.response?.data?.error || "Không thể xóa phòng.");
    }
  };

  const handleBookingStatusUpdate = async (bookingId, status) => {
    try {
      await bookingApi.put(`/bookings/${bookingId}/status`, { status });
      await loadAdminData(selectedHotelId);
      toast.success("Đã cập nhật trạng thái đặt phòng.");
    } catch (error) {
      toast.error(error.response?.data?.error || "Không thể cập nhật trạng thái đặt phòng.");
    }
  };

  const handleCreatePromotion = async (event) => {
    event.preventDefault();

    try {
      await bookingApi.post("/bookings/promotions", {
        code: promotionForm.code.trim().toUpperCase(),
        name: promotionForm.name.trim(),
        description: promotionForm.description.trim(),
        type: promotionForm.type,
        value: Number(promotionForm.value),
        maxDiscount: promotionForm.maxDiscount ? Number(promotionForm.maxDiscount) : null,
        minNights: Number(promotionForm.minNights),
        minSpend: Number(promotionForm.minSpend),
        eligibleRoomCodes: [],
        isActive: true,
      });
      setPromotionForm(emptyPromotionForm);
      await loadAdminData(selectedHotelId);
      toast.success("Đã tạo khuyến mãi.");
    } catch (error) {
      toast.error(error.response?.data?.error || "Không thể tạo khuyến mãi.");
    }
  };

  const handleTogglePromotion = async (promotion) => {
    try {
      await bookingApi.put(`/bookings/promotions/${promotion.id}`, {
        isActive: !promotion.isActive,
      });
      await loadAdminData(selectedHotelId);
      toast.success("Đã cập nhật khuyến mãi.");
    } catch (error) {
      toast.error(error.response?.data?.error || "Không thể cập nhật khuyến mãi.");
    }
  };

  const selectedHotel = hotels.find((hotel) => hotel.id === selectedHotelId);

  const filteredRooms = useMemo(() => {
    const query = roomQuery.trim().toLowerCase();
    if (!query) return rooms;

    return rooms.filter((room) =>
      [room.room_number, room.room_type, room.description]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(query)),
    );
  }, [roomQuery, rooms]);

  const filteredBookings = useMemo(() => {
    if (!bookingFilter) return bookings;
    return bookings.filter((booking) => booking.status === bookingFilter);
  }, [bookingFilter, bookings]);

  const filteredPromotions = useMemo(() => {
    if (promotionFilter === "all") return promotions;
    if (promotionFilter === "active") return promotions.filter((promotion) => promotion.isActive);
    return promotions.filter((promotion) => !promotion.isActive);
  }, [promotionFilter, promotions]);

  if (loading && !stats) {
    return (
      <section className="page-section">
        <div className="shell-container">
          <div className="empty-state">Đang tải dữ liệu quản trị Bella...</div>
        </div>
      </section>
    );
  }

  return (
    <section className="page-section admin-page">
      <div className="shell-container section-stack">
        <div className="page-hero admin-hero">
          <div>
            <p className="eyebrow">Quản trị Bella</p>
            <h1 className="section-title">Điều phối vận hành cho một khách sạn, một hệ thống đặt phòng.</h1>
            <p className="section-copy">
              Tài khoản hiện tại: {user?.firstName} {user?.lastName} ({user?.email}). Từ đây bạn
              có thể quản lý tồn phòng, trạng thái đặt phòng, ưu đãi và hoạt động gần đây.
            </p>
          </div>
          <div className="results-toolbar-actions">
            <a href="#admin-rooms" className="button button-ghost">
              Quản lý phòng
            </a>
            <a href="#admin-bookings" className="button button-ghost">
              Đặt phòng
            </a>
            <a href="#admin-booking-requests" className="button button-ghost">
              Lead giữ chỗ
            </a>
            <button type="button" className="button button-secondary" onClick={refreshAll}>
              <RefreshCw size={16} />
              Làm mới
            </button>
          </div>
        </div>

        <div className="stats-row stats-row-four">
          <article className="stat-card">
            <span>Lead giữ chỗ mới</span>
            <strong>{stats?.bookingRequests?.new || 0}</strong>
            <p>Yêu cầu tư vấn / giữ chỗ landing page đang chờ nhân viên liên hệ.</p>
          </article>
        </div>

        <section className="panel admin-section" id="admin-booking-requests">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Yêu cầu giữ chỗ</p>
              <h2 className="panel-title">Lead từ landing page cần liên hệ</h2>
              <p className="section-copy section-copy-tight">
                Danh sách này không phải booking đã thanh toán. Đây là thông tin khách để lại để
                nhân viên Bella xác nhận thủ công.
              </p>
            </div>
          </div>

          <div className="admin-list">
            {bookingRequests.length ? (
              bookingRequests.map((request) => (
                <article key={request.id} className="admin-list-item admin-list-item-wide">
                  <div>
                    <strong>{request.requestReference}</strong>
                    <p>
                      {request.guestContact?.fullName} · {request.guestContact?.phone} ·{" "}
                      {request.guestContact?.area}
                    </p>
                    <p>
                      {request.roomName} · {formatDateRange(request.checkInDate, request.checkOutDate)} ·{" "}
                      {request.numGuests} khách
                    </p>
                    <p>Combo: {request.combo?.name || "Không chọn combo"}</p>
                    {request.note ? <p>Ghi chú: {request.note}</p> : null}
                  </div>
                  <span className="status-pill status-pill-pending">
                    {request.status === "new" ? "Mới" : request.status}
                  </span>
                </article>
              ))
            ) : (
              <div className="empty-state empty-state-inline">
                <div className="empty-state-stack">
                  <p>Chưa có yêu cầu giữ chỗ nào từ landing page.</p>
                </div>
              </div>
            )}
          </div>
        </section>

        <div className="stats-row stats-row-four">
          <article className="stat-card">
            <span>Tổng đặt phòng</span>
            <strong>{stats?.bookings?.total || 0}</strong>
            <p>Toàn bộ đơn đặt phòng đang có trong BELLA.</p>
          </article>
          <article className="stat-card">
            <span>Chờ thanh toán</span>
            <strong>{stats?.bookings?.pending || 0}</strong>
            <p>Những đơn cần được theo dõi để bảo đảm xác nhận trước ngày ở.</p>
          </article>
          <article className="stat-card">
            <span>Ưu đãi đang bật</span>
            <strong>{stats?.promotions?.active || 0}</strong>
            <p>Số mã khuyến mãi đang được phép áp dụng.</p>
          </article>
          <article className="stat-card">
            <span>Doanh thu đã thanh toán</span>
            <strong>{formatCurrency(stats?.revenue?.completedPayments || 0)}</strong>
            <p>Tổng ghi nhận từ các giao dịch đã hoàn tất.</p>
          </article>
        </div>

        <section className="panel admin-section" id="admin-rooms">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Phòng & tồn bán</p>
              <h2 className="panel-title">Quản lý hạng phòng đang vận hành</h2>
              <p className="section-copy section-copy-tight">
                BELLA là hệ thống một khách sạn, vì vậy phần này ưu tiên kiểm soát nhanh tồn phòng,
                giá và sức chứa thay vì cấu trúc nhiều chi nhánh.
              </p>
            </div>
            <div className="results-toolbar-actions">
              <select
                className="text-input text-input-select"
                value={selectedHotelId}
                onChange={(event) => {
                  setSelectedHotelId(event.target.value);
                  void loadAdminData(event.target.value);
                }}
              >
                {hotels.map((hotel) => (
                  <option key={hotel.id} value={hotel.id}>
                    {hotel.name}
                  </option>
                ))}
              </select>
              <label className="input-shell admin-search">
                <Search size={16} />
                <input
                  value={roomQuery}
                  onChange={(event) => setRoomQuery(event.target.value)}
                  placeholder="Tìm theo số phòng hoặc hạng phòng"
                />
              </label>
            </div>
          </div>

          <div className="admin-section-grid">
            <form className="form-stack admin-form-card" onSubmit={handleCreateRoom} data-testid="admin-room-form">
              <div className="admin-card-head">
                <h3>Tạo phòng mới cho {selectedHotel?.name || "Bella Hotel"}</h3>
                <p>Biểu mẫu này phù hợp cho demo và vận hành nhanh trên một khách sạn duy nhất.</p>
              </div>
              <div className="form-grid">
                <label className="form-field">
                  <span>Số phòng</span>
                  <input
                    name="roomNumber"
                    className="text-input"
                    value={roomForm.roomNumber}
                    onChange={handleRoomFieldChange}
                    data-testid="admin-room-number"
                    required
                  />
                </label>
                <label className="form-field">
                  <span>Hạng phòng</span>
                  <input
                    name="roomType"
                    className="text-input"
                    value={roomForm.roomType}
                    onChange={handleRoomFieldChange}
                    data-testid="admin-room-type"
                    required
                  />
                </label>
              </div>
              <div className="form-grid">
                <label className="form-field">
                  <span>Giá / đêm</span>
                  <input
                    name="pricePerNight"
                    type="number"
                    className="text-input"
                    value={roomForm.pricePerNight}
                    onChange={handleRoomFieldChange}
                    data-testid="admin-room-price"
                    required
                  />
                </label>
                <label className="form-field">
                  <span>Sức chứa</span>
                  <input
                    name="capacity"
                    type="number"
                    className="text-input"
                    value={roomForm.capacity}
                    onChange={handleRoomFieldChange}
                    data-testid="admin-room-capacity"
                    required
                  />
                </label>
              </div>
              <label className="form-field">
                <span>Mô tả ngắn</span>
                <textarea
                  name="description"
                  className="textarea-shell"
                  value={roomForm.description}
                  onChange={handleRoomFieldChange}
                  data-testid="admin-room-description"
                />
              </label>
              <label className="form-field">
                <span>Tiện nghi</span>
                <input
                  name="amenities"
                  className="text-input"
                  placeholder="wifi, minibar"
                  value={roomForm.amenities}
                  onChange={handleRoomFieldChange}
                  data-testid="admin-room-amenities"
                />
              </label>
              <button type="submit" className="button button-primary" data-testid="admin-create-room">
                <Plus size={16} />
                Tạo phòng
              </button>
            </form>

            <div className="admin-panel-card">
              <div className="admin-card-head">
                <h3>Danh sách tồn phòng hiện tại</h3>
                <p>{filteredRooms.length} phòng đang hiển thị theo bộ lọc hiện tại.</p>
              </div>
              <div className="admin-list">
                {filteredRooms.length ? (
                  filteredRooms.map((room) => (
                    <article key={room.id} className="admin-list-item" data-testid={`admin-room-${room.id}`}>
                      <div>
                        <strong>
                          {room.room_number} · {room.room_type}
                        </strong>
                        <p>
                          {formatCurrency(room.price_per_night)} · {room.capacity} khách ·{" "}
                          {room.is_available ? "Đang mở bán" : "Đã khóa"}
                        </p>
                        {room.description ? <p>{room.description}</p> : null}
                      </div>
                      <div className="results-toolbar-actions">
                        <button
                          type="button"
                          className="button button-secondary"
                          onClick={() => handleToggleRoomAvailability(room)}
                          data-testid={`admin-toggle-room-${room.id}`}
                        >
                          {room.is_available ? "Tạm khóa" : "Mở bán"}
                        </button>
                        <button
                          type="button"
                          className="button button-secondary button-danger"
                          onClick={() => handleDeleteRoom(room.id)}
                          data-testid={`admin-delete-room-${room.id}`}
                        >
                          <Trash2 size={16} />
                          Xóa
                        </button>
                      </div>
                    </article>
                  ))
                ) : (
                  <div className="empty-state empty-state-inline">
                    <div className="empty-state-stack">
                      <p>Không có phòng nào khớp với bộ lọc hiện tại.</p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </section>

        <section className="panel admin-section" id="admin-bookings">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Đặt phòng</p>
              <h2 className="panel-title">Theo dõi và cập nhật trạng thái lưu trú</h2>
              <p className="section-copy section-copy-tight">
                Giữ cho phần này thật rõ ràng để demo trên laptop vẫn dễ đọc và dễ thao tác.
              </p>
            </div>
            <select
              className="text-input text-input-select"
              value={bookingFilter}
              onChange={(event) => setBookingFilter(event.target.value)}
            >
              <option value="">Tất cả trạng thái</option>
              <option value="pending_payment">Chờ thanh toán</option>
              <option value="confirmed">Đã xác nhận</option>
              <option value="completed">Hoàn tất</option>
              <option value="cancelled">Đã hủy</option>
              <option value="expired">Đã hết hạn</option>
            </select>
          </div>

          <div className="admin-list">
            {filteredBookings.length ? (
              filteredBookings.map((booking) => (
                <article key={booking.id} className="admin-list-item admin-list-item-wide" data-testid={`admin-booking-${booking.id}`}>
                  <div>
                    <strong>{booking.bookingReference || booking.id}</strong>
                    <p>
                      {booking.guest_contact?.full_name} · {booking.room?.room_type} ·{" "}
                      {formatCurrency(booking.total_price)}
                    </p>
                    <p>{formatDateRange(booking.check_in_date, booking.check_out_date)}</p>
                    <p>{formatBookingStatusLabel(booking.status)}</p>
                  </div>
                  <div className="admin-status-actions">
                    {["pending_payment", "confirmed", "completed", "cancelled"].map((status) => (
                      <button
                        key={status}
                        type="button"
                        className="button button-secondary"
                        disabled={booking.status === status}
                        onClick={() => handleBookingStatusUpdate(booking.id, status)}
                        data-testid={`admin-booking-${booking.id}-status-${status}`}
                      >
                        {formatBookingStatusLabel(status)}
                      </button>
                    ))}
                  </div>
                </article>
              ))
            ) : (
              <div className="empty-state empty-state-inline">
                <div className="empty-state-stack">
                  <p>Không có đặt phòng nào theo bộ lọc hiện tại.</p>
                </div>
              </div>
            )}
          </div>
        </section>

        <section className="dashboard-grid">
          <div className="panel admin-section" id="admin-promotions">
            <div className="panel-heading">
              <div>
                <p className="eyebrow">Khuyến mãi</p>
                <h2 className="panel-title">Tạo và bật / tắt ưu đãi</h2>
              </div>
              <select
                className="text-input text-input-select"
                value={promotionFilter}
                onChange={(event) => setPromotionFilter(event.target.value)}
              >
                <option value="all">Tất cả mã</option>
                <option value="active">Đang bật</option>
                <option value="inactive">Đang tắt</option>
              </select>
            </div>

            <form className="form-stack" onSubmit={handleCreatePromotion}>
              <div className="form-grid">
                <label className="form-field">
                  <span>Mã</span>
                  <input
                    name="code"
                    className="text-input"
                    value={promotionForm.code}
                    onChange={handlePromotionFieldChange}
                    required
                  />
                </label>
                <label className="form-field">
                  <span>Tên</span>
                  <input
                    name="name"
                    className="text-input"
                    value={promotionForm.name}
                    onChange={handlePromotionFieldChange}
                    required
                  />
                </label>
              </div>
              <div className="form-grid">
                <label className="form-field">
                  <span>Loại</span>
                  <select
                    name="type"
                    className="text-input text-input-select"
                    value={promotionForm.type}
                    onChange={handlePromotionFieldChange}
                  >
                    <option value="percentage">Phần trăm</option>
                    <option value="fixed">Giảm cố định</option>
                  </select>
                </label>
                <label className="form-field">
                  <span>Giá trị</span>
                  <input
                    name="value"
                    type="number"
                    className="text-input"
                    value={promotionForm.value}
                    onChange={handlePromotionFieldChange}
                    required
                  />
                </label>
              </div>
              <div className="form-grid">
                <label className="form-field">
                  <span>Giảm tối đa</span>
                  <input
                    name="maxDiscount"
                    type="number"
                    className="text-input"
                    value={promotionForm.maxDiscount}
                    onChange={handlePromotionFieldChange}
                  />
                </label>
                <label className="form-field">
                  <span>Số đêm tối thiểu</span>
                  <input
                    name="minNights"
                    type="number"
                    className="text-input"
                    value={promotionForm.minNights}
                    onChange={handlePromotionFieldChange}
                    required
                  />
                </label>
              </div>
              <label className="form-field">
                <span>Chi tiêu tối thiểu</span>
                <input
                  name="minSpend"
                  type="number"
                  className="text-input"
                  value={promotionForm.minSpend}
                  onChange={handlePromotionFieldChange}
                  required
                />
              </label>
              <label className="form-field">
                <span>Mô tả</span>
                <textarea
                  name="description"
                  className="textarea-shell"
                  value={promotionForm.description}
                  onChange={handlePromotionFieldChange}
                />
              </label>
              <button type="submit" className="button button-primary">
                <ShieldCheck size={16} />
                Tạo khuyến mãi
              </button>
            </form>

            <div className="admin-list">
              {filteredPromotions.length ? (
                filteredPromotions.map((promotion) => (
                  <article key={promotion.id} className="admin-list-item">
                    <div>
                      <strong>
                        {promotion.code} · {promotion.name}
                      </strong>
                      <p>
                        {promotion.type === "percentage"
                          ? `${promotion.value}%`
                          : formatCurrency(promotion.value)}{" "}
                        · Đã dùng {promotion.usageCount}/{promotion.usageLimit || "∞"}
                      </p>
                      {promotion.description ? <p>{promotion.description}</p> : null}
                    </div>
                    <button
                      type="button"
                      className="button button-secondary"
                      onClick={() => handleTogglePromotion(promotion)}
                    >
                      {promotion.isActive ? "Tạm dừng" : "Kích hoạt"}
                    </button>
                  </article>
                ))
              ) : (
                <div className="empty-state empty-state-inline">
                  <div className="empty-state-stack">
                    <p>Không có khuyến mãi nào trong bộ lọc hiện tại.</p>
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="panel admin-section" id="admin-people">
            <div className="panel-heading">
              <div>
                <p className="eyebrow">Tài khoản & nhật ký</p>
                <h2 className="panel-title">Quan sát hoạt động gần đây</h2>
              </div>
            </div>

            <div className="info-list">
              {users.slice(0, 5).map((account) => (
                <div key={account.id}>
                  <span>{account.role === "admin" ? "Quản trị" : "Khách lưu trú"}</span>
                  <strong>
                    {account.firstName} {account.lastName} · {account.email}
                  </strong>
                </div>
              ))}
            </div>

            <div className="admin-log-list">
              {logs.length ? (
                logs.map((log) => (
                  <article key={log.id} className="admin-log-item">
                    <strong>{log.action}</strong>
                    <p>
                      {log.entityType} · {log.entityId}
                    </p>
                    <span>{formatDate(log.createdAt)}</span>
                  </article>
                ))
              ) : (
                <div className="empty-state empty-state-inline">
                  <div className="empty-state-stack">
                    <p>Chưa có nhật ký hoạt động gần đây.</p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </section>
      </div>
    </section>
  );
}
