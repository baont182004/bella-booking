import {
  formatAmenityLabel,
  formatAreaSqm,
  formatCurrency,
  formatRoomCategory,
  formatViewLabel,
} from "./formatters";

const bathroomFeatureLabels = {
  private_bathroom: "Phòng tắm riêng",
  free_toiletries: "Đồ vệ sinh cá nhân miễn phí",
  towels: "Khăn tắm",
  bidet: "Vòi xịt vệ sinh",
  slippers: "Dép đi trong phòng",
  toilet: "Nhà vệ sinh",
  hairdryer: "Máy sấy tóc",
  toilet_paper: "Giấy vệ sinh",
  bath_or_shower: "Bồn tắm hoặc vòi sen",
};

const spaceLabels = {
  bedroom: "Không gian ngủ",
  living_room: "Phòng khách",
  kitchen: "Bếp",
  balcony: "Ban công",
};

const highlightRules = [
  { when: (room) => room.views?.includes("sea"), label: "Hướng biển" },
  { when: (room) => room.views?.includes("side_sea"), label: "Hướng biển một phần" },
  { when: (room) => room.spaces?.includes("balcony"), label: "Có ban công" },
  { when: (room) => room.category === "apartment", label: "Bố cục căn hộ" },
  { when: (room) => room.category === "studio", label: "Bố cục studio" },
  { when: (room) => room.spaces?.includes("kitchen"), label: "Có khu bếp" },
  { when: (room) => room.amenities?.includes("soundproof"), label: "Cách âm" },
  { when: (room) => room.amenities?.includes("air_conditioning"), label: "Điều hòa" },
  { when: (room) => room.bathroomFeatures?.includes("private_bathroom"), label: "Phòng tắm riêng" },
  { when: (room) => room.amenities?.includes("flat_screen_tv"), label: "TV màn hình phẳng" },
  { when: (room) => room.amenities?.includes("safe"), label: "Két an toàn" },
  { when: (room) => room.amenities?.includes("refrigerator"), label: "Tủ lạnh" },
  { when: (room) => room.amenities?.includes("kitchenware"), label: "Đồ bếp" },
  { when: (room) => room.amenities?.includes("sofa"), label: "Khu ngồi sofa" },
];

function compactLabels(items = [], maxItems = 2) {
  return items.filter(Boolean).slice(0, maxItems);
}

export function getRoomPricing(room) {
  return room?.pricing || {};
}

export function formatPricingUnit(room) {
  const unit = room?.pricing?.unit || "night";
  return unit === "night" ? "/ đêm" : `/ ${unit}`;
}

export function getReadableBedSummary(configs = [], maxItems = 2) {
  const labels = configs
    .map((config) => config?.label)
    .filter(Boolean);

  return compactLabels(labels, maxItems).join(" + ") || "Chưa có thông tin giường";
}

export function getCapacityLabel(room) {
  const maxOccupancy = Number(room?.maxOccupancy || room?.capacity || 0);
  if (!maxOccupancy) return null;
  return `Tối đa ${maxOccupancy} khách`;
}

export function getRoomHighlights(room, maxItems = 5) {
  const highlights = [];
  for (const rule of highlightRules) {
    if (rule.when(room) && !highlights.includes(rule.label)) {
      highlights.push(rule.label);
    }
  }

  if (room?.areaSqm) {
    highlights.push(formatAreaSqm(room.areaSqm));
  }

  return compactLabels(highlights, maxItems);
}

export function getViewTags(room, maxItems = 3) {
  return compactLabels(room?.views || [], maxItems).map((view) => formatViewLabel(view));
}

export function getAmenityTags(room, maxItems = 5) {
  return compactLabels(room?.amenities || [], maxItems).map((item) => formatAmenityLabel(item));
}

export function getBathroomFeatureTags(room, maxItems = 12) {
  return (room?.bathroomFeatures || [])
    .filter(Boolean)
    .slice(0, maxItems)
    .map((item) => bathroomFeatureLabels[item] || formatAmenityLabel(item));
}

export function getAmenityList(room, maxItems = 18) {
  return (room?.amenities || [])
    .filter(Boolean)
    .slice(0, maxItems)
    .map((item) => formatAmenityLabel(item));
}

export function getSpaceTags(room) {
  return (room?.spaces || []).map((space) => spaceLabels[space] || space);
}

export function getBookingBadges(room, limit = 4) {
  const pricing = getRoomPricing(room);
  const options = room?.bookingOptions || {};
  const badges = [];

  if (pricing?.discountPercent) {
    badges.push(`Tiết kiệm ${pricing.discountPercent}%`);
  }

  if (options.breakfastAvailable) {
    badges.push("Có bữa sáng");
  }

  if (pricing?.taxesIncluded === true) {
    badges.push("Đã gồm thuế & phí");
  }

  if (options.payAtProperty === true) {
    badges.push("Thanh toán tại chỗ nghỉ");
  }

  if (options.prepaymentRequired === false) {
    badges.push("Không cần trả trước");
  }

  return compactLabels(badges, limit);
}

export function getBookingBenefits(room) {
  const pricing = getRoomPricing(room);
  const options = room?.bookingOptions || {};
  const benefits = [];

  if (options.breakfastAvailable) {
    benefits.push({
      title: "Bữa sáng",
      copy: options.breakfastPrice
        ? `${formatCurrency(options.breakfastPrice)} / khách`
        : "Có thể bổ sung bữa sáng cho hạng phòng này.",
    });
  }

  if (options.cancellationText) {
    benefits.push({
      title: "Chính sách hủy",
      copy: options.cancellationText,
    });
  }

  if (pricing?.taxesIncluded === true) {
    benefits.push({
      title: "Thuế và phí",
      copy: "Mức giá hiển thị đã bao gồm thuế và phí.",
    });
  } else if (pricing?.taxesIncluded === false) {
    benefits.push({
      title: "Thuế và phí",
      copy: "Thuế và phí có thể được cập nhật khi xác nhận cuối cùng.",
    });
  }

  if (options.payAtProperty === true) {
    benefits.push({
      title: "Thanh toán",
      copy: "Thông tin ưu đãi tham chiếu cho biết có thể thanh toán tại chỗ nghỉ.",
    });
  }

  if (options.prepaymentRequired === false) {
    benefits.push({
      title: "Thanh toán trước",
      copy: "Ưu đãi tham chiếu cho biết mức giá này không yêu cầu trả trước.",
    });
  }

  return benefits;
}

export function getRoomFacts(room) {
  const facts = [
    {
      label: "Phân loại",
      value: formatRoomCategory(room?.category),
    },
    room?.areaSqm
      ? {
          label: "Diện tích",
          value: formatAreaSqm(room.areaSqm),
        }
      : null,
    room?.bedroomCount != null && Number(room.bedroomCount) > 0
      ? {
          label: "Phòng ngủ",
          value: `${room.bedroomCount}`,
        }
      : null,
    room?.bathroomCount != null
      ? {
          label: "Phòng tắm",
          value: `${room.bathroomCount}`,
        }
      : null,
    getCapacityLabel(room)
      ? {
          label: "Sức chứa",
          value: getCapacityLabel(room),
        }
      : null,
  ];

  return facts.filter(Boolean);
}

export function buildRoomGallery(room, fallbackGallery = []) {
  const roomImages = (room?.images || []).map((src) => ({
    src,
    alt: room?.displayName || "Bella room",
  }));

  const fallbackImages = fallbackGallery
    .filter((item) => !roomImages.some((image) => image.src === item.src))
    .slice(0, 3);

  return [...roomImages, ...fallbackImages].slice(0, 4);
}
