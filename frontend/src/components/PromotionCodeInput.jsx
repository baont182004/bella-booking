export default function PromotionCodeInput({ value, onChange, onValidate, loading }) {
  return (
    <label className="form-field promotion-code-input">
      <span>Mã ưu đãi</span>
      <div className="promotion-code-row">
        <input
          name="promotionCode"
          className="text-input"
          placeholder="BELLA10"
          value={value}
          onChange={onChange}
          data-testid="booking-promotion-code"
        />
        <button type="button" className="button button-secondary" onClick={onValidate} disabled={loading || !value.trim()}>
          {loading ? "Đang kiểm tra" : "Áp dụng"}
        </button>
      </div>
      <span className="field-note">
        Server sẽ tự kiểm tra điều kiện và tính lại tổng tiền từ dữ liệu Bella.
      </span>
    </label>
  );
}
