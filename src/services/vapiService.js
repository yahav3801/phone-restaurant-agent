const { VapiClient } = require("@vapi-ai/server-sdk");
const logger = require("../utils/logger");

class VapiService {
  /**
   * Create a VapiService instance with a specific API key
   * @param {string} apiKey - VAPI API key
   */
  constructor(apiKey) {
    if (!apiKey) {
      throw new Error("VAPI API key is required");
    }

    this.client = new VapiClient({ token: apiKey });
    this.apiKey = apiKey;

    logger.debug("VapiService initialized", {
      apiKeyPrefix: apiKey.substring(0, 8) + "..."
    });
  }

  /**
   * Factory method: Create VapiService for a specific restaurant
   * @param {Object} restaurant - Restaurant document with vapi.apiKey
   * @returns {VapiService} VapiService instance
   */
  static forRestaurant(restaurant) {
    if (!restaurant) {
      throw new Error("Restaurant object is required");
    }

    // Check for per-restaurant API key
    if (restaurant.vapi && restaurant.vapi.apiKey) {
      logger.debug("Using restaurant-specific VAPI key", {
        restaurantId: restaurant._id,
        restaurantName: restaurant.name
      });
      return new VapiService(restaurant.vapi.apiKey);
    }

    // Development fallback: use global key
    if (process.env.NODE_ENV === 'development' && process.env.VAPI_API_KEY) {
      logger.warn("Development mode: using global VAPI key", {
        restaurantId: restaurant._id,
        restaurantName: restaurant.name
      });
      return new VapiService(process.env.VAPI_API_KEY);
    }

    // Production: require per-restaurant key
    throw new Error(
      `Restaurant ${restaurant._id} (${restaurant.name}) missing VAPI API key. ` +
      `Each restaurant must have their own VAPI account in production.`
    );
  }

  /**
   * Factory method: Create VapiService using global API key (DEPRECATED)
   * @returns {VapiService} VapiService instance
   * @deprecated Use forRestaurant() instead for multi-tenant support
   */
  static global() {
    if (!process.env.VAPI_API_KEY) {
      throw new Error("VAPI_API_KEY is not set in environment variables");
    }

    logger.warn("Using global VAPI key (deprecated - use forRestaurant instead)");
    return new VapiService(process.env.VAPI_API_KEY);
  }

  /**
   * Create a call with Hebrew language support
   */
  async createCall(phoneNumber, assistantConfig) {
    try {
      const call = await this.client.phone.call({
        phoneNumberId: assistantConfig.phoneNumberId,
        customer: {
          number: phoneNumber,
        },
        assistant: {
          ...assistantConfig,
          // Hebrew language configuration
          model: {
            provider: "openai",
            model: "gpt-4",
            messages: [
              {
                role: "system",
                content: assistantConfig.systemMessage,
              },
            ],
            tools: assistantConfig.tools || [],
            temperature: 0.7,
          },
          voice: {
            provider: "11labs",
            voiceId: "21m00Tcm4TlvDq8ikWAM", // Hebrew voice or adjust as needed
            stability: 0.5,
            similarityBoost: 0.75,
          },
          firstMessage:
            assistantConfig.firstMessage || "שלום! איך אני יכול לעזור לך היום?",
          language: "he", // Hebrew
          transcriber: {
            provider: "deepgram",
            model: "nova-2",
            language: "he", // Hebrew
          },
        },
      });

      return call;
    } catch (error) {
      console.error("Error creating Vapi call:", error);
      throw error;
    }
  }

  /**
   * End a call
   */
  async endCall(callId) {
    try {
      const result = await this.client.call.end(callId);
      return result;
    } catch (error) {
      console.error("Error ending call:", error);
      throw error;
    }
  }

  /**
   * Get call details
   */
  async getCall(callId) {
    try {
      const call = await this.client.call.get(callId);
      return call;
    } catch (error) {
      console.error("Error getting call:", error);
      throw error;
    }
  }
}

// Export the class, not an instance (factory pattern)
// Usage:
//   const VapiService = require('./vapiService');
//   const vapiService = VapiService.forRestaurant(restaurant);
module.exports = VapiService;
