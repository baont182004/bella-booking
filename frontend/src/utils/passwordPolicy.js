export const passwordMinLength = 8;
export const passwordPolicyHint =
  "Mật khẩu cần có từ 8 đến 72 ký tự, gồm chữ hoa, chữ thường và số.";

export function validateStrongPassword(value) {
  const normalizedValue = String(value || "");
  if (normalizedValue.length < passwordMinLength || normalizedValue.length > 72) {
    return passwordPolicyHint;
  }

  if (!/[a-z]/.test(normalizedValue) || !/[A-Z]/.test(normalizedValue) || !/\d/.test(normalizedValue)) {
    return passwordPolicyHint;
  }

  return "";
}
