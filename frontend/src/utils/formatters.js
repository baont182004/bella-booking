const currencyFormatter = new Intl.NumberFormat("vi-VN", {
  style: "currency",
  currency: "VND",
  maximumFractionDigits: 0,
});

const dateFormatter = new Intl.DateTimeFormat("vi-VN", {
  month: "short",
  day: "numeric",
  year: "numeric",
});

const roomAttributeLabels = {
  air_conditioning: "Điều hòa",
  safe: "Két an toàn",
  soundproof: "Cách âm",
  flat_screen_tv: "TV màn hình phẳng",
  tv: "TV",
  refrigerator: "Tủ lạnh",
  telephone: "Điện thoại",
  pay_tv: "Truyền hình trả tiền",
  fan: "Quạt máy",
  electric_kettle: "Ấm đun nước điện",
  wardrobe: "Tủ quần áo",
  desk: "Bàn làm việc",
  socket_near_bed: "Ổ điện gần giường",
  cleaning_products: "Sản phẩm lau rửa",
  hypoallergenic: "Không gây dị ứng",
  tile_marble_floor: "Sàn lát gạch hoặc đá cẩm thạch",
  clothes_rack: "Giá treo quần áo",
  carbon_monoxide_detector: "Thiết bị báo carbon monoxide",
  individual_ac: "Điều hòa riêng",
  hand_sanitizer: "Nước rửa tay",
  microwave: "Lò vi sóng",
  kitchenette: "Bếp nhỏ",
  kitchen: "Bếp riêng",
  kitchenware: "Đồ bếp",
  dining_table: "Bàn ăn",
  dining_area: "Khu vực ăn uống",
  sofa: "Sofa",
  seating_area: "Khu vực tiếp khách",
  interconnected_room: "Phòng thông nhau",
};

const roomViewLabels = {
  garden: "Hướng vườn",
  mountain: "Hướng núi",
  city: "Hướng thành phố",
  sea: "Hướng biển",
  side_sea: "Hướng biển một phần",
  landmark: "Tầm nhìn ra khung cảnh",
};

const roomCategoryLabels = {
  room: "Phòng",
  studio: "Studio",
  apartment: "Căn hộ",
};

const accessModeLabels = {
  elevator: "Thang máy",
  stairs: "Cầu thang",
};

function fallbackLabel(value = "") {
  return value
    .split("_")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function formatCurrency(value) {
  const amount = Number(value ?? 0);
  return currencyFormatter.format(Number.isNaN(amount) ? 0 : amount);
}

export function formatDate(value) {
  if (!value) return "Chưa chọn";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Chưa chọn" : dateFormatter.format(date);
}

export function formatDateRange(start, end) {
  return `${formatDate(start)} - ${formatDate(end)}`;
}

export function formatStatusLabel(status) {
  if (!status) return "Chưa xác định";
  if (status === "pending") return "Chờ xác nhận";
  if (status === "confirmed") return "Đã xác nhận";
  if (status === "cancelled") return "Đã hủy";
  if (status === "completed") return "Hoàn tất";
  return status.charAt(0).toUpperCase() + status.slice(1);
}

export function formatGuestLabel(count) {
  const total = Number(count ?? 0);
  if (!total) return "Theo sức chứa";
  return total === 1 ? "1 khách" : `${total} khách`;
}

export function getInitials(value = "") {
  return value
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((item) => item[0]?.toUpperCase() || "")
    .join("");
}

export function normalizeAmenityList(items = [], maxItems = 4) {
  return items.filter(Boolean).slice(0, maxItems);
}

export function formatAmenityLabel(value = "") {
  return roomAttributeLabels[value] || fallbackLabel(value);
}

export function formatAmenityList(items = [], maxItems = 4) {
  return normalizeAmenityList(items, maxItems).map((item) => formatAmenityLabel(item));
}

export function formatViewLabel(value = "") {
  return roomViewLabels[value] || fallbackLabel(value);
}

export function formatViewList(items = [], maxItems = 3) {
  return normalizeAmenityList(items, maxItems).map((item) => formatViewLabel(item));
}

export function formatAreaSqm(value) {
  const area = Number(value ?? 0);
  return Number.isFinite(area) && area > 0 ? `${area} m2` : null;
}

export function formatBedConfigSummary(configs = []) {
  const labels = configs
    .map(
      (config) => config?.label || `${config?.quantity || 1} ${fallbackLabel(config?.type || "bed")}`,
    )
    .filter(Boolean);

  return labels.length ? labels.join(", ") : "Chưa có thông tin giường";
}

export function formatRoomCategory(value = "") {
  return roomCategoryLabels[value] || fallbackLabel(value);
}

export function formatRoomDisplayName(room) {
  return (
    room?.localized_name?.vi ||
    room?.name?.vi ||
    room?.raw_source_name ||
    room?.room_type ||
    "Hạng phòng Bella"
  );
}

export function formatAccessModeLabel(value = "") {
  return accessModeLabels[value] || fallbackLabel(value);
}
