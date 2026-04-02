import { readFileSync, existsSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "..");
const metadataPath = resolve(repoRoot, "data", "bella-room-metadata.json");
const envPath = resolve(repoRoot, ".env");
const BELLA_HOTEL_NAME = "BELLA HOTEL Phu Quoc";
const require = createRequire(resolve(repoRoot, "services", "user-service", "package.json"));
const mongoose = require("mongoose");
const redis = createRequire(resolve(repoRoot, "services", "hotel-service", "package.json"))("redis");

function loadEnvFile(filePath) {
  if (!existsSync(filePath)) {
    return;
  }

  const content = readFileSync(filePath, "utf8");
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) {
      continue;
    }

    const separator = line.indexOf("=");
    if (separator === -1) {
      continue;
    }

    const key = line.slice(0, separator).trim();
    const value = line.slice(separator + 1).trim().replace(/^['"]|['"]$/g, "");

    if (!(key in process.env)) {
      process.env[key] = value;
    }
  }
}

loadEnvFile(envPath);

const mongoUri = process.env.MONGODB_URI;
if (!mongoUri) {
  throw new Error("MONGODB_URI is required. Set it in the environment or root .env.");
}

const payload = JSON.parse(readFileSync(metadataPath, "utf8"));

const hotelSchema = new mongoose.Schema(
  {
    name: String,
    amenities: [String],
  },
  { timestamps: true, collection: "hotels" },
);

const roomSchema = new mongoose.Schema(
  {
    hotel_id: mongoose.Schema.Types.ObjectId,
    code: String,
    raw_source_name: String,
  },
  { strict: false, timestamps: true, collection: "rooms" },
);

const Hotel = mongoose.model("SyncBellaHotel", hotelSchema);
const Room = mongoose.model("SyncBellaRoom", roomSchema);

function buildRoomMetadataUpdate(roomType) {
  return {
    code: roomType.code,
    localized_name: roomType.name,
    category: roomType.category,
    summary: roomType.summary,
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
    source: roomType.source,
    data_warnings: roomType.dataWarnings || [],
    is_active: roomType.isActive !== false,
  };
}

async function clearHotelCaches() {
  const client = redis.createClient({
    socket: {
      host: process.env.REDIS_HOST || "localhost",
      port: Number(process.env.REDIS_PORT || 6379),
    },
  });

  await client.connect();

  try {
    const patterns = ["hotel:*", "hotels:*"];
    for (const pattern of patterns) {
      const keys = [];
      for await (const key of client.scanIterator({ MATCH: pattern, COUNT: 100 })) {
        keys.push(key);
      }
      if (keys.length > 0) {
        await client.del(keys);
      }
    }
  } finally {
    await client.disconnect();
  }
}

async function run() {
  await mongoose.connect(mongoUri);

  const hotel = await Hotel.findOne({ name: BELLA_HOTEL_NAME }).lean();
  if (!hotel) {
    throw new Error(`Hotel not found: ${BELLA_HOTEL_NAME}`);
  }

  await Hotel.updateOne(
    { _id: hotel._id },
    { $set: { amenities: payload.hotelAmenities || [] } },
  );

  console.log(`Updated hotel amenities for ${BELLA_HOTEL_NAME}`);

  let updatedCount = 0;
  let warningCount = 0;

  for (const roomType of payload.roomTypes || []) {
    const update = buildRoomMetadataUpdate(roomType);

    const matchedRoom = await Room.findOne({
      hotel_id: hotel._id,
      $or: [{ code: roomType.code }, { raw_source_name: roomType.rawSourceName }],
    }).lean();

    if (!matchedRoom) {
      warningCount += 1;
      console.warn(
        `Warning: no BELLA room matched metadata for ${roomType.code} (${roomType.rawSourceName})`,
      );
      continue;
    }

    await Room.updateOne(
      { _id: matchedRoom._id },
      { $set: update },
    );

    updatedCount += 1;
    console.log(
      `Updated room ${matchedRoom.room_type || matchedRoom.code || matchedRoom.raw_source_name} -> ${roomType.code}`,
    );
  }

  console.log(`Bella room metadata sync complete. Updated ${updatedCount} room types, ${warningCount} warnings.`);

  await clearHotelCaches();
  console.log("Cleared hotel and room cache keys.");
}

run()
  .catch((error) => {
    console.error("Bella room metadata sync failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect();
  });
