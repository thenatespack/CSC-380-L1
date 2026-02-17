const { Kafka, CompressionTypes, logLevel } = require("kafkajs");

const kafka = new Kafka({
  clientId: "game-api",
  brokers: [process.env.KAFKA_BROKER || "redpanda:9092"],
  logLevel: logLevel.ERROR,
  retry: {
    initialRetryTime: 100,
    retries: 8,
  },
});

const producer = kafka.producer({
  idempotent: true,
  maxInFlightRequests: 5,
});

let isConnected = false;
let isShuttingDown = false;

const connectProducer = async () => {
  if (isConnected) return;

  try {
    await producer.connect();
    isConnected = true;
    console.log("Kafka Producer connected");
  } catch (err) {
    console.error("Failed to connect Kafka producer:", err);
    throw err;
  }
};

const disconnectProducer = async () => {
  if (!isConnected) return;

  try {
    await producer.disconnect();
    isConnected = false;
    console.log("Kafka Producer disconnected");
  } catch (err) {
    console.error("Error disconnecting Kafka producer:", err);
  }
};

const sendNotification = async (eventType, data) => {
  if (isShuttingDown) {
    console.warn("Producer is shutting down. Message skipped.");
    return;
  }

  try {
    if (!isConnected) {
      await connectProducer();
    }

    await producer.send({
      topic: "email-notifications",
      compression: CompressionTypes.GZIP,
      messages: [
        {
          key: eventType,
          value: JSON.stringify({
            eventType,
            timestamp: new Date().toISOString(),
            data,
          }),
        },
      ],
    });

    console.log(`Sent ${eventType} notification`);
  } catch (err) {
    console.error(`Failed to send ${eventType} notification:`, err);
    throw err;
  }
};

const shutdown = async () => {
  try {
    console.log("Shutting down Kafka producer...");
    isShuttingDown = true;
    await disconnectProducer();
    process.exit(0);
  } catch (err) {
    console.error("Shutdown error:", err);
    process.exit(1);
  }
};

module.exports = {
  connectProducer,
  disconnectProducer,
  sendNotification,
};
