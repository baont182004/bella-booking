import { Link } from "react-router-dom";
import { Languages, MapPin, ShieldCheck, Star } from "lucide-react";
import { useAuth } from "../context/auth-context";
import { bellaContent } from "../content/bellaContent";
import BrandLogo from "./BrandLogo";
import SocialChannelLink from "./SocialChannelLink";

export default function Footer() {
  const { token } = useAuth();

  return (
    <footer className="site-footer" id="contact">
      <div className="shell-container">
        <div className="footer-card footer-card-bella">
          <div className="footer-grid footer-grid-bella">
            <div className="footer-brand">
              <Link to="/" className="brand-mark">
                <BrandLogo variant="footer" />
              </Link>
              <p>{bellaContent.property.shortDescription}</p>
              <div className="footer-contact-list">
                <span>
                  <MapPin size={14} />
                  {bellaContent.property.address}
                </span>
              </div>
              <div className="footer-brand-actions">
                <Link to="/rooms" className="button button-primary">
                  Xem hạng phòng
                </Link>
                <Link to={token ? "/bookings" : "/login"} className="button button-secondary">
                  {token ? "Đặt phòng của tôi" : "Đăng nhập"}
                </Link>
              </div>
            </div>

            <div>
              <h3>Bella Hotel</h3>
              <Link to="/">Trang giới thiệu</Link>
              <Link to="/rooms">Hạng phòng</Link>
              <Link to="/#amenities">Tiện nghi</Link>
              <Link to="/#gallery">Hình ảnh</Link>
            </div>

            <div>
              <h3>Thông tin</h3>
              <span className="footer-note footer-trust-note">
                <Star size={14} />
                Điểm khách lưu trú {bellaContent.trust.guestScore}/10 từ {bellaContent.trust.reviewCount} đánh giá
              </span>
              <span className="footer-note footer-trust-note">
                <ShieldCheck size={14} />
                Nhận phòng từ 14:00, trả phòng trước 00:00
              </span>
              <span className="footer-note footer-trust-note">
                <Languages size={14} />
                Hỗ trợ {bellaContent.trust.languages.join(" và ")}
              </span>
            </div>

            <div>
              <h3>Liên hệ</h3>
              <p className="footer-note footer-section-copy">
                Xem thêm hình ảnh thực tế và các cập nhật mới của Bella qua fanpage chính thức.
              </p>
              <SocialChannelLink
                className="footer-social-channel"
                compact
                title="Theo dõi Bella Hotel Phú Quốc trên Facebook"
              />
              <SocialChannelLink
                className="footer-social-channel"
                compact
                channel="tiktok"
                title="Theo dõi Bella trên TikTok"
              />
              <Link to="/#location">Vị trí khách sạn</Link>
              <Link to="/#reviews">Đánh giá khách lưu trú</Link>
              <Link to="/rooms">Tư vấn chọn phòng</Link>
              <span className="footer-note footer-note-soft">
                Khu vực An Thới, thuận tiện để khám phá Sunset Town và bờ biển phía Nam Phú Quốc.
              </span>
            </div>
          </div>

          <div className="footer-bottom">
            <p>© 2026 Bella Hotel Phú Quốc.</p>
            <p>Một khách sạn, một quy trình đặt phòng rõ ràng, một điểm đến dễ chọn.</p>
          </div>
        </div>
      </div>
    </footer>
  );
}
