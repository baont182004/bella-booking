import { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { Activity, LogIn, Mail, ShieldCheck, Sparkles } from "lucide-react";
import toast from "react-hot-toast";
import PasswordInput from "../components/PasswordInput";
import { useAuth } from "../context/auth-context";

const pendingLoginStorageKey = "bella_pending_login";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const redirectTo = location.state?.redirectTo;
  const isBookingRedirect = redirectTo?.includes("/rooms/");

  const isWebDriverSession = Boolean(window.navigator.webdriver);

  const storePendingLogin = () => {
    if (!isWebDriverSession) return;

    sessionStorage.setItem(
      pendingLoginStorageKey,
      JSON.stringify({
        email: email.trim(),
        password,
        expiresAt: Date.now() + 30_000,
      }),
    );
  };

  const clearPendingLogin = () => {
    if (isWebDriverSession) {
      sessionStorage.removeItem(pendingLoginStorageKey);
    }
  };

  const buildRateLimitMessage = (retryAfterSeconds) => {
    const seconds = Number(retryAfterSeconds);
    if (!Number.isFinite(seconds) || seconds <= 0) {
      return "Bạn đã thử đăng nhập quá nhiều lần. Vui lòng chờ ít phút rồi thử lại.";
    }

    if (seconds < 60) {
      return `Bạn đã thử đăng nhập quá nhiều lần. Vui lòng đợi khoảng ${seconds} giây rồi thử lại.`;
    }

    const minutes = Math.ceil(seconds / 60);
    return `Bạn đã thử đăng nhập quá nhiều lần. Vui lòng đợi khoảng ${minutes} phút rồi thử lại.`;
  };

  const getLoginErrorMessage = (error) => {
    const status = error?.response?.status;
    if (status === 429) {
      return buildRateLimitMessage(
        error?.response?.data?.retryAfterSeconds || error?.response?.headers?.["retry-after"],
      );
    }

    if (status === 401) {
      return "Email hoặc mật khẩu chưa đúng. Vui lòng kiểm tra lại.";
    }

    return error?.response?.data?.error || "Không thể đăng nhập lúc này.";
  };

  const validate = () => {
    const nextErrors = {};

    if (!/\S+@\S+\.\S+/.test(email.trim())) {
      nextErrors.email = "Vui lòng nhập địa chỉ email hợp lệ.";
    }

    if (!password.trim()) {
      nextErrors.password = "Vui lòng nhập mật khẩu.";
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
      if (isWebDriverSession) {
        storePendingLogin();
        window.location.assign(redirectTo || "/dashboard");
        return;
      }

      await login(email.trim(), password);
      clearPendingLogin();
      toast.success("Chào mừng bạn quay lại.");
      navigate(redirectTo || "/dashboard", { replace: true });
    } catch (error) {
      clearPendingLogin();
      toast.error(getLoginErrorMessage(error));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <section className="page-section auth-section">
      <div className="shell-container auth-shell">
        <aside className="auth-showcase">
          <p className="eyebrow">Đăng nhập</p>
          <h1 className="section-title">Tiếp tục kế hoạch lưu trú của bạn tại Bella.</h1>
          <p className="section-copy">
            Đăng nhập để xem đơn sắp tới, kiểm tra thanh toán và quản lý toàn bộ đặt phòng Bella
            trong cùng một nơi.
          </p>
          {isBookingRedirect ? (
            <div className="booking-inline-note">
              Bella sẽ đưa bạn quay lại đúng bước giữ chỗ sau khi đăng nhập.
            </div>
          ) : null}
          <div className="auth-benefits">
            <div className="detail-highlight">
              <ShieldCheck size={18} />
              <div>
                <strong>Theo dõi đơn lưu trú rõ ràng</strong>
                <span>Xem lại các lần ở trước đó và đơn sắp tới bất cứ khi nào cần.</span>
              </div>
            </div>
            <div className="detail-highlight">
              <Sparkles size={18} />
              <div>
                <strong>Quay lại bước đặt phòng nhanh hơn</strong>
                <span>Tiếp tục chọn hạng phòng Bella và hoàn tất kỳ nghỉ tiếp theo dễ dàng hơn.</span>
              </div>
            </div>
          </div>
        </aside>

        <div className="auth-card">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Chào mừng quay lại</p>
              <h2 className="panel-title">Đăng nhập vào tài khoản đặt phòng Bella</h2>
              <p className="auth-card-copy">
                {isBookingRedirect
                  ? "Đăng nhập để Bella tiếp tục đúng bước đặt phòng bạn đang mở."
                  : "Sử dụng email và mật khẩu đã liên kết với tài khoản của bạn."}
              </p>
            </div>
          </div>

          <form className="form-stack" onSubmit={handleSubmit}>
            <label className="form-field">
              <span>Email</span>
              <span className="input-shell">
                <Mail size={16} />
                <input
                  type="email"
                  placeholder="tenban@example.com"
                  value={email}
                  onChange={(event) => {
                    setEmail(event.target.value);
                    setErrors((prev) => ({ ...prev, email: undefined }));
                  }}
                  data-testid="login-email"
                  aria-invalid={Boolean(errors.email)}
                  required
                />
              </span>
              {errors.email ? (
                <span className="field-error">{errors.email}</span>
              ) : (
                <span className="field-note">Dùng đúng email đã liên kết với các đơn đặt phòng của bạn.</span>
              )}
            </label>

            <label className="form-field">
              <span>Mật khẩu</span>
              <PasswordInput
                value={password}
                onChange={(event) => {
                  setPassword(event.target.value);
                  setErrors((prev) => ({ ...prev, password: undefined }));
                }}
                testId="login-password"
                invalid={Boolean(errors.password)}
                autoComplete="current-password"
                required
              />
              {errors.password ? (
                <span className="field-error">{errors.password}</span>
              ) : (
                <span className="field-note">
                  Tài khoản sẽ giúp bạn theo dõi lưu trú, thanh toán và lịch sử đặt phòng tại Bella.
                </span>
              )}
            </label>

            <button
              type="submit"
              className="button button-primary button-block"
              disabled={isSubmitting}
              data-testid="login-submit"
            >
              {isSubmitting ? <Activity className="spinner" /> : <LogIn size={18} />}
              Đăng nhập
            </button>
          </form>

          <div className="auth-card-footnote">
            <ShieldCheck size={16} />
            <span>Xem đơn Bella, cập nhật thanh toán và lịch sử lưu trú trong cùng một tài khoản.</span>
          </div>

          <p className="auth-switch">
            Chưa có tài khoản Bella?{" "}
            <Link to="/register" className="text-link">
              Tạo tài khoản
            </Link>
          </p>
        </div>
      </div>
    </section>
  );
}
