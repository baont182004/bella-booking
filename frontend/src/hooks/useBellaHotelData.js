import { useEffect, useMemo, useState } from "react";
import { bellaContent } from "../content/bellaContent";
import { bellaRoomOffers } from "../content/bellaRoomOffers";
import { hotelApi } from "../services/api";

function localizeAccessNote(value) {
  if (!value) return null;

  if (value === "Different rooms of this type may be reachable by elevator or stairs only.") {
    return "Các phòng trong cùng hạng có thể được tiếp cận bằng thang máy hoặc cầu thang tùy vị trí thực tế.";
  }

  return value;
}

function localizeDataWarning(value) {
  if (!value) return value;

  if (value === "Occupancy limits are not explicitly stated in the source document.") {
    return "Tài liệu nguồn không nêu rõ sức chứa chuẩn hóa của hạng phòng này.";
  }

  if (
    value ===
    "Sea view is inferred from the room title; the body text repeats garden and city views but does not clearly repeat sea view."
  ) {
    return "Thông tin hướng biển được giữ theo tên hạng phòng; phần mô tả chi tiết không lặp lại rõ nội dung này.";
  }

  if (
    value ===
    "Side sea view is inferred from the room title; the body text only states a scenic view."
  ) {
    return "Thông tin hướng biển một phần được giữ theo tên hạng phòng; phần mô tả chi tiết chỉ nêu tầm nhìn ra khung cảnh.";
  }

  if (
    value ===
    "Bathroom count is not explicitly stated in the source document; a safe default of 1 is retained."
  ) {
    return "Tài liệu nguồn không nêu rõ số phòng tắm; hệ thống đang giữ mặc định an toàn là 1.";
  }

  return value;
}

function buildPricing(reference, offer, liveRoom) {
  const liveCurrentPrice =
    liveRoom?.price_per_night != null ? Number(liveRoom.price_per_night) : null;
  const currentPrice =
    liveCurrentPrice ??
    (offer?.pricing?.currentPrice != null ? Number(offer.pricing.currentPrice) : null);
  const basePrice =
    offer?.pricing?.basePrice != null ? Number(offer.pricing.basePrice) : null;
  const discountPercent =
    offer?.pricing?.discountPercent ??
    (basePrice && currentPrice && basePrice > currentPrice
      ? Math.round(((basePrice - currentPrice) / basePrice) * 100)
      : null);

  return {
    basePrice,
    currentPrice,
    currency: offer?.pricing?.currency || "VND",
    unit: offer?.pricing?.unit || "night",
    taxesIncluded: offer?.pricing?.taxesIncluded ?? null,
    discountPercent: discountPercent || null,
  };
}

function mergeRoom(reference, liveRoom) {
  const offer = bellaRoomOffers[reference.code] || null;
  const localizedName = liveRoom?.localized_name || reference.name || {};
  const bedConfigs = liveRoom?.bed_configs?.length ? liveRoom.bed_configs : reference.bedConfigs;
  const views = liveRoom?.views?.length ? liveRoom.views : reference.views;
  const spaces = liveRoom?.spaces?.length ? liveRoom.spaces : reference.spaces;
  const bathroomFeatures = liveRoom?.bathroom_features?.length
    ? liveRoom.bathroom_features
    : reference.bathroomFeatures;
  const amenities = liveRoom?.amenities?.length ? liveRoom.amenities : reference.amenities;
  const images = liveRoom?.images?.length ? liveRoom.images : reference.images;

  return {
    code: liveRoom?.code || reference.code,
    id: liveRoom?.id || null,
    roomType: liveRoom?.room_type || null,
    displayName:
      localizedName.vi || localizedName.en || liveRoom?.room_type || reference.rawSourceName,
    name: localizedName,
    roomNumber: liveRoom?.room_number || null,
    category: liveRoom?.category || reference.category,
    summary: liveRoom?.summary || reference.summary,
    areaSqm: liveRoom?.area_sqm ?? reference.areaSqm,
    bedroomCount: liveRoom?.bedroom_count ?? reference.bedroomCount ?? null,
    bathroomCount: liveRoom?.bathroom_count ?? reference.bathroomCount ?? null,
    maxAdults: liveRoom?.max_adults ?? reference.maxAdults ?? null,
    maxChildren: liveRoom?.max_children ?? reference.maxChildren ?? null,
    maxOccupancy: liveRoom?.max_occupancy ?? reference.maxOccupancy ?? null,
    bedConfigs,
    spaces,
    views,
    bathroomFeatures,
    amenities,
    accessibility: liveRoom?.accessibility
      ? {
          accessModes: liveRoom.accessibility.access_modes || [],
          accessNote: localizeAccessNote(liveRoom.accessibility.access_note || null),
        }
      : reference.accessibility,
    policies: liveRoom?.policies || reference.policies,
    rawSourceName: liveRoom?.raw_source_name || reference.rawSourceName,
    source: liveRoom?.source || reference.source || null,
    dataWarnings:
      liveRoom?.data_warnings?.length > 0
        ? liveRoom.data_warnings.map((item) => localizeDataWarning(item))
        : reference.dataWarnings || [],
    images,
    pricing: buildPricing(reference, offer, liveRoom),
    bookingOptions: offer?.bookingOptions || {},
    capacity: liveRoom?.capacity ?? reference.maxOccupancy ?? null,
    isLive: Boolean(liveRoom),
    isAvailable: liveRoom?.is_available ?? false,
  };
}

export function buildBellaRoomCatalog(liveRooms = []) {
  return bellaContent.rooms.map((reference) => {
    const liveRoom = liveRooms.find((item) => item.code === reference.code);
    return mergeRoom(reference, liveRoom);
  });
}

export function useBellaHotelData() {
  const [hotel, setHotel] = useState(null);
  const [rooms, setRooms] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    const loadBella = async () => {
      try {
        setLoading(true);
        setLoadError(false);

        const hotelsResponse = await hotelApi.get("/hotels", {
          params: { limit: 20 },
        });
        const hotels = hotelsResponse.data.hotels || [];
        const bellaHotel =
          hotels.find((item) => item.name?.toLowerCase().includes("bella hotel")) ||
          hotels[0] ||
          null;

        setHotel(bellaHotel);

        if (!bellaHotel?.id) {
          setRooms([]);
          setLoadError(true);
          return;
        }

        const roomsResponse = await hotelApi.get(`/hotels/${bellaHotel.id}/rooms`, {
          params: { available: true },
        });

        setRooms(roomsResponse.data.rooms || []);
      } catch (error) {
        setLoadError(true);
        setRooms([]);
      } finally {
        setLoading(false);
      }
    };

    loadBella();
  }, []);

  const roomCatalog = useMemo(() => buildBellaRoomCatalog(rooms), [rooms]);
  const liveRooms = useMemo(() => roomCatalog.filter((room) => room.isLive), [roomCatalog]);
  const liveStartingRate = useMemo(() => {
    const prices = liveRooms
      .map((room) => Number(room.pricing?.currentPrice || 0))
      .filter((price) => price > 0);
    return prices.length ? Math.min(...prices) : null;
  }, [liveRooms]);

  return {
    hotel,
    rooms,
    roomCatalog,
    liveRooms,
    liveStartingRate,
    loading,
    loadError,
  };
}
