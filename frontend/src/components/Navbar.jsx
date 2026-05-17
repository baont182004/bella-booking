import { useEffect, useState } from "react";
import { Link, NavLink, useLocation, useNavigate } from "react-router-dom";
import { CalendarDays, ChevronRight, Compass, LogOut, Menu, ShieldCheck, UserCircle2, X } from "lucide-react";
import toast from "react-hot-toast";
import BrandLogo from "./BrandLogo";
import { useAuth } from "../context/auth-context";
import { getInitials } from "../utils/formatters";

const desktopLinks = [
  { to: "/", label: "Trang chủ" },
  { to: "/rooms", label: "Phòng" },
  { to: "/combos", label: "Combo" },
  { to: "/lookup", label: "Tra cứu" },
];

const discoveryLinks = [
  {
    to: "/#amenities",
    label: "Tiện nghi",
    description: "Xem nhanh các tiện ích lưu trú và dịch vụ nổi bật tại Bella.",
  },
  {
    to: "/#location",
    label: "Vị trí",
    description: "Kiểm tra vị trí khách sạn và các điểm đến thuận tiện quanh Bella.",
  },
  {
    to: "/#reviews",
    label: "Đánh giá",
    description: "Đọc cảm nhận từ khách đã lưu trú trước khi chọn hạng phòng.",
  },
];

const panelPrimaryLinks = [
  {
    to: "/",
    label: "Trang chủ",
    description: "Quay lại phần giới thiệu tổng quan về Bella Hotel Phú Quốc.",
  },
  {
    to: "/rooms",
    label: "Hạng phòng",
    description: "So sánh nhanh các lựa chọn lưu trú và mức giá theo đêm.",
  },
  {
    to: "/combos",
    label: "Combo & ưu đãi",
    description: "Xem các gói nghỉ, di chuyển và trải nghiệm đang áp dụng tại Bella.",
  },
  {
    to: "/lookup",
    label: "Tra cứu đặt phòng",
    description: "Tìm đặt phòng theo mã tham chiếu khi cần kiểm tra nhanh.",
  },
];

function getPropertyLinkClass(to, location) {
  if (to === "/" && location.pathname === "/") {
    return "nav-link nav-link-active";
  }

  if (to === "/rooms" && (location.pathname === "/rooms" || location.pathname.startsWith("/rooms/"))) {
    return "nav-link nav-link-active";
  }

  if (to === "/lookup" && location.pathname === "/lookup") {
    return "nav-link nav-link-active";
  }

  if (to === "/combos" && location.pathname.startsWith("/combos")) {
    return "nav-link nav-link-active";
  }

  if (to.startsWith("/#") && location.pathname === "/" && location.hash === to.slice(1)) {
    return "nav-link nav-link-active";
  }

  return "nav-link";
}

