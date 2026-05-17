const audienceOptions = [
  { label: "Tất cả", value: "" },
  { label: "Cặp đôi", value: "cặp đôi" },
  { label: "Gia đình", value: "gia đình" },
  { label: "Nhóm bạn", value: "nhóm" },
  { label: "Công tác", value: "công tác" },
  { label: "Nghỉ dưỡng dài ngày", value: "nghỉ dưỡng dài ngày" },
  { label: "Trọn gói", value: "trọn gói" },
];

const nightOptions = [
  { label: "Mọi thời lượng", value: "" },
  { label: "2N1Đ", value: 1 },
  { label: "3N2Đ", value: 2 },
];

export default function ComboFilterBar({ filters, onChange }) {
  return (
    <div className="combo-filter-bar">
      <div className="combo-filter-group" aria-label="Lọc theo nhóm khách">
        {audienceOptions.map((option) => (
          <button
            key={option.label}
            type="button"
            className={filters.suitableFor === option.value ? "combo-filter-pill combo-filter-pill-active" : "combo-filter-pill"}
            onClick={() => onChange({ ...filters, suitableFor: option.value })}
          >
            {option.label}
          </button>
        ))}
      </div>

      <div className="combo-filter-side">
        <select
          className="combo-select"
          value={filters.nights}
          onChange={(event) => onChange({ ...filters, nights: event.target.value })}
          aria-label="Lọc theo số đêm"
        >
          {nightOptions.map((option) => (
            <option key={option.label} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <select
          className="combo-select"
          value={filters.sort}
          onChange={(event) => onChange({ ...filters, sort: event.target.value })}
          aria-label="Sắp xếp combo"
        >
          <option value="displayOrder">Bella đề xuất</option>
          <option value="price">Giá thấp đến cao</option>
          <option value="price_desc">Giá cao đến thấp</option>
        </select>
      </div>
    </div>
  );
}
