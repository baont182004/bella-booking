import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { Hotel, Room } from "../config/database.js";
import { getRedisClient } from "../config/redis.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
export const BELLA_HOTEL_NAME = "BELLA HOTEL Phu Quoc";

function resolveMetadataPath() {
  const configuredPath = process.env.BELLA_METADATA_FILE;
  const candidates = [
    configuredPath,
    resolve(process.cwd(), "data", "bella-room-metadata.json"),
    resolve(__dirname, "..", "..", "..", "..", "data", "bella-room-metadata.json"),
  ].filter(Boolean);

  return candidates.find((candidate) => existsSync(candidate)) || null;
}

export function loadBellaMetadata() {
  const metadataPath = resolveMetadataPath();
  if (!metadataPath) {
    throw new Error("Bella metadata file not found");
  }

  return {
    metadataPath,
    payload: JSON.parse(readFileSync(metadataPath, "utf8")),
  };
}

export async function clearHotelCaches(patterns = ["hotel:*", "hotels:*"]) {
  const redis = getRedisClient();

  for (const pattern of patterns) {
    const keys = await redis.keys(pattern);
    if (keys.length > 0) {
      await redis.del(...keys);
    }
  }
}

function buildRoomMetadataUpdate(roomType) {
  return {
    code: roomType.code,
    localized_name: roomType.name,
    category: roomType.category,
    summary: roomType.summary,
    description: roomType.summary,
    area_sqm: roomType.areaSqm,
    bedroom_count: roomType.bedroomCount,
    bathroom_count: roomType.bathroomCount,
    max_adults: roomType.maxAdults,
    max_children: roomType.maxChildren,
    max_occupancy: roomType.maxOccupancy,
    bed_configs: roomType.bedConfigs,
    spaces: roomType.spaces,
    views: roomType.views,
    bathroom_features: roomType.bathroomFeatures,
    amenities: roomType.amenities,
    accessibility: {
      access_modes: roomType.accessibility?.accessModes || [],
      access_note: roomType.accessibility?.accessNote || null,
    },
    policies: roomType.policies,
    raw_source_name: roomType.rawSourceName,
    source: roomType.source || null,
    data_warnings: roomType.dataWarnings || [],
    is_active: roomType.isActive !== false,
  };
}

export async function syncBellaRoomMetadata() {
  const { metadataPath, payload } = loadBellaMetadata();

  const hotel = await Hotel.findOne({ name: BELLA_HOTEL_NAME }).lean();
  if (!hotel) {
    throw new Error(`Hotel not found: ${BELLA_HOTEL_NAME}`);
  }

  await Hotel.updateOne(
    { _id: hotel._id },
    { $set: { amenities: payload.hotelAmenities || [] } },
  );

  const updatedRooms = [];
  const warnings = [];

  for (const roomType of payload.roomTypes || []) {
    const matchedRoom = await Room.findOne({
      hotel_id: hotel._id,
      $or: [{ code: roomType.code }, { raw_source_name: roomType.rawSourceName }],
    }).lean();

    if (!matchedRoom) {
      warnings.push(
        `No BELLA room matched metadata for ${roomType.code} (${roomType.rawSourceName})`,
      );
      continue;
    }

    await Room.updateOne(
      { _id: matchedRoom._id },
      { $set: buildRoomMetadataUpdate(roomType) },
    );

    updatedRooms.push({
      code: roomType.code,
      roomType: matchedRoom.room_type || matchedRoom.code || matchedRoom.raw_source_name,
    });
  }

  await clearHotelCaches();

  return {
    hotelId: hotel._id.toString(),
    hotelName: hotel.name,
    metadataPath,
    hotelAmenitiesUpdated: (payload.hotelAmenities || []).length,
    updatedRooms,
    warnings,
  };
}