export default function Navbar() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [isScrolled, setIsScrolled] = useState(false);
  const { token, user, logout, loading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const closeMenu = () => setMenuOpen(false);

  useEffect(() => {
    const handleScroll = () => setIsScrolled(window.scrollY > 24);

    handleScroll();
    window.addEventListener("scroll", handleScroll, { passive: true });

    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  useEffect(() => {
    if (!menuOpen) {
      document.body.style.removeProperty("overflow");
      return undefined;
    }

    const handleEscape = (event) => {
      if (event.key === "Escape") {
        closeMenu();
      }
    };

    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", handleEscape);

    return () => {
      document.body.style.removeProperty("overflow");
      window.removeEventListener("keydown", handleEscape);
    };
  }, [menuOpen]);

  const handleLogout = async () => {
    navigate("/", { replace: true });
    await logout();
    closeMenu();
    toast.success("Đã đăng xuất");
  };

  const primaryAction = location.pathname.startsWith("/rooms/") ? `${location.pathname}#book` : "/rooms";
  const primaryLabel = location.pathname.startsWith("/rooms/") ? "Đặt phòng" : "Xem phòng";
  const userDisplayName = user?.firstName || "Bella";
  const userSecondaryLabel = user?.role === "admin" ? "Quản trị" : "Tài khoản";

  return (
    <header className={isScrolled ? "site-header site-header-scrolled" : "site-header"}>
      <div className="shell-container">
        <div className={isScrolled ? "nav-frame nav-frame-top nav-frame-scrolled" : "nav-frame nav-frame-top"}>
          <div className={isScrolled ? "nav-brand-rail nav-brand-rail-scrolled" : "nav-brand-rail"}>
            <Link to="/" className="brand-mark" onClick={closeMenu}>
              <BrandLogo variant="header" />
            </Link>
          </div>

          <nav className="nav-links nav-links-desktop" aria-label="Điều hướng khách sạn">
            {desktopLinks.map(({ to, label }) => (
              <Link key={to} to={to} className={getPropertyLinkClass(to, location)} onClick={closeMenu}>
                {label}
              </Link>
            ))}
          </nav>

          <div
            className={
              isScrolled
                ? "nav-actions nav-actions-desktop nav-actions-rail nav-actions-rail-scrolled"
                : "nav-actions nav-actions-desktop nav-actions-rail"
            }
          >
            {!loading && token && user ? (
              <>
                <NavLink to="/dashboard" className="user-pill" onClick={closeMenu}>
                  <span className="user-pill-avatar">
                    {getInitials(`${user.firstName || ""} ${user.lastName || ""}`)}
                  </span>
                  <span className="user-pill-copy">
                    <strong>{userDisplayName}</strong>
                    <small>{userSecondaryLabel}</small>
                  </span>
                </NavLink>
                <Link to={primaryAction} className="button button-primary nav-primary-action" onClick={closeMenu}>
                  {primaryLabel}
                </Link>
                <button
                  type="button"
                  className="button button-secondary nav-panel-trigger"
                  onClick={() => setMenuOpen(true)}
                  aria-expanded={menuOpen}
                  aria-controls="bella-nav-drawer"
                >
                  <Compass size={16} />
                  Khám phá
                </button>
              </>
            ) : !loading ? (
              <>
                <Link to="/login" className="button button-ghost" onClick={closeMenu}>
                  Đăng nhập
                </Link>
                <Link to={primaryAction} className="button button-primary nav-primary-action" onClick={closeMenu}>
                  {primaryLabel}
                </Link>
                <button
                  type="button"
                  className="button button-secondary nav-panel-trigger"
                  onClick={() => setMenuOpen(true)}
                  aria-expanded={menuOpen}
                  aria-controls="bella-nav-drawer"
                >
                  <Compass size={16} />
                  Khám phá
                </button>
              </>
            ) : (
              <div className="nav-loading-pill" />
            )}
          </div>

          <button
            type="button"
            className="nav-toggle"
            onClick={() => setMenuOpen((prev) => !prev)}
            aria-expanded={menuOpen}
            aria-controls="bella-nav-drawer"
            aria-label="Mở menu điều hướng"
          >
            {menuOpen ? <X size={22} /> : <Menu size={22} />}
          </button>
        </div>

        <div
          className={menuOpen ? "nav-drawer-backdrop nav-drawer-backdrop-open" : "nav-drawer-backdrop"}
          onClick={closeMenu}
          aria-hidden={!menuOpen}
        />

        <aside
          id="bella-nav-drawer"
          className={menuOpen ? "nav-drawer nav-drawer-open" : "nav-drawer"}
          aria-hidden={!menuOpen}
        >
          <div className="nav-drawer-top">
            <div>
              <p className="eyebrow">Bella navigation</p>
              <h2 className="nav-drawer-title">Giữ thanh trên gọn, mọi lối đi còn lại ở đây.</h2>
              <p className="nav-drawer-copy">
                Từ panel này bạn có thể tra cứu đặt phòng, xem tiện nghi và mở nhanh khu vực tài khoản.
              </p>
            </div>
            <button
              type="button"
              className="nav-drawer-close"
              onClick={closeMenu}
              aria-label="Đóng menu điều hướng"
            >
              <X size={20} />
            </button>
          </div>

          {!loading && token && user ? (
            <div className="nav-drawer-user">
              <span className="user-pill-avatar">
                {getInitials(`${user.firstName || ""} ${user.lastName || ""}`)}
              </span>
              <div className="nav-drawer-user-copy">
                <strong>{`${user.firstName || ""} ${user.lastName || ""}`.trim() || user.email}</strong>
                <span>{user.email}</span>
              </div>
            </div>
          ) : null}

          <div className="nav-drawer-section">
            <div className="nav-drawer-section-head">
              <h3>Điều hướng chính</h3>
              <span>Chọn nhanh trang bạn cần mở tiếp theo.</span>
            </div>
            <nav className="nav-drawer-links" aria-label="Menu điều hướng Bella">
              {panelPrimaryLinks.map(({ to, label, description }) => (
                <Link key={to} to={to} className="nav-drawer-link" onClick={closeMenu}>
                  <div>
                    <strong>{label}</strong>
                    <span>{description}</span>
                  </div>
                  <ChevronRight size={16} />
                </Link>
              ))}
            </nav>
          </div>

          <div className="nav-drawer-section">
            <div className="nav-drawer-section-head">
              <h3>Khám phá khách sạn</h3>
              <span>Các thông tin phụ được gom tại đây để header bớt chật hơn.</span>
            </div>
            <nav className="nav-drawer-links" aria-label="Khám phá Bella">
              {discoveryLinks.map(({ to, label, description }) => (
                <Link key={to} to={to} className="nav-drawer-link" onClick={closeMenu}>
                  <div>
                    <strong>{label}</strong>
                    <span>{description}</span>
                  </div>
                  <ChevronRight size={16} />
                </Link>
              ))}
            </nav>
          </div>

          <div className="nav-drawer-section">
            <div className="nav-drawer-section-head">
              <h3>{token ? "Tài khoản và đặt phòng" : "Tiếp tục đặt phòng"}</h3>
              <span>
                {token
                  ? "Mở nhanh khu vực tài khoản, lịch sử đơn hoặc trang quản trị."
                  : "Đăng nhập hoặc mở danh sách phòng để tiếp tục đặt tại Bella."}
              </span>
            </div>
            <div className="nav-drawer-links">
              {token ? (
                <>
                  <NavLink to="/dashboard" className="nav-drawer-link" onClick={closeMenu}>
                    <div>
                      <strong>Tài khoản Bella</strong>
                      <span>Xem hồ sơ lưu trú và cập nhật thông tin cá nhân.</span>
                    </div>
                    <UserCircle2 size={16} />
                  </NavLink>
                  <NavLink to="/bookings" className="nav-drawer-link" onClick={closeMenu}>
                    <div>
                      <strong>Đặt phòng của tôi</strong>
                      <span>Kiểm tra trạng thái đơn, thanh toán và mã tham chiếu.</span>
                    </div>
                    <CalendarDays size={16} />
                  </NavLink>
                  {user?.role === "admin" ? (
                    <NavLink to="/admin" className="nav-drawer-link" onClick={closeMenu}>
                      <div>
                        <strong>Quản trị Bella</strong>
                        <span>Mở khu vực vận hành, tồn phòng và ưu đãi.</span>
                      </div>
                      <ShieldCheck size={16} />
                    </NavLink>
                  ) : null}
                  <button type="button" className="nav-drawer-link nav-drawer-link-button" onClick={handleLogout}>
                    <div>
                      <strong>Đăng xuất</strong>
                      <span>Thoát khỏi tài khoản hiện tại trên thiết bị này.</span>
                    </div>
                    <LogOut size={16} />
                  </button>
                </>
              ) : !loading ? (
                <>
                  <Link to="/login" className="nav-drawer-link" onClick={closeMenu}>
                    <div>
                      <strong>Đăng nhập</strong>
                      <span>Mở tài khoản đã liên kết với các đặt phòng Bella của bạn.</span>
                    </div>
                    <ChevronRight size={16} />
                  </Link>
                  <Link to="/register" className="nav-drawer-link" onClick={closeMenu}>
                    <div>
                      <strong>Tạo tài khoản</strong>
                      <span>Lưu thông tin khách để lần đặt sau nhanh và rõ ràng hơn.</span>
                    </div>
                    <ChevronRight size={16} />
                  </Link>
                </>
              ) : (
                <div className="nav-loading-pill" />
              )}
            </div>
          </div>

          <div className="nav-drawer-actions">
            <Link to={primaryAction} className="button button-primary button-block" onClick={closeMenu}>
              {primaryLabel}
            </Link>
          </div>
        </aside>
      </div>
    </header>
  );
}
