require("dotenv").config();
require("express-async-errors"); // Must be imported before routes
const express = require("express");
const mongoose = require("mongoose");
const connectDB = require("./db/mongodb");
const logger = require("./utils/logger");
const langfuse = require("./utils/langfuse");

// Import middleware
const vapiAuth = require("./middleware/vapiAuth");

// Import routes
const callsRoutes = require("./routes/calls");
const chatRoutes = require("./routes/chat");

const app = express();
const PORT = process.env.PORT || 8000;

// Connect to MongoDB
connectDB();

// Middleware
// Increase body parser limit for VAPI webhooks (they can be large with full transcripts)
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

// Request timeout middleware (30 seconds)
const timeout = require('connect-timeout');
app.use(timeout('30s'));
app.use((req, res, next) => {
  if (!req.timedout) next();
});

// Request logging middleware
app.use((req, res, next) => {
  logger.info(`${req.method} ${req.path}`, {
    ip: req.ip,
    userAgent: req.get("user-agent"),
  });
  next();
});

// Routes
// OpenAI-compatible endpoint (no authentication for Step 1)
app.use("/v1/chat/completions", chatRoutes);

// VAPI webhook routes (keep for now - will refactor in Step 2)
app.use("/webhooks/vapi", vapiAuth, callsRoutes);

// Improved health check endpoint with database status
app.get("/health", async (req, res) => {
  try {
    // Check MongoDB connection
    const dbState = mongoose.connection.readyState;
    const isHealthy = dbState === 1; // 1 = connected

    if (!isHealthy) {
      return res.status(503).json({
        status: "unhealthy",
        database: "disconnected",
        timestamp: new Date().toISOString(),
      });
    }

    res.json({
      status: "ok",
      database: "connected",
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    res.status(503).json({
      status: "error",
      error: error.message,
      timestamp: new Date().toISOString(),
    });
  }
});

// Error handling middleware
app.use((err, req, res, next) => {
  logger.error(`Error: ${err.message}`, {
    stack: err.stack,
    path: req.path,
    method: req.method,
  });

  res.status(err.status || 500).json({
    error: {
      message: err.message || "Internal Server Error",
      ...(process.env.NODE_ENV === "development" && { stack: err.stack }),
    },
  });
});

// 404 handler
app.use((req, res) => {
  logger.warn(`404 - Route not found: ${req.method} ${req.path}`);
  res.status(404).json({ error: "Route not found" });
});

// Start server
const server = app.listen(PORT, () => {
  logger.info(`Server running on port ${PORT}`);
  logger.info(`Environment: ${process.env.NODE_ENV || "development"}`);
});

// Graceful shutdown handlers
process.on('SIGTERM', async () => {
  logger.info('SIGTERM received, shutting down gracefully');

  server.close(() => {
    logger.info('HTTP server closed');
  });

  // Shutdown Langfuse
  try {
    await langfuse.shutdown();
    logger.info('Langfuse client shut down');
  } catch (error) {
    logger.error('Error shutting down Langfuse:', error);
  }

  // Close database connection
  try {
    await mongoose.connection.close();
    logger.info('MongoDB connection closed');
  } catch (error) {
    logger.error('Error closing MongoDB connection:', error);
  }

  process.exit(0);
});

process.on('SIGINT', async () => {
  logger.info('SIGINT received, shutting down gracefully');

  server.close(() => {
    logger.info('HTTP server closed');
  });

  // Shutdown Langfuse
  try {
    await langfuse.shutdown();
    logger.info('Langfuse client shut down');
  } catch (error) {
    logger.error('Error shutting down Langfuse:', error);
  }

  try {
    await mongoose.connection.close();
    logger.info('MongoDB connection closed');
  } catch (error) {
    logger.error('Error closing MongoDB connection:', error);
  }

  process.exit(0);
});
