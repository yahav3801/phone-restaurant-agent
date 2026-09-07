const mongoose = require("mongoose");
const logger = require("../utils/logger");

// Connection pool configuration for high concurrency
const options = {
  maxPoolSize: 50,              // Up from default 10 - supports 50+ concurrent calls
  minPoolSize: 10,              // Maintain minimum connections for performance
  maxIdleTimeMS: 30000,         // Close idle connections after 30s
  serverSelectionTimeoutMS: 5000, // Timeout for initial server selection
  socketTimeoutMS: 45000,       // Socket timeout for long queries
  connectTimeoutMS: 10000,      // Connection timeout
  retryWrites: true,            // Retry failed writes
  retryReads: true,             // Retry failed reads
};

// Exponential backoff retry configuration
const MAX_RETRIES = 5;
const INITIAL_RETRY_DELAY = 1000; // 1 second

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const connectDB = async (retryCount = 0) => {
  try {
    const conn = await mongoose.connect(process.env.MONGODB_URI, options);

    logger.info(`MongoDB Connected: ${conn.connection.host}`, {
      poolSize: options.maxPoolSize,
      minPoolSize: options.minPoolSize,
    });

    // Connection event listeners for monitoring
    mongoose.connection.on("disconnected", () => {
      logger.warn("MongoDB disconnected. Attempting to reconnect...");
    });

    mongoose.connection.on("error", (err) => {
      logger.error("MongoDB connection error:", {
        error: err.message,
        stack: err.stack,
      });
    });

    mongoose.connection.on("reconnected", () => {
      logger.info("MongoDB reconnected successfully");
    });

  } catch (error) {
    logger.error(`Error connecting to MongoDB (attempt ${retryCount + 1}/${MAX_RETRIES}):`, {
      error: error.message,
      stack: error.stack,
    });

    // Exponential backoff retry logic
    if (retryCount < MAX_RETRIES) {
      const retryDelay = INITIAL_RETRY_DELAY * Math.pow(2, retryCount);
      logger.info(`Retrying connection in ${retryDelay}ms...`);
      await sleep(retryDelay);
      return connectDB(retryCount + 1);
    }

    // Max retries exceeded - exit process
    logger.error("Max MongoDB connection retries exceeded. Exiting...");
    process.exit(1);
  }
};

/**
 * Export raw collections for direct MongoDB operations
 * Usage:
 *   const { getCollections } = require('./db/mongodb');
 *   const { knowledgeBase, orders } = await getCollections();
 */
async function getCollections() {
  const db = mongoose.connection.db;
  if (!db) {
    throw new Error('Database not connected. Call connectDB() first.');
  }

  return {
    knowledgeBase: db.collection('knowledge_base'),
    orders: db.collection('orders'),
    sessions: db.collection('sessions')  // For future use
  };
}

module.exports = connectDB;
module.exports.getCollections = getCollections;
