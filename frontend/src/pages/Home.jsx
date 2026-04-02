import { useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  BadgeCheck,
  MapPin,
  ShieldCheck,
  Star,
  UtensilsCrossed,
  Wifi,
} from "lucide-react";
import FeaturedRoomCompare from "../components/FeaturedRoomCompare";
import LoadingGrid from "../components/LoadingGrid";
import RoomCard from "../components/RoomCard";
import { useAuth } from "../context/AuthContext";
import { bellaContent } from "../content/bellaContent";
import { useBellaHotelData } from "../hooks/useBellaHotelData";
import { formatCurrency } from "../utils/formatters";

function scrollToSection(sectionId) {
  document.getElementById(sectionId)?.scrollIntoView({ behavior: "smooth", block: "start" });
}

function SectionHeader({ eyebrow, title, copy, action }) {
  return (
    <div className="section-heading">
      <div>
        <p className="eyebrow">{eyebrow}</p>
        <h2 className="section-title section-title-small">{title}</h2>
        {copy ? <p className="section-copy">{copy}</p> : null}
      </div>
      {action}
    </div>
  );
}

const trustIcons = [Star, Wifi, BadgeCheck, MapPin];
const featuredRoomCodes = ["sea-view-double-or-twin-room", "garden-family-room"];

export default function Home() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { hotel, roomCatalog, liveStartingRate, loading, loadError } = useBellaHotelData();

  useEffect(() => {
    document.title = bellaContent.meta.title;
  }, []);

  const heroImage = hotel?.images?.[0] || bellaContent.gallery[0].src;
  const primaryBookableRoom = roomCatalog.find((room) => room.isLive) || roomCatalog[0] || null;
  const featuredRooms = featuredRoomCodes
    .map((code) => roomCatalog.find((room) => room.code === code))
    .filter(Boolean);
  const remainingRooms = roomCatalog.filter(
    (room) => !featuredRooms.some((featuredRoom) => featuredRoom.code === room.code),
  );
  const listingRooms = featuredRooms.length === 2 ? remainingRooms : roomCatalog;

  const handlePrimaryBooking = () => {
    if (primaryBookableRoom?.isLive) {
      navigate(`/rooms/${primaryBookableRoom.code}#book`);
      return;
    }

    scrollToSection("rooms");
  };

  return (
    <section className="page-section page-section-home">
      <div className="shell-container section-stack section-stack-large">
        <section className="bella-hero panel panel-hero" id="overview">
          <div className="bella-hero-copy">
            <p className="eyebrow">{bellaContent.property.kicker}</p>
            <h1 className="hero-title hero-title-bella">{bellaContent.property.heroTitle}</h1>
            <p className="hero-copy">{bellaContent.property.heroCopy}</p>

            <div className="bella-hero-actions">
              <button type="button" className="button button-primary" onClick={handlePrimaryBooking}>
                Đặt phòng ngay
              </button>
              <button
                type="button"
                className="button button-secondary"
                onClick={() => scrollToSection("rooms")}
              >
                Xem hạng phòng
              </button>
            </div>

            <div className="home-hero-points">
              {bellaContent.property.overviewPoints.map((point) => (
                <div key={point} className="hero-point">
                  <BadgeCheck size={18} />
                  <span>{point}</span>
                </div>
              ))}
            </div>

            <div className="bella-info-strip">
              <span>
                <Star size={15} />
                {bellaContent.trust.guestScore}/10 từ {bellaContent.trust.reviewCount} đánh giá
              </span>
              <span>
                <MapPin size={15} />
                An Thới, gần Sunset Town
              </span>
              <span>
                <ShieldCheck size={15} />
                Phù hợp cho kỳ nghỉ ngắn ngày và nhóm gia đình
              </span>
            </div>
          </div>

          <aside className="bella-hero-aside">
            <div className="bella-hero-visual">
              <img src={heroImage} alt={bellaContent.gallery[0].alt} className="bella-hero-image" />
              <div className="bella-floating-card">
                <p className="eyebrow">Lưu trú trực tiếp tại Bella</p>
                <h2>{bellaContent.property.shortDescription}</h2>
                <div className="hero-floating-stats">
                  <div className="hero-floating-stat">
                    <span>Giá từ</span>
                    <strong>
                      {liveStartingRate ? formatCurrency(liveStartingRate) : "Xem giá theo phòng"}
                    </strong>
                  </div>
                  <div className="hero-floating-stat">
                    <span>Điểm vị trí</span>
                    <strong>{bellaContent.trust.locationScore}/10</strong>
                  </div>
                </div>
                <div className="bella-floating-meta">
                  <span>
                    <Wifi size={14} />
                    Wi-Fi miễn phí
                  </span>
                  <span>
                    <BadgeCheck size={14} />
                    Nhận và trả phòng nhanh
                  </span>
                  <span>
                    <UtensilsCrossed size={14} />
                    Có thể thêm bữa sáng
                  </span>
                </div>
              </div>
            </div>
          </aside>
        </section>

        {loadError ? (
          <div className="status-banner status-banner-warning">
            Hiện chưa thể làm mới giá trực tuyến. Bạn vẫn có thể xem đầy đủ hạng phòng và mở từng
            trang chi tiết để tham khảo trước khi đặt.
          </div>
        ) : null}

        <section className="home-trust-strip" aria-label="Thông tin tin cậy nhanh">
          {bellaContent.property.trustStrip.map((item, index) => {
            const Icon = trustIcons[index] || ShieldCheck;
            return (
              <article key={item.title} className="panel panel-soft trust-card">
                <span className="trust-card-icon">
                  <Icon size={18} />
                </span>
                <div>
                  <h3>{item.title}</h3>
                  <p>{item.copy}</p>
                </div>
              </article>
            );
          })}
        </section>

        <section className="page-subsection" id="rooms">
          <SectionHeader
            eyebrow="Hạng phòng nổi bật"
            title="Chọn hạng phòng phù hợp mà không phải đọc quá nhiều."
            copy="Bella ưu tiên hiển thị ngắn gọn: hạng phòng, diện tích, kiểu giường, điểm nổi bật và giá hiện tại. Mọi thông tin sâu hơn đều nằm ở trang chi tiết."
            action={
              user?.id ? (
                <Link to="/bookings" className="button button-secondary">
                  Đơn đặt phòng của tôi
                </Link>
              ) : (
                <Link to="/login" className="button button-secondary">
                  Đăng nhập để đặt nhanh
                </Link>
              )
            }
          />

          {loading ? (
            <LoadingGrid count={4} className="room-listing-grid loading-grid" />
          ) : roomCatalog.length ? (
            <div className="room-section-stack">
              {featuredRooms.length === 2 ? (
                <>
                  <div className="room-section-caption">
                    <p className="eyebrow">2 lựa chọn được quan tâm nhiều</p>
                    <h3>So sánh nhanh một lựa chọn cho cặp đôi và một lựa chọn cho gia đình.</h3>
                    <p>
                      Hai thẻ bên dưới được làm nổi bật để bạn cảm nhận nhanh sự khác biệt về
                      không gian, mức giá và trải nghiệm lưu trú.
                    </p>
                  </div>
                  <FeaturedRoomCompare rooms={featuredRooms} />
                </>
              ) : null}

              {listingRooms.length ? (
                <div className="room-listing-stack">
                  <div className="room-listing-intro">
                    <p className="eyebrow">
                      {featuredRooms.length === 2 ? "Các hạng phòng khác" : "Toàn bộ hạng phòng"}
                    </p>
                    <p className="section-copy section-copy-tight">
                      Các lựa chọn còn lại được giữ ngắn gọn để bạn quét nhanh rồi mở chi tiết khi
                      thấy phù hợp.
                    </p>
                  </div>
                  <div className="room-listing-grid">
                    {listingRooms.map((room) => (
                      <RoomCard key={room.code} room={room} />
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          ) : (
            <div className="empty-state">
              <div className="empty-state-stack">
                <p>Hiện chưa có hạng phòng để hiển thị.</p>
                <span>Vui lòng thử lại sau hoặc quay lại trang chủ để xem thông tin khách sạn.</span>
              </div>
            </div>
          )}
        </section>

        <section className="page-subsection" id="amenities">
          <SectionHeader
            eyebrow="Vì sao nên ở Bella"
            title="Tiện nghi được sắp gọn để bạn đọc nhanh và yên tâm hơn khi chọn phòng."
            copy="Bella phù hợp với du khách muốn một nơi lưu trú sạch sẽ, dễ di chuyển và không quá phức tạp trong quá trình nhận phòng, nghỉ ngơi và đặt trực tiếp."
          />

          <div className="home-benefit-layout">
            <article className="panel panel-hero home-benefit-intro">
              <p className="eyebrow">Điểm nhấn lưu trú</p>
              <h3>Không gian vừa đủ tiện nghi cho kỳ nghỉ thư thả tại Nam đảo.</h3>
              <p>
                Bella tập trung vào những giá trị cơ bản nhưng quan trọng: phòng sáng sủa, Wi-Fi
                miễn phí, vị trí thuận tiện và quy trình lưu trú dễ theo dõi.
              </p>
              <div className="room-chip-row">
                {bellaContent.breakfast.options.slice(0, 4).map((option) => (
                  <span key={option} className="room-chip">
                    {option}
                  </span>
                ))}
              </div>
            </article>

            <div className="amenity-section-grid amenity-section-grid-home">
              {bellaContent.amenityGroups.map((group) => (
                <article key={group.title} className="panel panel-soft amenity-card">
                  <h3>{group.title}</h3>
                  <div className="room-chip-row">
                    {group.items.map((item) => (
                      <span key={item} className="room-chip">
                        {item}
                      </span>
                    ))}
                  </div>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="page-subsection" id="gallery">
          <SectionHeader
            eyebrow="Không gian khách sạn"
            title="Một vài góc nhìn giúp bạn cảm nhận Bella rõ hơn trước khi đặt."
            copy="Ưu tiên hình ảnh lớn, dễ xem để bạn nắm nhanh phong cách phòng nghỉ, không gian chung và bối cảnh ven biển xung quanh khách sạn."
          />

          <div className="bella-gallery">
            <div className="bella-gallery-primary">
              <img src={bellaContent.gallery[0].src} alt={bellaContent.gallery[0].alt} />
            </div>
            <div className="bella-gallery-grid">
              {bellaContent.gallery.slice(1, 5).map((image) => (
                <div key={image.src} className="bella-gallery-item">
                  <img src={image.src} alt={image.alt} />
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="page-subsection" id="location">
          <SectionHeader
            eyebrow="Vị trí"
            title="Thuận tiện để khám phá Sunset Town và khu Nam đảo Phú Quốc."
            copy={bellaContent.property.locationCue}
          />

          <div className="home-location-layout">
            <article className="panel panel-soft location-copy-card">
              <div className="info-list">
                <div>
                  <span>Địa chỉ khách sạn</span>
                  <strong>{bellaContent.property.address}</strong>
                </div>
                <div>
                  <span>Khu vực</span>
                  <strong>An Thới, Phú Quốc</strong>
                </div>
                <div>
                  <span>Khoảng cách đến trung tâm</span>
                  <strong>{bellaContent.property.distanceFromCenter}</strong>
                </div>
              </div>

              <div className="location-nearby-list">
                {bellaContent.nearbyPlaces.map((place) => (
                  <div key={place.name} className="location-nearby-item">
                    <strong>{place.name}</strong>
                    <span>{place.distance}</span>
                  </div>
                ))}
              </div>
            </article>

            <article className="panel panel-soft location-spotlight">
              <img src={bellaContent.gallery[3].src} alt={bellaContent.gallery[3].alt} />
              <div className="location-spotlight-copy">
                <p className="eyebrow">Khám phá xung quanh</p>
                <h3>Phù hợp cho lịch trình nghỉ ngơi kết hợp tham quan nhẹ nhàng.</h3>
                <p>
                  Từ Bella, bạn có thể sắp xếp ngày đi dạo Sunset Town, ghé khu cáp treo hoặc
                  thưởng thức không khí ven biển mà không mất quá nhiều thời gian di chuyển.
                </p>
              </div>
            </article>
          </div>
        </section>

        <section className="page-subsection" id="reviews">
          <SectionHeader
            eyebrow="Đánh giá từ khách lưu trú"
            title="Những điểm khiến Bella tạo cảm giác đáng tin và dễ chọn."
            copy="Thay vì dàn trải quá nhiều phản hồi, phần này giữ lại một vài nhận xét đại diện để bạn thấy rõ ưu điểm nổi bật của khách sạn."
          />

          <div className="review-showcase">
            <article className="panel panel-hero review-score-panel">
              <p className="eyebrow">Điểm nổi bật</p>
              <h3>{bellaContent.trust.guestScore}/10 từ khách lưu trú thực tế</h3>
              <p>
                Khách đánh giá cao vị trí thuận tiện, bữa sáng và cảm giác nghỉ ngơi thoải mái khi
                ở Bella Hotel Phú Quốc.
              </p>
              <div className="review-score-metrics">
                <div className="score-card">
                  <span>Tổng điểm</span>
                  <strong>{bellaContent.trust.guestScore}/10</strong>
                  <p>{bellaContent.trust.reviewCount} đánh giá</p>
                </div>
                <div className="score-card">
                  <span>Vị trí</span>
                  <strong>{bellaContent.trust.locationScore}/10</strong>
                  <p>Gần Sunset Town và khu cáp treo</p>
                </div>
                <div className="score-card">
                  <span>Bữa sáng</span>
                  <strong>{bellaContent.trust.breakfastScore}/10</strong>
                  <p>{bellaContent.breakfast.score}</p>
                </div>
              </div>
            </article>

            <div className="review-grid">
              {bellaContent.reviewHighlights.map((review) => (
                <article key={review.quote} className="panel panel-soft review-card">
                  <Star size={18} />
                  <p>{review.quote}</p>
                  <strong>{review.source}</strong>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="page-subsection">
          <div className="cta-banner panel panel-hero panel-hero-compact home-final-cta">
            <div>
              <p className="eyebrow">Đặt phòng trực tiếp</p>
              <h2 className="section-title section-title-small">
                {bellaContent.property.finalCtaTitle}
              </h2>
              <p className="section-copy">{bellaContent.property.finalCtaCopy}</p>
            </div>
            <div className="footer-cta-actions">
              <button type="button" className="button button-primary" onClick={handlePrimaryBooking}>
                Đặt phòng ngay
              </button>
              <button
                type="button"
                className="button button-secondary"
                onClick={() => scrollToSection("rooms")}
              >
                Xem hạng phòng
              </button>
            </div>
          </div>
        </section>
      </div>
    </section>
  );
}
