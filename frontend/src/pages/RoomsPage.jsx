import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, CheckCircle2, Filter, MapPin, SlidersHorizontal } from "lucide-react";
import FeaturedRoomCompare from "../components/FeaturedRoomCompare";
import LoadingGrid from "../components/LoadingGrid";
import RoomCard from "../components/RoomCard";
import { bellaContent } from "../content/bellaContent";
import { useBellaHotelData } from "../hooks/useBellaHotelData";
import { formatCurrency } from "../utils/formatters";

const featuredRoomCodes = ["sea-view-double-or-twin-room", "garden-family-room"];

const purposeFilters = [
  { id: "all", label: "Tất cả lựa chọn" },
  { id: "couple", label: "Cho 2 khách" },
  { id: "family", label: "Gia đình & nhóm nhỏ" },
  { id: "sea", label: "Ưu tiên hướng biển" },
  { id: "kitchen", label: "Có bếp / studio" },
];

function matchesPurpose(room, filterId) {
  const capacity = Number(room.capacity || room.maxOccupancy || 0);

  if (filterId === "couple") {
    return capacity > 0 ? capacity <= 2 : room.category !== "apartment";
  }

  if (filterId === "family") {
    return capacity >= 3 || room.category === "apartment";
  }

  if (filterId === "sea") {
    return room.views?.some((view) => view === "sea" || view === "side_sea");
  }

  if (filterId === "kitchen") {
    return room.spaces?.includes("kitchen") || room.category === "studio";
  }

  return true;
}

function sortRooms(rooms, sortBy) {
  const nextRooms = [...rooms];

  if (sortBy === "price") {
    return nextRooms.sort((left, right) => {
      const leftPrice = Number(left.pricing?.currentPrice || 0);
      const rightPrice = Number(right.pricing?.currentPrice || 0);
      return leftPrice - rightPrice;
    });
  }

  if (sortBy === "space") {
    return nextRooms.sort((left, right) => Number(right.areaSqm || 0) - Number(left.areaSqm || 0));
  }

  if (sortBy === "capacity") {
    return nextRooms.sort(
      (left, right) =>
        Number(right.capacity || right.maxOccupancy || 0) - Number(left.capacity || left.maxOccupancy || 0),
    );
  }

  return nextRooms.sort((left, right) => {
    if (left.isLive !== right.isLive) {
      return left.isLive ? -1 : 1;
    }

    const leftFeaturedIndex = featuredRoomCodes.indexOf(left.code);
    const rightFeaturedIndex = featuredRoomCodes.indexOf(right.code);
    const leftFeatured = leftFeaturedIndex !== -1;
    const rightFeatured = rightFeaturedIndex !== -1;

    if (leftFeatured !== rightFeatured) {
      return leftFeatured ? -1 : 1;
    }

    if (leftFeatured && rightFeatured && leftFeaturedIndex !== rightFeaturedIndex) {
      return leftFeaturedIndex - rightFeaturedIndex;
    }

    return Number(left.pricing?.currentPrice || 0) - Number(right.pricing?.currentPrice || 0);
  });
}

