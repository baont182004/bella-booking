import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { CalendarDays, Clock3, Hotel, RefreshCw, User, Wallet } from "lucide-react";
import toast from "react-hot-toast";
import { useAuth } from "../context/AuthContext";
import { bookingApi, hotelApi } from "../services/api";
import { formatDate } from "../utils/formatters";

export default function Dashboard() {
  const { user } = useAuth();
  const [summary, setSummary] = useState({
    total: 0,
    pending: 0,
    confirmed: 0,
    completed: 0,
  });
  const [isSyncingMetadata, setIsSyncingMetadata] = useState(false);
  const [metadataSyncResult, setMetadataSyncResult] = useState(null);

  useEffect(() => {
    const loadSummary = async () => {
      if (!user?.id) return;
      try {
        const response = await bookingApi.get("/bookings", {
          params: { limit: 50 },
        });
        const bookings = response.data.bookings || [];
        setSummary({
          total: bookings.length,
          pending: bookings.filter((item) => item.status === "pending").length,
          confirmed: bookings.filter((item) => item.status === "confirmed").length,
          completed: bookings.filter((item) => item.status === "completed").length,
        });
      } catch (error) {
        toast.error("Không thể cập nhật nhanh tổng quan chuyến đi của bạn.");
      }
    };

    loadSummary();
  }, [user?.id]);

  const membershipText = user?.createdAt
    ? `Tham gia từ ${formatDate(user.createdAt)}`
    : "Sẵn sàng lên kế hoạch cho kỳ nghỉ tại Bella";
  const planningMessage =
    summary.confirmed > 0
      ? "Bạn đang có các đơn Bella đã xác nhận. Hãy mở mục đặt phòng để xem lại ngày ở và thanh toán."
      : summary.pending > 0
        ? "Bạn vẫn còn đơn Bella đang chờ bước tiếp theo. Hãy xem lại trước ngày lưu trú."
        : "Quay lại danh sách phòng Bella để lên kế hoạch cho kỳ nghỉ tiếp theo và giữ mọi đơn đặt trong cùng một tài khoản.";

  const handleMetadataSync = async () => {
    try {
      setIsSyncingMetadata(true);
      const response = await hotelApi.post("/hotels/admin/bella/metadata/sync");
      setMetadataSyncResult(response.data.result);
      toast.success("Đã đồng bộ metadata phòng Bella.");
    } catch (error) {
      toast.error(error.response?.data?.error || "Không thể đồng bộ metadata phòng Bella.");
    } finally {
      setIsSyncingMetadata(false);
    }
  };

  return (
    <section className="page-section">
      <div className="shell-container section-stack">
        <div className="page-hero">
          <div>
            <p className="eyebrow">Tài khoản của tôi</p>
            <h1 className="section-title">
              Chào mừng quay lại, {user?.firstName} {user?.lastName}.
            </h1>
            <p className="section-copy">
              Theo dõi thông tin khách lưu trú, xem lại các đơn Bella và quay lại bước đặt phòng
              mà không bỏ sót trạng thái đơn.
            </p>
          </div>
          <div className="user-summary-card">
            <span className="user-summary-badge">
              <User size={16} />
              {user?.role === "admin" ? "Tài khoản quản trị" : "Tài khoản khách"}
            </span>
            <strong>{user?.email}</strong>
            <p>{membershipText}</p>
          </div>
        </div>

        <div className="stats-row stats-row-four">
          <article className="stat-card">
            <span>Tổng đơn lưu trú</span>
            <strong>{summary.total}</strong>
            <p>Tất cả đơn Bella đang gắn với tài khoản của bạn.</p>
          </article>
          <article className="stat-card">
            <span>Chờ xác nhận</span>
            <strong>{summary.pending}</strong>
            <p>Những đơn đang chờ bước thanh toán hoặc xác nhận.</p>
          </article>
          <article className="stat-card">
            <span>Đã xác nhận</span>
            <strong>{summary.confirmed}</strong>
            <p>Các kỳ nghỉ sắp tới đã sẵn sàng để nhận phòng.</p>
          </article>
          <article className="stat-card">
            <span>Hoàn tất</span>
            <strong>{summary.completed}</strong>
            <p>Những chuyến đi đã lưu lại trong lịch sử đặt phòng.</p>
          </article>
        </div>

        <div className="dashboard-grid">
          <div className="panel">
            <div className="panel-heading">
              <div>
                <p className="eyebrow">Hồ sơ</p>
                <h2 className="panel-title">Thông tin khách lưu trú</h2>
              </div>
            </div>
            <div className="info-list">
              <div>
                <span>Email</span>
                <strong>{user?.email}</strong>
              </div>
              <div>
                <span>Số điện thoại</span>
                <strong>{user?.phone || "Bạn có thể bổ sung số điện thoại khi cần"}</strong>
              </div>
              <div>
                <span>Loại tài khoản</span>
                <strong>{user?.role === "admin" ? "Quản trị" : "Khách lưu trú"}</strong>
              </div>
              <div>
                <span>Gợi ý hiện tại</span>
                <strong>{planningMessage}</strong>
              </div>
            </div>
          </div>

          <div className="panel">
            <div className="panel-heading">
              <div>
                <p className="eyebrow">Thao tác nhanh</p>
                <h2 className="panel-title">Bạn muốn làm gì tiếp theo?</h2>
              </div>
            </div>
            <div className="action-grid">
              <Link to="/#rooms" className="action-card">
                <Hotel size={20} />
                Xem hạng phòng
              </Link>
              <Link to="/bookings" className="action-card">
                <CalendarDays size={20} />
                Xem đơn đặt phòng
              </Link>
              <Link to="/bookings" className="action-card">
                <Wallet size={20} />
                Kiểm tra thanh toán
              </Link>
              <Link to="/#rooms" className="action-card">
                <Clock3 size={20} />
                Chọn phòng mới
              </Link>
            </div>
          </div>

          {user?.role === "admin" ? (
            <div className="panel">
              <div className="panel-heading">
                <div>
                  <p className="eyebrow">Dữ liệu Bella</p>
                  <h2 className="panel-title">Đồng bộ metadata phòng</h2>
                </div>
              </div>
              <p className="section-copy section-copy-tight">
                Làm mới metadata phòng Bella từ file review đã lưu mà không cần reseed lại booking,
                user hay payment.
              </p>
              <button
                type="button"
                className="button button-primary"
                onClick={handleMetadataSync}
                disabled={isSyncingMetadata}
              >
                <RefreshCw size={16} />
                {isSyncingMetadata ? "Đang đồng bộ..." : "Đồng bộ metadata Bella"}
              </button>

              {metadataSyncResult ? (
                <div className="info-list">
                  <div>
                    <span>Hạng phòng đã cập nhật</span>
                    <strong>{metadataSyncResult.updatedRooms?.length || 0}</strong>
                  </div>
                  <div>
                    <span>Tiện nghi khách sạn đã đồng bộ</span>
                    <strong>{metadataSyncResult.hotelAmenitiesUpdated || 0}</strong>
                  </div>
                  <div>
                    <span>Cảnh báo</span>
                    <strong>{metadataSyncResult.warnings?.length || 0}</strong>
                  </div>
                  <div>
                    <span>Nguồn metadata</span>
                    <strong>{metadataSyncResult.metadataPath}</strong>
                  </div>
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}
