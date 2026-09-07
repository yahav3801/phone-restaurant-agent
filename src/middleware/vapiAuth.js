const logger = require("../utils/logger");
const Restaurant = require("../models/Restaurant");

/**
 * Middleware to verify VAPI webhook requests with multi-account support
 *
 * Flow:
 * 1. Extract phone number from webhook body
 * 2. Lookup restaurant by vapiPhoneNumber
 * 3. Verify per-restaurant webhook secret (if configured)
 * 4. Attach restaurant to req.restaurant for downstream handlers
 *
 * VAPI sends a secret token in the X-Vapi-Secret header
 */
async function verifyVapiWebhook(req, res, next) {
  try {
    // Step 1: Extract phone number to identify restaurant
    const vapiPhoneNumber = extractPhoneNumber(req.body);

    if (!vapiPhoneNumber) {
      logger.warn("Cannot identify restaurant - no phone number in webhook", {
        ip: req.ip,
        path: req.path,
        bodyKeys: Object.keys(req.body || {})
      });

      // Fallback: Allow through but don't attach restaurant
      // The downstream handler will handle this case
      return next();
    }

    // Step 2: Find restaurant by phone number
    const restaurant = await Restaurant.findOne({
      vapiPhoneNumber: vapiPhoneNumber
    });

    if (!restaurant) {
      logger.warn("Restaurant not found for VAPI webhook", {
        vapiPhoneNumber,
        ip: req.ip
      });

      return res.status(404).json({
        error: "Restaurant not found for this phone number"
      });
    }

    logger.debug("Restaurant identified from webhook", {
      restaurantId: restaurant._id,
      restaurantName: restaurant.name,
      vapiPhoneNumber
    });

    // Step 3: Verify webhook secret (per-restaurant or global fallback)
    const shouldEnforceAuth = process.env.NODE_ENV === 'production';

    if (shouldEnforceAuth || restaurant.vapi?.webhookSecret) {
      const receivedSecret = req.headers["x-vapi-secret"];
      const expectedSecret = restaurant.vapi?.webhookSecret || process.env.VAPI_WEBHOOK_SECRET;

      // Check if secret is configured
      if (!expectedSecret) {
        logger.warn("No webhook secret configured for restaurant", {
          restaurantId: restaurant._id,
          restaurantName: restaurant.name
        });

        if (shouldEnforceAuth) {
          return res.status(500).json({
            error: "Webhook authentication not configured"
          });
        }
      }

      // Check if secret is provided in request
      if (expectedSecret && !receivedSecret) {
        logger.warn("Vapi webhook request missing X-Vapi-Secret header", {
          ip: req.ip,
          path: req.path,
          restaurantId: restaurant._id
        });

        if (shouldEnforceAuth) {
          return res.status(401).json({
            error: "Missing authentication header"
          });
        }
      }

      // Verify secret matches
      if (expectedSecret && receivedSecret && receivedSecret !== expectedSecret) {
        logger.warn("Vapi webhook request with invalid secret", {
          ip: req.ip,
          path: req.path,
          restaurantId: restaurant._id,
          receivedSecretPrefix: receivedSecret.substring(0, 8) + "..."
        });

        return res.status(401).json({
          error: "Invalid authentication credentials"
        });
      }

      logger.debug("Vapi webhook authenticated successfully", {
        restaurantId: restaurant._id,
        authMethod: expectedSecret === restaurant.vapi?.webhookSecret ? 'per-restaurant' : 'global'
      });
    } else {
      logger.warn("⚠️  VAPI AUTHENTICATION DISABLED (development mode)", {
        restaurantId: restaurant._id,
        env: process.env.NODE_ENV
      });
    }

    // Step 4: Attach restaurant to request for downstream handlers
    req.restaurant = restaurant;

    next();

  } catch (error) {
    logger.error("Error in Vapi webhook authentication:", {
      error: error.message,
      stack: error.stack
    });

    return res.status(500).json({
      error: "Authentication error"
    });
  }
}

/**
 * Extract phone number from VAPI webhook body
 * Handles different webhook event formats
 *
 * @param {Object} webhookBody - Request body from VAPI webhook
 * @returns {string|null} Phone number or null
 */
function extractPhoneNumber(webhookBody) {
  if (!webhookBody) {
    return null;
  }

  // Method 1: From phoneNumber.number (tool-calls events)
  if (webhookBody.phoneNumber && webhookBody.phoneNumber.number) {
    return webhookBody.phoneNumber.number;
  }

  // Method 2: From call.to (status-update and other events)
  if (webhookBody.call && webhookBody.call.to) {
    return typeof webhookBody.call.to === 'string'
      ? webhookBody.call.to
      : webhookBody.call.to.number;
  }

  // Method 3: From call.phoneNumber.number (alternative format)
  if (webhookBody.call && webhookBody.call.phoneNumber && webhookBody.call.phoneNumber.number) {
    return webhookBody.call.phoneNumber.number;
  }

  return null;
}

module.exports = verifyVapiWebhook;
