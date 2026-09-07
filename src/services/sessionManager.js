const logger = require('../utils/logger');

/**
 * Session Management System
 *
 * Manages conversation sessions with state tracking and context persistence
 *
 * Storage Modes:
 * - Development: In-memory Map (current implementation)
 * - Production: MongoDB or Redis (see migration comments below)
 *
 * Session States:
 * - GREETING: Initial greeting, restaurant intro
 * - COLLECTING_ORDER: Taking menu items
 * - COLLECTING_DETAILS: Getting customer info (name, address, phone)
 * - CONFIRMING_ORDER: Final confirmation before placement
 * - ORDER_PLACED: Order successfully placed
 */

// Session expiration time (1 hour in milliseconds)
const SESSION_EXPIRATION_MS = 60 * 60 * 1000;

// Cleanup interval (every 5 minutes)
const CLEANUP_INTERVAL_MS = 5 * 60 * 1000;

class SessionManager {
  constructor() {
    // In-memory storage (development)
    // For production, replace with MongoDB or Redis
    this.sessions = new Map();

    // Start periodic cleanup
    this.startCleanupTimer();

    logger.info('SessionManager initialized', {
      storage: 'in-memory',
      expirationMs: SESSION_EXPIRATION_MS,
      cleanupIntervalMs: CLEANUP_INTERVAL_MS
    });
  }

  /**
   * Get session by conversationId, create new if doesn't exist
   *
   * @param {string} conversationId - Unique conversation identifier
   * @returns {Object} Session object
   */
  getSession(conversationId) {
    if (!conversationId) {
      throw new Error('conversationId is required');
    }

    // Check if session exists
    if (this.sessions.has(conversationId)) {
      const session = this.sessions.get(conversationId);

      // Check if expired
      const now = new Date();
      const timeSinceLastActivity = now - session.lastActivity;

      if (timeSinceLastActivity > SESSION_EXPIRATION_MS) {
        logger.warn('Session expired, creating new session', {
          conversationId,
          timeSinceLastActivity,
          expirationMs: SESSION_EXPIRATION_MS
        });

        // Delete expired session and create new
        this.sessions.delete(conversationId);
        return this.createNewSession(conversationId);
      }

      // Update last activity
      session.lastActivity = now;

      logger.debug('Session retrieved', {
        conversationId,
        state: session.state,
        cartSize: session.context.cart.length
      });

      return session;
    }

    // Create new session
    return this.createNewSession(conversationId);
  }

  /**
   * Create new session with default state
   *
   * @param {string} conversationId - Unique conversation identifier
   * @returns {Object} New session object
   */
  createNewSession(conversationId) {
    const now = new Date();

    const session = {
      conversationId,
      state: 'GREETING',
      context: {
        customerName: null,
        phoneNumber: null,
        deliveryAddress: null,
        deliveryType: null,  // "delivery" | "pickup" | null
        cart: []
      },
      history: [],
      createdAt: now,
      lastActivity: now
    };

    this.sessions.set(conversationId, session);

    logger.info('New session created', {
      conversationId,
      state: session.state
    });

    return session;
  }

  /**
   * Update session fields
   * Supports partial updates to state, context, or history
   *
   * @param {string} conversationId - Unique conversation identifier
   * @param {Object} updates - Fields to update
   * @param {string} [updates.state] - New state
   * @param {Object} [updates.context] - Context fields to update
   * @param {Array} [updates.history] - New history entry (will be appended)
   * @returns {Object} Updated session
   */
  updateSession(conversationId, updates) {
    if (!conversationId) {
      throw new Error('conversationId is required');
    }

    const session = this.getSession(conversationId);

    // Update state
    if (updates.state) {
      const validStates = ['GREETING', 'COLLECTING_ORDER', 'COLLECTING_DETAILS', 'CONFIRMING_ORDER', 'ORDER_PLACED'];
      if (!validStates.includes(updates.state)) {
        throw new Error(`Invalid state: ${updates.state}. Must be one of: ${validStates.join(', ')}`);
      }

      logger.info('Session state transition', {
        conversationId,
        oldState: session.state,
        newState: updates.state
      });

      session.state = updates.state;
    }

    // Update context (merge with existing)
    if (updates.context) {
      session.context = {
        ...session.context,
        ...updates.context
      };

      // If cart is being updated, replace entirely (not merge)
      if (updates.context.cart !== undefined) {
        session.context.cart = updates.context.cart;
      }

      logger.debug('Session context updated', {
        conversationId,
        updatedFields: Object.keys(updates.context)
      });
    }

    // Append to history
    if (updates.history) {
      if (!Array.isArray(updates.history)) {
        updates.history = [updates.history];
      }

      session.history.push(...updates.history);

      // Limit history to last 20 messages (10 turns) to prevent memory bloat
      if (session.history.length > 20) {
        session.history = session.history.slice(-20);
      }

      logger.debug('Session history updated', {
        conversationId,
        historySize: session.history.length
      });
    }

    // Update last activity timestamp
    session.lastActivity = new Date();

    // Save updated session
    this.sessions.set(conversationId, session);

    logger.info('Session saved after update', {
      conversationId,
      state: session.state,
      historyLength: session.history.length,
      cartItems: session.context.cart.length,
      hasCustomerDetails: !!(session.context.customerName || session.context.phoneNumber || session.context.deliveryAddress)
    });

    return session;
  }

