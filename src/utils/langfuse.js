const { Langfuse } = require('langfuse');
const logger = require('./logger');

/**
 * Langfuse Client for Observability
 *
 * Usage:
 * const langfuse = require('./utils/langfuse');
 *
 * const trace = langfuse.trace({
 *   name: 'chat-completion',
 *   sessionId: 'session-123'
 * });
 *
 * trace.update({
 *   output: 'response',
 *   metadata: { duration: 123 }
 * });
 */

let langfuseClient = null;

/**
 * Initialize Langfuse client
 */
function initLangfuse() {
  try {
    const secretKey = process.env.LANGFUSE_SECRET_KEY;
    const publicKey = process.env.LANGFUSE_PUBLIC_KEY;
    const baseUrl = process.env.LANGFUSE_BASE_URL || 'https://cloud.langfuse.com';

    if (!secretKey || !publicKey) {
      logger.warn('Langfuse not configured - observability disabled', {
        hasSecretKey: !!secretKey,
        hasPublicKey: !!publicKey
      });

      // Return mock client for development
      return createMockClient();
    }

    langfuseClient = new Langfuse({
      secretKey,
      publicKey,
      baseUrl
    });

    logger.info('Langfuse client initialized', {
      baseUrl
    });

    return langfuseClient;

  } catch (error) {
    logger.error('Error initializing Langfuse client', {
      error: error.message
    });

    // Return mock client on error
    return createMockClient();
  }
}

/**
 * Create mock Langfuse client for development
 */
function createMockClient() {
  logger.warn('Using mock Langfuse client - traces will not be persisted');

  return {
    trace: (options) => {
      logger.debug('Mock trace created', options);
      return {
        update: (data) => {
          logger.debug('Mock trace updated', data);
        },
        generation: (data) => {
          logger.debug('Mock generation created', data);
          return {
            update: (genData) => {
              logger.debug('Mock generation updated', genData);
            }
          };
        }
      };
    },
    shutdown: async () => {
      logger.debug('Mock Langfuse client shutdown');
    }
  };
}

/**
 * Get or create Langfuse client (singleton)
 */
function getLangfuseClient() {
  if (!langfuseClient) {
    langfuseClient = initLangfuse();
  }
  return langfuseClient;
}

/**
 * Shutdown Langfuse client gracefully
 */
async function shutdownLangfuse() {
  if (langfuseClient && typeof langfuseClient.shutdown === 'function') {
    logger.info('Shutting down Langfuse client');
    await langfuseClient.shutdown();
  }
}

// Initialize on module load
const client = getLangfuseClient();

module.exports = client;
module.exports.shutdown = shutdownLangfuse;
