import { useEffect, useState } from "react";
import { Link, NavLink, useLocation, useNavigate } from "react-router-dom";
import { CalendarDays, LogOut, Menu, X } from "lucide-react";
import toast from "react-hot-toast";
import BrandLogo from "./BrandLogo";
import { useAuth } from "../context/AuthContext";
import { getInitials } from "../utils/formatters";

const propertyLinks = [
  { to: "/#overview", label: "Trang chủ" },
  { to: "/#rooms", label: "Phòng" },
  { to: "/#amenities", label: "Tiện nghi" },
  { to: "/#location", label: "Vị trí" },
  { to: "/#reviews", label: "Đánh giá" },
  { to: "/#contact", label: "Liên hệ" },
];

function accountLinkClass({ isActive }) {
  return isActive ? "nav-link nav-link-active" : "nav-link";
}

export default function Navbar() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [isScrolled, setIsScrolled] = useState(false);
  const { token, user, logout, loading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const closeMenu = () => setMobileMenuOpen(false);

  useEffect(() => {
    const handleScroll = () => setIsScrolled(window.scrollY > 24);

    handleScroll();
    window.addEventListener("scroll", handleScroll, { passive: true });

    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const handleLogout = () => {
    logout();
    closeMenu();
    toast.success("Đã đăng xuất");
    navigate("/");
  };

  const primaryAction = location.pathname.startsWith("/rooms/") ? `${location.pathname}#book` : "/#rooms";
  const primaryLabel = "Đặt phòng ngay";

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
            {propertyLinks.map(({ to, label }) => (
              <Link key={to} to={to} className="nav-link">
                {label}
              </Link>
            ))}
            {token ? (
              <NavLink to="/bookings" className={accountLinkClass}>
                Đơn đặt phòng
              </NavLink>
              ) : null}
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
                    <strong>{user.firstName || "Tài khoản khách"}</strong>
                    <small>{location.pathname === "/dashboard" ? "Tài khoản" : "Hồ sơ của tôi"}</small>
                  </span>
                </NavLink>
                <Link to={primaryAction} className="button button-primary" onClick={closeMenu}>
                  {primaryLabel}
                </Link>
                <button type="button" className="button button-secondary" onClick={handleLogout}>
                  <LogOut size={16} />
                  Đăng xuất
                </button>
              </>
            ) : !loading ? (
              <>
                <Link to="/login" className="button button-ghost">
                  Đăng nhập
                </Link>
                <Link to={primaryAction} className="button button-primary">
                  {primaryLabel}
                </Link>
              </>
            ) : (
              <div className="nav-loading-pill" />
            )}
          </div>

          <button
            type="button"
            className="nav-toggle"
            onClick={() => setMobileMenuOpen((prev) => !prev)}
            aria-expanded={mobileMenuOpen}
            aria-label="Mở menu điều hướng"
          >
            {mobileMenuOpen ? <X size={22} /> : <Menu size={22} />}
          </button>
        </div>

        {mobileMenuOpen ? (
          <div className="nav-mobile">
            <nav className="nav-mobile-links">
              {propertyLinks.map(({ to, label }) => (
                <Link key={to} to={to} className="nav-link" onClick={closeMenu}>
                  {label}
                </Link>
              ))}
              {token ? (
                <NavLink to="/bookings" className={accountLinkClass} onClick={closeMenu}>
                  <CalendarDays size={16} />
                  Đơn đặt phòng
                </NavLink>
              ) : null}
            </nav>

            {!loading && token && user ? (
              <div className="nav-mobile-actions">
                <NavLink to="/dashboard" className="user-pill" onClick={closeMenu}>
                  <span className="user-pill-avatar">
                    {getInitials(`${user.firstName || ""} ${user.lastName || ""}`)}
                  </span>
                  <span className="user-pill-copy">
                    <strong>{user.firstName || "Tài khoản khách"}</strong>
                    <small>{user.email}</small>
                  </span>
                </NavLink>
                <Link to={primaryAction} className="button button-primary" onClick={closeMenu}>
                  {primaryLabel}
                </Link>
                <button type="button" className="button button-secondary" onClick={handleLogout}>
                  <LogOut size={16} />
                  Đăng xuất
                </button>
              </div>
            ) : !loading ? (
              <div className="nav-mobile-actions">
                <Link to="/login" className="button button-ghost" onClick={closeMenu}>
                  Đăng nhập
                </Link>
                <Link to={primaryAction} className="button button-primary" onClick={closeMenu}>
                  {primaryLabel}
                </Link>
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </header>
  );
}