  /**
   * Save complete session (replace existing)
   *
   * @param {string} conversationId - Unique conversation identifier
   * @param {Object} session - Complete session object
   * @returns {Object} Saved session
   */
  saveSession(conversationId, session) {
    if (!conversationId) {
      throw new Error('conversationId is required');
    }

    if (!session) {
      throw new Error('session object is required');
    }

    // Validate session structure
    const requiredFields = ['conversationId', 'state', 'context', 'history', 'createdAt', 'lastActivity'];
    for (const field of requiredFields) {
      if (session[field] === undefined) {
        throw new Error(`Missing required session field: ${field}`);
      }
    }

    // Update last activity
    session.lastActivity = new Date();

    this.sessions.set(conversationId, session);

    logger.debug('Session saved', {
      conversationId,
      state: session.state
    });

    return session;
  }

  /**
   * Delete session by conversationId
   *
   * @param {string} conversationId - Unique conversation identifier
   * @returns {boolean} True if deleted, false if not found
   */
  deleteSession(conversationId) {
    if (!conversationId) {
      throw new Error('conversationId is required');
    }

    const existed = this.sessions.has(conversationId);
    this.sessions.delete(conversationId);

    if (existed) {
      logger.info('Session deleted', { conversationId });
    } else {
      logger.debug('Session not found for deletion', { conversationId });
    }

    return existed;
  }

  /**
   * Clean up expired sessions
   * Removes sessions with lastActivity older than SESSION_EXPIRATION_MS
   *
   * @returns {number} Number of sessions deleted
   */
  cleanupExpiredSessions() {
    const now = new Date();
    let deletedCount = 0;

    for (const [conversationId, session] of this.sessions.entries()) {
      const timeSinceLastActivity = now - session.lastActivity;

      if (timeSinceLastActivity > SESSION_EXPIRATION_MS) {
        this.sessions.delete(conversationId);
        deletedCount++;

        logger.debug('Expired session cleaned up', {
          conversationId,
          state: session.state,
          timeSinceLastActivity
        });
      }
    }

    if (deletedCount > 0) {
      logger.info('Session cleanup completed', {
        deletedCount,
        remainingSessions: this.sessions.size
      });
    }

    return deletedCount;
  }

  /**
   * Start periodic cleanup timer
   * Runs cleanupExpiredSessions() every CLEANUP_INTERVAL_MS
   */
  startCleanupTimer() {
    this.cleanupTimer = setInterval(() => {
      this.cleanupExpiredSessions();
    }, CLEANUP_INTERVAL_MS);

    // Prevent timer from keeping process alive
    if (this.cleanupTimer.unref) {
      this.cleanupTimer.unref();
    }

    logger.debug('Cleanup timer started', {
      intervalMs: CLEANUP_INTERVAL_MS
    });
  }

