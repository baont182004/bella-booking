import { Kafka } from "kafkajs";
import { BookingOutboxEvent } from "./database.js";

const OUTBOX_SERVICE_NAME = "booking-service";
const OUTBOX_BATCH_SIZE = 20;
const OUTBOX_RETRY_BASE_MS = 15_000;

let kafka;
let producer;
let outboxInterval;
let reconnectTimer;
let kafkaStatus = {
  connected: false,
  connecting: false,
  lastError: null,
  brokers: [],
  lastConnectedAt: null,
};

function getKafkaBrokers() {
  return (process.env.KAFKA_BOOTSTRAP_SERVERS || process.env.KAFKA_BROKER || "localhost:9092")
    .split(",")
    .map((broker) => broker.trim())
    .filter(Boolean);
}

function buildBackoffDelay(attempts = 0) {
  return Math.min(5 * 60 * 1000, OUTBOX_RETRY_BASE_MS * Math.max(1, attempts + 1));
}

function scheduleKafkaReconnect() {
  if (reconnectTimer || kafkaStatus.connected) {
    return;
  }

  const delayMs = Number(process.env.KAFKA_RECONNECT_MS || 10000);
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    void initKafka({ throwOnFailure: false });
  }, delayMs);
  reconnectTimer.unref?.();
}

export async function initKafka({ throwOnFailure = false } = {}) {
  if (producer && kafkaStatus.connected) {
    return true;
  }
  if (kafkaStatus.connecting) {
    return false;
  }

  kafkaStatus.connecting = true;
  kafkaStatus.brokers = getKafkaBrokers();
  try {
    kafka = new Kafka({
      clientId: OUTBOX_SERVICE_NAME,
      brokers: kafkaStatus.brokers,
      retry: {
        initialRetryTime: 100,
        retries: Number(process.env.KAFKA_STARTUP_RETRIES || 3),
      },
    });

    producer = kafka.producer();
    await producer.connect();
    kafkaStatus = {
      connected: true,
      connecting: false,
      lastError: null,
      brokers: kafkaStatus.brokers,
      lastConnectedAt: new Date().toISOString(),
    };
    console.log("Connected to Kafka");
    return true;
  } catch (error) {
    kafkaStatus = {
      ...kafkaStatus,
      connected: false,
      connecting: false,
      lastError: error?.message || "Kafka connection error",
    };
    console.error("Kafka connection error:", error);
    try {
      await producer?.disconnect();
    } catch {
      // Ignore cleanup errors after a failed Kafka connection attempt.
    }
    producer = null;
    scheduleKafkaReconnect();
    if (throwOnFailure) {
      throw error;
    }
    return false;
  }
}

export async function publishEvent(topic, message) {
  if (!producer || !kafkaStatus.connected) {
    scheduleKafkaReconnect();
    throw new Error("Kafka producer not initialized");
  }

  await producer.send({
    topic,
    messages: [
      {
        key: message.id?.toString() || Date.now().toString(),
        value: JSON.stringify(message),
        timestamp: Date.now().toString(),
      },
    ],
  });
}

export function getKafkaStatus() {
  return { ...kafkaStatus };
}

export async function enqueueOutboxEvent({
  topic,
  eventKey,
  aggregateType,
  aggregateId,
  payload,
  session = null,
}) {
  try {
    const outboxEvent = new BookingOutboxEvent({
      service: OUTBOX_SERVICE_NAME,
      topic,
      event_key: eventKey,
      aggregate_type: aggregateType,
      aggregate_id: aggregateId,
      payload,
    });

    return await outboxEvent.save(session ? { session } : undefined);
  } catch (error) {
    if (error?.code === 11000) {
      const query = BookingOutboxEvent.findOne({
        service: OUTBOX_SERVICE_NAME,
        topic,
        event_key: eventKey,
      });
      if (session) {
        query.session(session);
      }
      return query;
    }
    throw error;
  }
}

export function triggerOutboxFlush() {
  void flushOutbox().catch((error) => {
    console.error("Booking outbox flush trigger error:", error);
  });
}

async function lockNextOutboxEvent() {
  return BookingOutboxEvent.findOneAndUpdate(
    {
      service: OUTBOX_SERVICE_NAME,
      status: { $in: ["pending", "failed"] },
      next_attempt_at: { $lte: new Date() },
      locked_at: null,
    },
    {
      $set: {
        locked_at: new Date(),
      },
    },
    {
      sort: { createdAt: 1 },
      new: true,
    },
  );
}

export async function flushOutbox(batchSize = OUTBOX_BATCH_SIZE) {
  let processed = 0;

  while (processed < batchSize) {
    const event = await lockNextOutboxEvent();
    if (!event) {
      break;
    }

    try {
      await publishEvent(event.topic, event.payload);
      await BookingOutboxEvent.updateOne(
        { _id: event._id },
        {
          $set: {
            status: "published",
            published_at: new Date(),
            locked_at: null,
            last_error: null,
          },
          $inc: { attempts: 1 },
        },
      );
    } catch (error) {
      await BookingOutboxEvent.updateOne(
        { _id: event._id },
        {
          $set: {
            status: "failed",
            last_error: error?.message || "Unknown Kafka publish error",
            locked_at: null,
            next_attempt_at: new Date(Date.now() + buildBackoffDelay(event.attempts)),
          },
          $inc: { attempts: 1 },
        },
      );
    }

    processed += 1;
  }

  return processed;
}

export function startOutboxProcessor(intervalMs = 5_000) {
  if (outboxInterval) {
    return;
  }

  const run = async () => {
    try {
      await flushOutbox();
    } catch (error) {
      console.error("Booking outbox flush error:", error);
    }
  };

  outboxInterval = setInterval(run, intervalMs);
  outboxInterval.unref?.();
  void run();
}

export async function disconnectKafka() {
  if (outboxInterval) {
    clearInterval(outboxInterval);
    outboxInterval = null;
  }
  if (producer) {
    await producer.disconnect();
  }
  producer = null;
  kafkaStatus = { ...kafkaStatus, connected: false, connecting: false };
}
