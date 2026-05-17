import { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import {
  Activity,
  BadgeCheck,
  CalendarRange,
  Lock,
  Mail,
  Phone,
  User,
  UserPlus,
} from "lucide-react";
import toast from "react-hot-toast";
import { useAuth } from "../context/auth-context";
import { passwordPolicyHint, validateStrongPassword } from "../utils/passwordPolicy";

export default function Register() {
  const [formData, setFormData] = useState({
    firstName: "",
    lastName: "",
    email: "",
    password: "",
    phone: "",
  });
  const [errors, setErrors] = useState({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { register } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const redirectTo = location.state?.redirectTo;
  const isBookingRedirect = redirectTo?.includes("/rooms/");

  const getRegisterErrorMessage = (error) => {
    if (error?.response?.status === 409) {
      return "Email này đã có tài khoản Bella. Bạn có thể đăng nhập ngay.";
    }

    if (error?.response?.status === 429) {
      return "Bạn đã gửi quá nhiều yêu cầu tạo tài khoản. Vui lòng đợi ít phút rồi thử lại.";
    }

    return error?.response?.data?.error || "Không thể tạo tài khoản.";
  };

  const handleChange = (event) => {
    setFormData((prev) => ({ ...prev, [event.target.name]: event.target.value }));
    setErrors((prev) => ({ ...prev, [event.target.name]: undefined }));
  };

  const validate = () => {
    const nextErrors = {};
    const phoneDigits = formData.phone.replace(/\D/g, "");

    if (formData.firstName.trim().length < 2) {
      nextErrors.firstName = "Vui lòng nhập ít nhất 2 ký tự.";
    }

    if (formData.lastName.trim().length < 2) {
      nextErrors.lastName = "Vui lòng nhập ít nhất 2 ký tự.";
    }

    if (!/\S+@\S+\.\S+/.test(formData.email.trim())) {
      nextErrors.email = "Vui lòng nhập địa chỉ email hợp lệ.";
    }

    if (formData.phone && phoneDigits.length < 8) {
      nextErrors.phone = "Vui lòng nhập số điện thoại hợp lệ hoặc để trống trường này.";
    }

    const passwordError = validateStrongPassword(formData.password.trim());
    if (passwordError) {
      nextErrors.password = passwordError;
    }

    return nextErrors;
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    const nextErrors = validate();
    setErrors(nextErrors);

    if (Object.keys(nextErrors).length > 0) return;

    try {
      setIsSubmitting(true);
      await register({
        ...formData,
        firstName: formData.firstName.trim(),
        lastName: formData.lastName.trim(),
        email: formData.email.trim(),
        phone: formData.phone.trim(),
      });
      toast.success("Tài khoản của bạn đã sẵn sàng.");
      navigate(redirectTo || "/dashboard", { replace: true });
    } catch (error) {
      toast.error(getRegisterErrorMessage(error));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <section className="page-section auth-section">
      <div className="shell-container auth-shell">
        <aside className="auth-showcase">
          <p className="eyebrow">Tạo tài khoản</p>
          <h1 className="section-title">Tạo tài khoản để đặt Bella nhanh và gọn hơn.</h1>
          <p className="section-copy">
            Lưu thông tin một lần để dễ dàng quản lý lưu trú, thanh toán và cập nhật đặt phòng
            Bella trong cùng một tài khoản.
          </p>
          {isBookingRedirect ? (
            <div className="booking-inline-note">
              Tạo tài khoản xong là bạn có thể quay lại ngay bước giữ chỗ đang xem.
            </div>
          ) : null}
          <div className="auth-benefits">
            <div className="detail-highlight">
              <BadgeCheck size={18} />
              <div>
                <strong>Đặt phòng đỡ lặp lại thông tin</strong>
                <span>Thông tin của bạn sẽ được gắn với các lần đặt phòng Bella tiếp theo.</span>
              </div>
            </div>
            <div className="detail-highlight">
              <CalendarRange size={18} />
              <div>
                <strong>Giữ toàn bộ chuyến đi trong một nơi</strong>
                <span>Xem lại đơn sắp tới và lịch sử đặt phòng bất cứ khi nào bạn cần.</span>
              </div>
            </div>
          </div>
        </aside>

        <div className="auth-card">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Hồ sơ khách lưu trú</p>
              <h2 className="panel-title">Tạo tài khoản đặt phòng Bella</h2>
              <p className="auth-card-copy">
                {isBookingRedirect
                  ? "Điền thông tin bên dưới để Bella lưu tài khoản và đưa bạn quay lại bước đặt phòng."
                  : "Điền thông tin bên dưới để bắt đầu đặt và quản lý lưu trú tại Bella."}
              </p>
            </div>
          </div>

          <form className="form-stack" onSubmit={handleSubmit}>
            <div className="form-grid">
              <label className="form-field">
                <span>Tên</span>
                <span className="input-shell">
                  <User size={16} />
                  <input
                    type="text"
                    name="firstName"
                    placeholder="An"
                    value={formData.firstName}
                    onChange={handleChange}
                    data-testid="register-first-name"
                    aria-invalid={Boolean(errors.firstName)}
                    required
                  />
                </span>
                {errors.firstName ? (
                  <span className="field-error">{errors.firstName}</span>
                ) : null}
              </label>

              <label className="form-field">
                <span>Họ</span>
                <span className="input-shell">
                  <User size={16} />
                  <input
                    type="text"
                    name="lastName"
                    placeholder="Nguyễn"
                    value={formData.lastName}
                    onChange={handleChange}
                    data-testid="register-last-name"
                    aria-invalid={Boolean(errors.lastName)}
                    required
                  />
                </span>
                {errors.lastName ? (
                  <span className="field-error">{errors.lastName}</span>
                ) : null}
              </label>
            </div>

            <label className="form-field">
              <span>Email</span>
              <span className="input-shell">
                <Mail size={16} />
                <input
                  type="email"
                  name="email"
                  placeholder="tenban@example.com"
                  value={formData.email}
                  onChange={handleChange}
                  data-testid="register-email"
                  aria-invalid={Boolean(errors.email)}
                  required
                />
              </span>
              {errors.email ? (
                <span className="field-error">{errors.email}</span>
              ) : (
                <span className="field-note">Email này sẽ được dùng để đăng nhập và nhận cập nhật đặt phòng.</span>
              )}
            </label>

            <label className="form-field">
              <span>Số điện thoại</span>
              <span className="input-shell">
                <Phone size={16} />
                <input
                  type="tel"
                  name="phone"
                  placeholder="+84 901 234 567"
                  value={formData.phone}
                  onChange={handleChange}
                  data-testid="register-phone"
                  aria-invalid={Boolean(errors.phone)}
                />
              </span>
              {errors.phone ? (
                <span className="field-error">{errors.phone}</span>
              ) : (
                <span className="field-note">Không bắt buộc, nhưng hữu ích khi cần liên hệ về chuyến đi.</span>
              )}
            </label>

            <label className="form-field">
              <span>Mật khẩu</span>
              <span className="input-shell">
                <Lock size={16} />
                <input
                  type="password"
                  name="password"
                  placeholder="••••••••"
                  value={formData.password}
                  onChange={handleChange}
                  data-testid="register-password"
                  aria-invalid={Boolean(errors.password)}
                  required
                />
              </span>
              {errors.password ? (
                <span className="field-error">{errors.password}</span>
              ) : (
                <span className="field-note">
                  {passwordPolicyHint}
                </span>
              )}
            </label>

            <button
              type="submit"
              className="button button-primary button-block"
              disabled={isSubmitting}
              data-testid="register-submit"
            >
              {isSubmitting ? <Activity className="spinner" /> : <UserPlus size={18} />}
              Tạo tài khoản
            </button>
          </form>

          <div className="auth-card-footnote">
            <BadgeCheck size={16} />
            <span>Dùng một tài khoản để theo dõi đặt phòng, thanh toán và các chuyến đi sắp tới tại Bella.</span>
          </div>

          <p className="auth-switch">
            Đã có tài khoản?{" "}
            <Link to="/login" className="text-link">
              Đăng nhập
            </Link>
          </p>
        </div>
      </div>
    </section>
  );
}