  /**
   * Stop cleanup timer (for graceful shutdown)
   */
  stopCleanupTimer() {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
      logger.debug('Cleanup timer stopped');
    }
  }

  /**
   * Get all active sessions (for debugging/monitoring)
   *
   * @returns {Array} Array of session objects
   */
  getAllSessions() {
    return Array.from(this.sessions.values());
  }

  /**
   * Get session count (for monitoring)
   *
   * @returns {number} Number of active sessions
   */
  getSessionCount() {
    return this.sessions.size;
  }

  /**
   * Get session statistics (for monitoring)
   *
   * @returns {Object} Session statistics
   */
  getStats() {
    const sessions = this.getAllSessions();
    const now = new Date();

    const stateCounts = {};
    let totalCartItems = 0;
    let avgHistorySize = 0;

    for (const session of sessions) {
      // Count by state
      stateCounts[session.state] = (stateCounts[session.state] || 0) + 1;

      // Sum cart items
      totalCartItems += session.context.cart.length;

      // Sum history size
      avgHistorySize += session.history.length;
    }

    if (sessions.length > 0) {
      avgHistorySize = avgHistorySize / sessions.length;
    }

    return {
      totalSessions: sessions.length,
      stateCounts,
      totalCartItems,
      avgHistorySize: Math.round(avgHistorySize * 10) / 10
    };
  }

  /**
   * Graceful shutdown - save all sessions and stop cleanup
   *
   * For MongoDB migration:
   * - Iterate through sessions.values()
   * - Save each to MongoDB
   * - Close MongoDB connection
   *
   * For Redis migration:
   * - Use MULTI/EXEC to batch save all sessions
   * - Close Redis connection
   */
  async shutdown() {
    logger.info('SessionManager shutting down', {
      activeSessions: this.sessions.size
    });

    // Stop cleanup timer
    this.stopCleanupTimer();

    // TODO: If using MongoDB, save all sessions to database here
    // const sessions = Array.from(this.sessions.values());
    // await Session.insertMany(sessions);

    // TODO: If using Redis, save all sessions to Redis here
    // const pipeline = redis.pipeline();
    // for (const [id, session] of this.sessions.entries()) {
    //   pipeline.setex(`session:${id}`, SESSION_EXPIRATION_MS / 1000, JSON.stringify(session));
    // }
    // await pipeline.exec();

    // Clear in-memory sessions
    this.sessions.clear();

    logger.info('SessionManager shutdown complete');
  }
}

// Export singleton instance
const sessionManager = new SessionManager();

module.exports = sessionManager;

/**
 * MIGRATION TO MONGODB
 *
 * 1. Create Session model (models/Session.js):
 *
 * const SessionSchema = new mongoose.Schema({
 *   conversationId: { type: String, required: true, unique: true, index: true },
 *   state: {
 *     type: String,
 *     enum: ['GREETING', 'COLLECTING_ORDER', 'COLLECTING_DETAILS', 'CONFIRMING_ORDER', 'ORDER_PLACED'],
 *     required: true
 *   },
 *   context: {
 *     customerName: String,
 *     phoneNumber: String,
 *     deliveryAddress: String,
 *     deliveryType: { type: String, enum: ['delivery', 'pickup'] },
 *     cart: [{
 *       id: mongoose.Schema.Types.ObjectId,
 *       name: String,
 *       price: Number,
 *       quantity: Number
 *     }]
 *   },
 *   history: [{
 *     role: { type: String, enum: ['user', 'assistant'] },
 *     content: String
 *   }],
 *   createdAt: { type: Date, default: Date.now },
 *   lastActivity: { type: Date, default: Date.now, index: true }
 * });
 *
 * // TTL index for auto-expiration
 * SessionSchema.index({ lastActivity: 1 }, { expireAfterSeconds: 3600 });
 *
 * 2. Replace Map operations:
 * - getSession: Session.findOne({ conversationId }) || new Session({ conversationId })
 * - updateSession: Session.findOneAndUpdate({ conversationId }, updates, { new: true })
 * - saveSession: Session.findOneAndReplace({ conversationId }, session, { upsert: true })
 * - deleteSession: Session.deleteOne({ conversationId })
 * - cleanupExpiredSessions: Not needed (MongoDB TTL handles this)
 *
 * 3. Benefits:
 * - Persistence across server restarts
 * - Automatic expiration via TTL index
 * - Scalable to millions of sessions
 * - Query capabilities (find by state, customer, etc.)
 */

/**
 * MIGRATION TO REDIS
 *
 * 1. Install Redis client:
 * npm install redis
 *
 * 2. Initialize Redis:
 * const redis = require('redis');
 * const client = redis.createClient({
 *   url: process.env.REDIS_URL || 'redis://localhost:6379'
 * });
 *
 * 3. Replace Map operations:
 * - getSession: JSON.parse(await client.get(`session:${conversationId}`))
 * - updateSession: await client.setex(`session:${conversationId}`, 3600, JSON.stringify(session))
 * - saveSession: await client.setex(`session:${conversationId}`, 3600, JSON.stringify(session))
 * - deleteSession: await client.del(`session:${conversationId}`)
 * - cleanupExpiredSessions: Not needed (Redis TTL handles this)
 *
 * 4. Benefits:
 * - Ultra-fast (sub-millisecond access)
 * - Automatic expiration via SETEX
 * - Perfect for session storage
 * - Horizontal scaling via Redis Cluster
 *
 * 5. Key format:
 * session:{conversationId} -> JSON stringified session object
 * TTL: 3600 seconds (1 hour)
 */
