import { Eye, EyeOff, Lock } from "lucide-react";
import { useState } from "react";

export default function PasswordInput({
  value,
  onChange,
  name,
  placeholder = "••••••••",
  testId,
  invalid = false,
  autoComplete,
  required = false,
}) {
  const [visible, setVisible] = useState(false);
  const label = visible ? "Ẩn mật khẩu" : "Hiện mật khẩu";

  return (
    <span className="input-shell password-input-shell">
      <Lock size={16} />
      <input
        type={visible ? "text" : "password"}
        name={name}
        placeholder={placeholder}
        value={value}
        onChange={onChange}
        data-testid={testId}
        aria-invalid={Boolean(invalid)}
        autoComplete={autoComplete}
        required={required}
      />
      <button
        type="button"
        className="password-toggle-button"
        onClick={() => setVisible((prev) => !prev)}
        aria-label={label}
        title={label}
      >
        {visible ? <EyeOff size={17} /> : <Eye size={17} />}
      </button>
    </span>
  );
}
