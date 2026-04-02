import { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { Activity, Lock, LogIn, Mail, ShieldCheck, Sparkles } from "lucide-react";
import toast from "react-hot-toast";
import { useAuth } from "../context/AuthContext";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const validate = () => {
    const nextErrors = {};

    if (!/\S+@\S+\.\S+/.test(email.trim())) {
      nextErrors.email = "Vui lòng nhập địa chỉ email hợp lệ.";
    }

    if (password.trim().length < 6) {
      nextErrors.password = "Mật khẩu cần có ít nhất 6 ký tự.";
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
      await login(email.trim(), password);
      toast.success("Chào mừng bạn quay lại.");
      navigate(location.state?.redirectTo || "/dashboard");
    } catch (error) {
      toast.error(error.response?.data?.error || "Không thể đăng nhập.");
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
                Sử dụng email và mật khẩu đã liên kết với tài khoản của bạn.
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
              <span className="input-shell">
                <Lock size={16} />
                <input
                  type="password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(event) => {
                    setPassword(event.target.value);
                    setErrors((prev) => ({ ...prev, password: undefined }));
                  }}
                  aria-invalid={Boolean(errors.password)}
                  required
                />
              </span>
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