export default function RoomsPage() {
  const { roomCatalog, liveStartingRate, loading, loadError } = useBellaHotelData();
  const [purposeFilter, setPurposeFilter] = useState("all");
  const [sortBy, setSortBy] = useState("recommended");
  const [showLiveOnly, setShowLiveOnly] = useState(true);
  const [showLocationMap, setShowLocationMap] = useState(false);

  useEffect(() => {
    document.title = "Hạng phòng | Bella Hotel Phú Quốc";
  }, []);

  const featuredRooms = useMemo(
    () =>
      featuredRoomCodes
        .map((code) => roomCatalog.find((room) => room.code === code))
        .filter(Boolean),
    [roomCatalog],
  );

  const filteredRooms = useMemo(() => {
    const nextRooms = roomCatalog.filter((room) => {
      if (showLiveOnly && !room.isLive) {
        return false;
      }

      return matchesPurpose(room, purposeFilter);
    });

    return sortRooms(nextRooms, sortBy);
  }, [purposeFilter, roomCatalog, showLiveOnly, sortBy]);

  const liveRoomCount = roomCatalog.filter((room) => room.isLive).length;
  const familyRoomCount = roomCatalog.filter((room) => matchesPurpose(room, "family")).length;
  const locationEmbedUrl = useMemo(
    () =>
      `https://www.google.com/maps?q=${encodeURIComponent(bellaContent.property.address)}&z=16&output=embed`,
    [],
  );

  return (
    <section className="page-section rooms-page">
      <div className="shell-container section-stack">
        <section className="panel panel-hero rooms-hero">
          <div className="rooms-hero-copy">
            <p className="eyebrow">Hạng phòng Bella</p>
            <h1 className="section-title">Chọn hạng phòng theo đúng kiểu nghỉ của bạn tại Bella Hotel.</h1>
            <p className="section-copy">
              Bella là một điểm lưu trú duy nhất, vì vậy trang này được sắp để bạn nhìn nhanh sự
              khác biệt giữa từng hạng phòng: diện tích, kiểu giường, sức chứa, tiện nghi nổi bật
              và mức giá hiện tại.
            </p>
            <div className="rooms-hero-notes">
              <span>
                <CheckCircle2 size={16} />
                {liveRoomCount} hạng phòng đang mở đặt trực tuyến
              </span>
              <span>
                <MapPin size={16} />
                Một khách sạn duy nhất tại An Thới, gần Sunset Town
              </span>
            </div>
          </div>

          <aside className="rooms-hero-aside">
            <div className="rooms-hero-summary">
              <div>
                <span>Giá từ</span>
                <strong>{liveStartingRate ? formatCurrency(liveStartingRate) : "Xem theo hạng phòng"}</strong>
              </div>
              <div>
                <span>Tổng hạng phòng</span>
                <strong>{roomCatalog.length}</strong>
              </div>
              <div>
                <span>Lựa chọn cho gia đình</span>
                <strong>{familyRoomCount}</strong>
              </div>
            </div>

            <div className="rooms-hero-card">
              <p className="eyebrow">Đặt trực tiếp tại Bella</p>
              <h2>So sánh nhanh trước, rồi mở trang chi tiết khi bạn đã thấy hợp.</h2>
              <p>
                Mỗi trang chi tiết sẽ giữ nguyên tông thông tin này và dẫn thẳng đến bước kiểm tra
                ngày ở, giữ chỗ và thanh toán.
              </p>
              <div className="rooms-hero-actions">
                <Link to="/lookup" className="button button-secondary">
                  Tra cứu đặt phòng
                </Link>
                  <button
                    type="button"
                    className="button button-ghost rooms-location-trigger"
                    onClick={() => setShowLocationMap((prev) => !prev)}
                    aria-expanded={showLocationMap}
                    aria-controls="bella-rooms-map"
                  >
                    {showLocationMap ? "Ẩn vị trí khách sạn" : "Xem vị trí khách sạn"}
                  </button>
                </div>

              <div className="rooms-location-card">
                <div className="rooms-location-row">
                  <MapPin size={16} />
                  <div>
                    <strong>Địa chỉ khách sạn</strong>
                    <span>{bellaContent.property.address}</span>
                  </div>
                </div>

                {showLocationMap ? (
                  <div className="rooms-location-map" id="bella-rooms-map">
                    <iframe
                      className="rooms-location-iframe"
                      src={locationEmbedUrl}
                      title="Bản đồ vị trí Bella Hotel Phú Quốc"
                      loading="lazy"
                      referrerPolicy="no-referrer-when-downgrade"
                      allowFullScreen
                    />
                  </div>
                ) : null}
              </div>
            </div>
          </aside>
        </section>

        {loadError ? (
          <div className="status-banner status-banner-warning">
            Bella chưa thể làm mới giá trực tuyến ở thời điểm này. Bạn vẫn có thể xem đầy đủ hạng
            phòng và tiếp tục đến từng trang chi tiết.
          </div>
        ) : null}

        <section className="panel panel-soft rooms-toolbar">
          <div className="rooms-toolbar-header">
            <div>
              <p className="eyebrow">Lọc nhanh</p>
              <h2 className="panel-title">Thu gọn danh sách theo nhu cầu lưu trú</h2>
              <p className="section-copy section-copy-tight">
                Dùng bộ lọc để tập trung vào loại phòng phù hợp trước khi so sánh giá và tiện nghi.
              </p>
            </div>
            <div className="rooms-toolbar-controls">
              <label className="rooms-toggle">
                <input
                  type="checkbox"
                  checked={showLiveOnly}
                  onChange={() => setShowLiveOnly((prev) => !prev)}
                />
                <span>Chỉ hiện phòng có thể đặt ngay</span>
              </label>
              <label className="rooms-sort">
                <SlidersHorizontal size={16} />
                <span>Sắp xếp</span>
                <select
                  className="text-input text-input-select"
                  value={sortBy}
                  onChange={(event) => setSortBy(event.target.value)}
                >
                  <option value="recommended">Gợi ý của Bella</option>
                  <option value="price">Giá thấp đến cao</option>
                  <option value="space">Diện tích lớn trước</option>
                  <option value="capacity">Sức chứa nhiều trước</option>
                </select>
              </label>
            </div>
          </div>

          <div className="filter-chip-row" aria-label="Bộ lọc hạng phòng">
            {purposeFilters.map((filterItem) => (
              <button
                key={filterItem.id}
                type="button"
                className={
                  purposeFilter === filterItem.id
                    ? "filter-chip filter-chip-active"
                    : "filter-chip"
                }
                onClick={() => setPurposeFilter(filterItem.id)}
              >
                <Filter size={15} />
                {filterItem.label}
              </button>
            ))}
          </div>
        </section>

        {loading ? (
          <LoadingGrid count={4} className="room-listing-grid loading-grid" />
        ) : (
          <>
            {purposeFilter === "all" && featuredRooms.length === 2 ? (
              <section className="page-subsection">
                <div className="section-heading">
                  <div>
                    <p className="eyebrow">So sánh nhanh</p>
                    <h2 className="section-title section-title-small">
                      Một lựa chọn nổi bật cho cặp đôi và một lựa chọn nổi bật cho gia đình.
                    </h2>
                    <p className="section-copy section-copy-tight">
                      Phần so sánh này giúp bạn nhận ra khác biệt chính trước khi kéo xuống danh
                      sách đầy đủ.
                    </p>
                  </div>
                </div>
                <FeaturedRoomCompare rooms={featuredRooms} />
              </section>
            ) : null}

            <section className="page-subsection">
              <div className="rooms-results-header">
                <div>
                  <p className="eyebrow">Danh sách hạng phòng</p>
                  <h2 className="section-title section-title-small">
                    {filteredRooms.length} lựa chọn phù hợp với bộ lọc hiện tại
                  </h2>
                  <p className="section-copy section-copy-tight">
                    Mỗi thẻ phòng đều dẫn đến trang chi tiết và bước giữ chỗ trực tiếp.
                  </p>
                </div>
                <Link to="/lookup" className="button button-secondary">
                  Tra cứu đặt phòng
                </Link>
              </div>

              {filteredRooms.length ? (
                <div className="room-listing-grid">
                  {filteredRooms.map((room) => (
                    <RoomCard key={room.code} room={room} />
                  ))}
                </div>
              ) : (
                <div className="empty-state">
                  <div className="empty-state-stack">
                    <p>Chưa có hạng phòng khớp với bộ lọc này.</p>
                    <span>Hãy mở rộng bộ lọc để xem lại toàn bộ lựa chọn lưu trú tại Bella.</span>
                    <button
                      type="button"
                      className="button button-secondary"
                      onClick={() => {
                        setPurposeFilter("all");
                        setShowLiveOnly(true);
                        setSortBy("recommended");
                      }}
                    >
                      Xem lại danh sách gợi ý
                    </button>
                  </div>
                </div>
              )}
            </section>
          </>
        )}

        <section className="panel panel-soft rooms-footer-note">
          <div>
            <p className="eyebrow">Trước khi đặt</p>
            <h2 className="panel-title">Bella sẽ xác nhận ngày ở, sức chứa và tổng tiền ở trang chi tiết.</h2>
          </div>
          <p>
            Chọn hạng phòng trước, sau đó kiểm tra tình trạng còn phòng, nhập thông tin khách lưu
            trú và hoàn tất thanh toán trực tiếp. Quy trình giữ nguyên cho toàn bộ hệ thống BELLA.
          </p>
          <Link to="/" className="text-link rooms-footer-link">
            Quay lại trang giới thiệu khách sạn
            <ArrowRight size={16} />
          </Link>
        </section>
      </div>
    </section>
  );
}
