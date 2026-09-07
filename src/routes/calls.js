const express = require("express");
const router = express.Router();
const Restaurant = require("../models/Restaurant");
const Order = require("../models/Order");
const KnowledgeBase = require("../models/KnowledgeBase");
const WebhookLog = require("../models/WebhookLog");
// const paymentService = require("../services/payments"); // Removed in Step 1
// const smsService = require("../services/sms"); // Removed in Step 1
const logger = require("../utils/logger");
const { generateEmbedding, dotProduct } = require("../utils/embeddings");
const {
  sanitizePhoneNumber,
  sanitizeCustomerName,
  sanitizeDeliveryAddress,
  validateOrderItems,
} = require("../utils/validators");
const functions = require("../services/functions");

/**
 * Vapi webhook handler for call events
 * Supports both assistant-based and workflow-based architectures
 */
router.post("/", async (req, res) => {
  try {
    const { message } = req.body;

    // Restaurant is attached by vapiAuth middleware (req.restaurant)
    const restaurant = req.restaurant;

    // DEBUG: Log the full webhook structure
    if (message?.type === "tool-calls" || message?.type === "node-transition") {
      logger.info("Webhook received:", {
        messageType: message?.type,
        hasRestaurant: !!restaurant,
        restaurantId: restaurant?._id,
        hasPhoneNumber: !!req.body.phoneNumber,
        hasCall: !!req.body.call,
        hasMessageCall: !!message?.call,
        messageCallId: message?.call?.id || null,
        messageCallKeys: message?.call ? Object.keys(message.call) : [],
        topLevelKeys: Object.keys(req.body),
      });
    }

    // Handle workflow node transitions (workflow-specific event)
    if (message?.type === "node-transition") {
      return await handleNodeTransition(req, res, restaurant);
    }

    // Handle tool calls from Vapi AI (NEW FORMAT - workflows and assistants)
    if (message?.type === "tool-calls") {
      return await handleFunctionCall(req, res, restaurant);
    }

    // Handle function calls (OLD FORMAT - backward compatibility)
    if (message?.type === "function-call") {
      logger.warn(
        "Received old-format function-call - consider migrating to workflows"
      );
      return await handleFunctionCall(req, res, restaurant);
    }

    // Handle call status updates
    if (message?.type === "status-update") {
      return await handleStatusUpdate(req, res, restaurant);
    }

    // Default: acknowledge receipt
    res.json({ received: true });
  } catch (error) {
    logger.error("Error in Vapi webhook:", error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Handle function calls from Vapi AI (workflows and assistants)
 * @param {Object} restaurant - Restaurant from middleware (req.restaurant)
 */
async function handleFunctionCall(req, res, restaurant) {
  try {
    const { message } = req.body;

    // Extract tool call from new format (toolCalls array) or old format (functionCall)
    let functionCall;
    let parameters = {};
    let toolCallId = null;

    if (message.toolCalls && message.toolCalls.length > 0) {
      // New format: extract from toolCalls array
      const toolCall = message.toolCalls[0];
      toolCallId = toolCall.id; // Extract toolCallId from the tool call object
      functionCall = toolCall.function;
      const { name, arguments: args } = functionCall;
      // Arguments might be a string (JSON) or already an object
      parameters = args
        ? typeof args === "string"
          ? JSON.parse(args)
          : args
        : {};
      functionCall.name = name;
      functionCall.parameters = parameters;
    } else if (message.functionCall) {
      // Old format: direct functionCall property (backward compatibility)
      functionCall = message.functionCall;
      parameters = functionCall.parameters || {};
      // Old format may not have toolCallId, so we'll use null
    } else {
      logger.error("No tool call or function call found in message");
      return res.json({
        results: [
          {
            toolCallId: null,
            result: "No function call data found",
          },
        ],
      });
    }

    const { name } = functionCall;

    logger.info(`Function call received: ${name}`, {
      parameters,
      toolCallId,
      restaurantId: restaurant?._id,
      workflowId: restaurant?.vapi?.workflowId,
      timestamp: new Date().toISOString(),
      messageType: message.type,
      hasToolCalls: !!message.toolCalls,
      toolCallsCount: message.toolCalls?.length || 0,
    });

    // Idempotency check: return cached result if this toolCallId was already processed
    if (toolCallId) {
      const existingLog = await WebhookLog.findOne({ toolCallId });
      if (existingLog) {
        logger.info(`Duplicate webhook detected, returning cached result`, {
          toolCallId,
          functionName: name,
          originalProcessedAt: existingLog.processedAt,
        });
        return res.json({
          results: [{ toolCallId, result: existingLog.result }],
        });
      }
    }

    // Process the function call
    let result;

    switch (name) {
      case "search_menu":
        return await handleSearchMenu(
          parameters,
          toolCallId,
          req,
          res,
          restaurant
        );

      case "get_restaurant_info":
        return await handleGetRestaurantInfo(
          parameters,
          toolCallId,
          req,
          res,
          restaurant
        );

      case "get_cart_summary":
        return await handleGetCartSummary(
          parameters,
          toolCallId,
          req,
          res,
          restaurant
        );

      case "add_to_cart":
        return await handleAddToCart(
          parameters,
          toolCallId,
          req,
          res,
          restaurant
        );

      case "update_cart":
        return await handleUpdateCart(
          parameters,
          toolCallId,
          req,
          res,
          restaurant
        );

      case "place_order":
        return await handlePlaceOrder(
          parameters,
          toolCallId,
          req,
          res,
          restaurant
        );

      case "extract_customer_details":
        return await handleExtractCustomerDetails(
          parameters,
          toolCallId,
          req,
          res,
          restaurant
        );

      // Deprecated handlers - kept for backward compatibility
      case "get_restaurant_context":
        logger.warn(
          "DEPRECATED: get_restaurant_context called - use get_restaurant_info instead"
        );
        return await handleGetRestaurantInfo(
          parameters,
          toolCallId,
          req,
          res,
          restaurant
        );

      case "get_menu":
        logger.warn("DEPRECATED: get_menu called - use search_menu instead");
        return await handleGetMenu(toolCallId, req, res, restaurant);

      case "redirect_to_human":
        logger.warn(
          "DEPRECATED: redirect_to_human called - use built-in transferCall tool instead"
        );
        return await handleRedirectToHuman(
          parameters,
          toolCallId,
          req,
          res,
          restaurant
        );

      default:
        return res.json({
          results: [
            {
              toolCallId: toolCallId,
              result: `Unknown function: ${name}`,
            },
          ],
        });
    }
  } catch (error) {
    logger.error("Error handling function call:", error);
    return res.status(500).json({
      results: [
        {
          toolCallId: null,
          result: error.message,
        },
      ],
    });
  }
}

/**
 * Handle workflow node transitions
 * Called when workflow moves between nodes
 * Useful for analytics and debugging
 */
async function handleNodeTransition(req, res, restaurant) {
  try {
    const { message, call } = req.body;

    logger.info("Workflow node transition", {
      restaurantId: restaurant?._id,
      workflowId: restaurant?.vapi?.workflowId,
      fromNode: message.fromNode,
      toNode: message.toNode,
      callId: call?.id,
      variables: message.variables,
    });

    // Track analytics (optional - implement if needed)
    // await analytics.trackNodeTransition(...)

    // Acknowledge receipt
    res.json({ received: true });
  } catch (error) {
    logger.error("Error handling node transition:", error);
    res.status(500).json({ error: error.message });
  }
}

/**
 * Handle search_menu function call
 * Performs vector similarity search on menu items
 */
async function handleSearchMenu(parameters, toolCallId, req, res, restaurant) {
  const startTime = Date.now();
  try {
    const { query, limit = 5, inStockOnly = true } = parameters;

    if (!query || typeof query !== "string") {
      throw new Error("Search query is required");
    }

    // Use restaurant from parameter (attached by middleware)
    // Fallback to finding restaurant if not provided (backward compatibility)
    if (!restaurant) {
      restaurant = await findRestaurantFromCall(req);
    }

    if (!restaurant) {
      throw new Error("Restaurant not found");
    }

    // Create Order on first search_menu call (indicates food ordering intent)
    const callId = getCallId(req);
    const callerPhone = getCallerPhoneNumber(req);
    const orderStartTime = Date.now();
    if (callId) {
      try {
        await getOrCreateOrderForCall(callId, restaurant, callerPhone);
        logger.info("Order creation/get timing:", {
          duration: `${Date.now() - orderStartTime}ms`,
          callId,
        });
      } catch (error) {
        logger.warn(
          "Failed to create/get Order for call, continuing with search",
          {
            callId,
            error: error.message,
            duration: `${Date.now() - orderStartTime}ms`,
          }
        );
        // Continue with search even if Order creation fails
      }
    }

    logger.info("Menu search request:", {
      restaurantId: restaurant._id,
      query,
      limit,
      inStockOnly,
      callId,
    });

    // Generate embedding for search query
    const embeddingStartTime = Date.now();
    const queryEmbedding = await generateEmbedding(query);
    const embeddingDuration = Date.now() - embeddingStartTime;
    logger.info("Embedding generation timing:", {
      duration: `${embeddingDuration}ms`,
      queryLength: query.length,
    });

    // Build filter for MongoDB query
    const filter = {
      type: 'menu',
      restaurantId: restaurant._id
    };
    if (inStockOnly) {
      filter.inStock = true;
    }

    // Fetch all matching menu items
    const dbStartTime = Date.now();
    const menuItems = await KnowledgeBase.find(filter)
      .select("name description price category inStock embedding")
      .lean();
    const dbDuration = Date.now() - dbStartTime;
    logger.info("MongoDB query timing:", {
      duration: `${dbDuration}ms`,
      itemsFound: menuItems.length,
    });

    if (menuItems.length === 0) {
      logger.warn("No menu items found", { restaurantId: restaurant._id });
      return res.json({
        results: [
          {
            toolCallId: toolCallId,
            result: JSON.stringify([]),
          },
        ],
      });
    }

    // Calculate similarity scores
    const vectorStartTime = Date.now();
    const scoredItems = menuItems.map((item) => {
      const score = dotProduct(item.embedding, queryEmbedding);
      return {
        name: item.name,
        description: item.description,
        price: item.price,
        category: item.category,
        inStock: item.inStock,
        score: score,
      };
    });

    // Sort by similarity and return top N results
    const topResults = scoredItems
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map(({ score, ...item }) => item);
    const vectorDuration = Date.now() - vectorStartTime;
    logger.info("Vector similarity calculation timing:", {
      duration: `${vectorDuration}ms`,
      itemsProcessed: menuItems.length,
    });

    const totalDuration = Date.now() - startTime;
    logger.info("Menu search results:", {
      query,
      resultCount: topResults.length,
      topItems: topResults.slice(0, 3).map((r) => r.name),
      totalDuration: `${totalDuration}ms`,
      breakdown: {
        embedding: `${embeddingDuration}ms`,
        database: `${dbDuration}ms`,
        vectorCalc: `${vectorDuration}ms`,
        other: `${
          totalDuration - embeddingDuration - dbDuration - vectorDuration
        }ms`,
      },
    });

    return res.json({
      results: [
        {
          toolCallId: toolCallId,
          result: topResults, // Return actual array for GPT Realtime models
        },
      ],
    });
  } catch (error) {
    logger.error("Error searching menu:", error);
    return res.json({
      results: [
        {
          toolCallId: toolCallId,
          result: {
            // Return actual object for GPT Realtime models
            error: `שגיאה בחיפוש תפריט: ${error.message}`,
          },
        },
      ],
    });
  }
}

/**
 * Handle place_order function call
 * Finalizes Order document with customer info and changes status to pending_payment
 */
async function handlePlaceOrder(parameters, toolCallId, req, res, restaurant) {
  try {
    // Use restaurant from parameter (attached by middleware)
    // Fallback to finding restaurant if not provided (backward compatibility)
    if (!restaurant) {
      restaurant = await findRestaurantFromCall(req);
    }
    if (!restaurant) {
      throw new Error("Restaurant not found");
    }

    const callId = getCallId(req);

    // Call service function
    const result = await functions.placeOrder({
      callId,
      restaurant,
      customerName: parameters.customerName,
      phoneNumber: parameters.phoneNumber,
      paymentType: parameters.paymentType,
      deliveryAddress: parameters.deliveryAddress,
    });

    // Log to WebhookLog for idempotency
    if (toolCallId) {
      await WebhookLog.create({
        toolCallId,
        callId,
        functionName: "place_order",
        parameters,
        result: result.success ? result.data.message : result.error,
        processedAt: new Date(),
      });
    }

    // Format response for Vapi
    if (result.success) {
      return res.json({
        results: [{ toolCallId, result: result.data.message }],
      });
    } else {
      logger.error("placeOrder failed", {
        error: result.error,
        errorType: result.errorType,
        parameters,
      });
      return res.json({
        results: [{ toolCallId, result: result.error }],
      });
    }
  } catch (error) {
    logger.error("Unexpected error in handlePlaceOrder:", error);
    return res.json({
      results: [
        {
          toolCallId,
          result: "שגיאה בלתי צפויה. אנא נסה שוב או התקשר לייצוג אנושי.",
        },
      ],
    });
  }
}

/**
 * Handle get_restaurant_info function call
 * Returns restaurant information (replaces get_restaurant_context)
 */
async function handleGetRestaurantInfo(
  parameters,
  toolCallId,
  req,
  res,
  restaurant
) {
  try {
    // Use restaurant from parameter (attached by middleware)
    if (!restaurant) {
      restaurant = await findRestaurantFromCall(req);
    }
    if (!restaurant) {
      throw new Error("Restaurant not found");
    }

    const { query } = parameters || {};

    // Build restaurant info object
    const info = {
      name: restaurant.name,
      address: restaurant.address || "לא צוין",
      businessHours: restaurant.businessHours || "לא צוין",
      phoneNumber: restaurant.phoneNumber || "לא צוין",
      businessInfo: restaurant.businessInfo || "",
      policies: {
        delivery: {
          available: restaurant.settings?.allowDelivery !== false,
          fee: restaurant.settings?.deliveryFee || 0,
          minimumOrder: restaurant.settings?.minimumOrder || 0,
        },
        pickup: {
          available: restaurant.settings?.allowPickup !== false,
        },
      },
      humanSupportPhone: restaurant.humanRedirectPhone || "לא זמין",
    };

    // If query provided, filter relevant info
    if (query && typeof query === "string") {
      const queryLower = query.toLowerCase();
      let filteredInfo = {};

      if (
        queryLower.includes("שעות") ||
        queryLower.includes("hours") ||
        queryLower.includes("פתוח")
      ) {
        filteredInfo.businessHours = info.businessHours;
      }
      if (queryLower.includes("כתובת") || queryLower.includes("address")) {
        filteredInfo.address = info.address;
      }
      if (queryLower.includes("משלוח") || queryLower.includes("delivery")) {
        filteredInfo.delivery = info.policies.delivery;
      }
      if (queryLower.includes("איסוף") || queryLower.includes("pickup")) {
        filteredInfo.pickup = info.policies.pickup;
      }
      if (queryLower.includes("כשר") || queryLower.includes("kosher")) {
        filteredInfo.businessInfo = info.businessInfo;
      }

      // If no matches, return all info
      if (Object.keys(filteredInfo).length === 0) {
        filteredInfo = info;
      } else {
        filteredInfo.name = info.name; // Always include name
      }

      return res.json({
        results: [
          {
            toolCallId: toolCallId,
            result: filteredInfo,
          },
        ],
      });
    }

    // Return all info if no query
    return res.json({
      results: [
        {
          toolCallId: toolCallId,
          result: info,
        },
      ],
    });
  } catch (error) {
    logger.error("Error getting restaurant info:", error);
    return res.json({
      results: [
        {
          toolCallId: toolCallId,
          result: { error: `שגיאה בקבלת מידע המסעדה: ${error.message}` },
        },
      ],
    });
  }
}

/**
 * Handle get_cart_summary function call
 * Returns current cart contents from Order document
 */
async function handleGetCartSummary(
  parameters,
  toolCallId,
  req,
  res,
  restaurant
) {
  try {
    if (!restaurant) {
      restaurant = await findRestaurantFromCall(req);
    }
    if (!restaurant) {
      throw new Error("Restaurant not found");
    }

    const callId = getCallId(req);

    // Call service function
    const result = await functions.getCartSummary({
      callId,
      restaurant,
    });

    // Log to WebhookLog for idempotency
    if (toolCallId) {
      await WebhookLog.create({
        toolCallId,
        callId,
        functionName: "get_cart_summary",
        parameters,
        result: result.success ? result.data : result.error,
        processedAt: new Date(),
      });
    }

    // Format response for Vapi
    if (result.success) {
      return res.json({
        results: [{ toolCallId, result: result.data }],
      });
    } else {
      logger.error("getCartSummary failed", {
        error: result.error,
        errorType: result.errorType,
        callId,
      });
      return res.json({
        results: [
          {
            toolCallId,
            result: { error: result.error },
          },
        ],
      });
    }
  } catch (error) {
    logger.error("Unexpected error in handleGetCartSummary:", error);
    return res.json({
      results: [
        {
          toolCallId,
          result: { error: "שגיאה בלתי צפויה. אנא נסה שוב." },
        },
      ],
    });
  }
}

/**
 * Handle add_to_cart function call
 * Adds item to Order document
 */
async function handleAddToCart(parameters, toolCallId, req, res, restaurant) {
  try {
    if (!restaurant) {
      restaurant = await findRestaurantFromCall(req);
    }
    if (!restaurant) {
      throw new Error("Restaurant not found");
    }

    const callId = getCallId(req);
    const callerPhone = getCallerPhoneNumber(req);

    // Call service function
    const result = await functions.addToCart({
      itemName: parameters.itemName,
      quantity: parameters.quantity,
      callId,
      restaurant,
      callerPhone,
    });

    // Log to WebhookLog for idempotency
    if (toolCallId) {
      await WebhookLog.create({
        toolCallId,
        callId,
        functionName: "add_to_cart",
        parameters,
        result: result.success ? result.data.message : result.error,
        processedAt: new Date(),
      });
    }

    // Format response for Vapi
    if (result.success) {
      return res.json({
        results: [{ toolCallId, result: result.data.message }],
      });
    } else {
      logger.error("addToCart failed", {
        error: result.error,
        errorType: result.errorType,
        parameters,
      });
      return res.json({
        results: [{ toolCallId, result: result.error }],
      });
    }
  } catch (error) {
    logger.error("Unexpected error in handleAddToCart:", error);
    return res.json({
      results: [{ toolCallId, result: "שגיאה בלתי צפויה. אנא נסה שוב." }],
    });
  }
}

/**
 * Handle update_cart function call
 * Updates Order items (or clears cart if empty array)
 */
async function handleUpdateCart(parameters, toolCallId, req, res, restaurant) {
  try {
    if (!restaurant) {
      restaurant = await findRestaurantFromCall(req);
    }
    if (!restaurant) {
      throw new Error("Restaurant not found");
    }

    const callId = getCallId(req);

    // Call service function
    const result = await functions.updateCart({
      items: parameters.items,
      callId,
      restaurant,
    });

    // Log to WebhookLog for idempotency
    if (toolCallId) {
      await WebhookLog.create({
        toolCallId,
        callId,
        functionName: "update_cart",
        parameters,
        result: result.success ? result.data : result.error,
        processedAt: new Date(),
      });
    }

    // Format response for Vapi
    if (result.success) {
      // If cart was cleared, return just the message
      if (result.data.message === "העגלה נוקתה") {
        return res.json({
          results: [{ toolCallId, result: result.data.message }],
        });
      }
      // Otherwise return full summary
      return res.json({
        results: [
          {
            toolCallId,
            result: {
              message: result.data.message,
              items: result.data.summary.items,
              total: result.data.summary.total,
            },
          },
        ],
      });
    } else {
      logger.error("updateCart failed", {
        error: result.error,
        errorType: result.errorType,
        parameters,
      });
      return res.json({
        results: [{ toolCallId, result: result.error }],
      });
    }
  } catch (error) {
    logger.error("Unexpected error in handleUpdateCart:", error);
    return res.json({
      results: [{ toolCallId, result: "שגיאה בלתי צפויה. אנא נסה שוב." }],
    });
  }
}

/**
 * Handle extract_customer_details function call (NEW)
 * Uses GPT-4o-mini to extract customer details from natural language
 */
async function handleExtractCustomerDetails(
  parameters,
  toolCallId,
  req,
  res,
  restaurant
) {
  try {
    // Call service function
    const result = await functions.extractCustomerDetails({
      userMessage: parameters.message,
      currentContext: parameters.currentContext || {},
    });

    // Log to WebhookLog for idempotency
    if (toolCallId) {
      await WebhookLog.create({
        toolCallId,
        functionName: "extract_customer_details",
        parameters,
        result: result.success ? result.data : result.error,
        processedAt: new Date(),
      });
    }

    // Format response for Vapi
    if (result.success) {
      // Return extracted and validated data as JSON string
      return res.json({
        results: [
          {
            toolCallId,
            result: JSON.stringify(result.data),
          },
        ],
      });
    } else {
      logger.error("extractCustomerDetails failed", {
        error: result.error,
        errorType: result.errorType,
        parameters,
      });
      return res.json({
        results: [{ toolCallId, result: result.error }],
      });
    }
  } catch (error) {
    logger.error("Unexpected error in handleExtractCustomerDetails:", error);
    return res.json({
      results: [{ toolCallId, result: "שגיאה בחילוץ פרטים" }],
    });
  }
}

/**
 * Handle redirect_to_human function call
 * DEPRECATED - This is now a built-in Vapi tool (transferCall)
 */
async function handleRedirectToHuman(
  parameters,
  toolCallId,
  req,
  res,
  restaurant
) {
  try {
    // Use restaurant from parameter (attached by middleware)
    // Fallback to finding restaurant if not provided (backward compatibility)
    if (!restaurant) {
      restaurant = await findRestaurantFromCall(req);
    }
    const _restaurant = restaurant;
    if (!restaurant || !restaurant.humanRedirectPhone) {
      return res.json({
        results: [
          {
            toolCallId: toolCallId,
            result: "מצטער, כרגע אין ייצוג אנושי זמין. אנא נסה שוב מאוחר יותר.",
          },
        ],
      });
    }

    // TODO: Implement actual call transfer using Vapi
    // For now, provide phone number
    return res.json({
      results: [
        {
          toolCallId: toolCallId,
          result: `אני מעביר אותך לייצוג אנושי. אנא התקשר למספר: ${restaurant.humanRedirectPhone}. סיבה: ${parameters.reason}`,
        },
      ],
    });
  } catch (error) {
    logger.error("Error redirecting to human:", error);
    return res.json({
      results: [
        {
          toolCallId: toolCallId,
          result: "שגיאה בהעברה. אנא נסה שוב.",
        },
      ],
    });
  }
}

/**
 * Handle get_restaurant_context function call
 */
async function handleGetRestaurantContext(toolCallId, req, res) {
  try {
    const restaurant = await findRestaurantFromCall(req);
    if (!restaurant) {
      throw new Error("Restaurant not found");
    }

    // Build context with strict menu handling instructions
    const context = {
      restaurantName: restaurant.name,
      businessHours: restaurant.businessHours || "לא צוין",
      address: restaurant.address || "לא צוין",
      systemInstructions: restaurant.systemPrompt || getDefaultSystemPrompt(),
      firstMessage: restaurant.firstMessage,
      businessInfo: restaurant.businessInfo,
      policies: {
        delivery: restaurant.settings?.allowDelivery ? "זמין" : "לא זמין",
        pickup: restaurant.settings?.allowPickup ? "זמין" : "לא זמין",
        deliveryFee: restaurant.settings?.deliveryFee || 0,
        minimumOrder: restaurant.settings?.minimumOrder || 0,
      },
    };

    // Format as readable Hebrew string for AI to interpret easily
    const formattedContext = `
שם המסעדה: ${context.restaurantName}

הוראות מערכת:
${context.systemInstructions}

ברכת פתיחה (השתמש במדויק):
"${context.firstMessage}"

מידע עסקי:
${context.businessInfo}

מדיניות הזמנות:
- משלוח: ${context.policies.delivery}
- איסוף עצמי: ${context.policies.pickup}
- דמי משלוח: ${context.policies.deliveryFee}₪
- הזמנה מינימלית: ${context.policies.minimumOrder}₪
    `.trim();

    logger.info(`Sending get_restaurant_context response:`, {
      toolCallId,
      responseLength: formattedContext.length,
      preview: formattedContext.substring(0, 200),
    });

    return res.json({
      results: [
        {
          toolCallId: toolCallId,
          result: formattedContext,
        },
      ],
    });
  } catch (error) {
    logger.error("Error getting restaurant context:", error);
    return res.json({
      results: [
        {
          toolCallId: toolCallId,
          result: `שגיאה בטעינת הגדרות המסעדה: ${error.message}`,
        },
      ],
    });
  }
}

/**
 * Get default system prompt with strict menu handling rules
 */
function getDefaultSystemPrompt() {
  return `אתה סוכן AI עבור מסעדה זו.

חוקים קריטיים:
1. MUST call get_menu() תמיד לפני שמדברים על פריטי תפריט
2. אסור להמציא או לנחש פריטי תפריט - רק תפריטים שחזרו מ-get_menu()
3. אסור להזכיר מחירים שלא אומתו דרך get_menu()
4. אם פריט לא במלאי (inStock: false) - אל תציע אותו
5. תמיד אמת מחירים ושמות פריטים מול נתוני get_menu()

תפקידך:
- עזור ללקוחות להזמין אוכל מהתפריט
- ענה על שאלות על המסעדה
- אסוף פרטי הזמנה מדויקים
- העבר ללקוח אנושי במקרה הצורך

זכור: השתמש רק במידע שחזר מפונקציות get_menu() ו-get_restaurant_context()!`;
}

/**
 * Handle get_menu function call
 */
async function handleGetMenu(toolCallId, req, res) {
  try {
    const restaurant = await findRestaurantFromCall(req);
    if (!restaurant) {
      throw new Error("Restaurant not found");
    }

    // Format menu with stock status
    const menuItems = restaurant.menu.map((item) => ({
      name: item.name,
      price: item.price,
      category: item.category,
      inStock: item.inStock,
    }));

    // Format as readable Hebrew string for AI
    const menuText = menuItems
      .map(
        (item) =>
          `- ${item.name}: ${item.price}₪ (${item.category}) ${
            item.inStock ? "" : "[אזל מהמלאי]"
          }`
      )
      .join("\n");

    const formattedMenu = `
תפריט ${restaurant.name}:

${menuText}

** חשוב: הזכר רק מנות שמופיעות ברשימה זו ושמסומנות כזמינות (ללא [אזל מהמלאי]). אסור להמציא מנות! **
    `.trim();

    logger.info(`Sending get_menu response:`, {
      toolCallId,
      responseLength: formattedMenu.length,
      menuItemsCount: menuItems.length,
      preview: formattedMenu.substring(0, 200),
    });

    return res.json({
      results: [
        {
          toolCallId: toolCallId,
          result: formattedMenu,
        },
      ],
    });
  } catch (error) {
    logger.error("Error getting menu:", error);
    return res.json({
      results: [
        {
          toolCallId: toolCallId,
          result: `שגיאה בקבלת התפריט: ${error.message}`,
        },
      ],
    });
  }
}

/**
 * Handle status updates (call ended, etc.)
 */
async function handleStatusUpdate(req, res) {
  try {
    const { message } = req.body;
    logger.info("Call status update:", { status: message.status });

    // Handle any cleanup or logging needed when call ends
    res.json({ received: true });
  } catch (error) {
    logger.error("Error handling status update:", error);
    res.status(500).json({ error: error.message });
  }
}

/**
 * Find restaurant from call context
 * Uses the called phone number from Vapi webhook
 */
async function findRestaurantFromCall(req) {
  try {
    // Option 1: Restaurant ID in webhook data
    if (req.body.restaurantId) {
      const restaurant = await Restaurant.findById(req.body.restaurantId);
      if (restaurant) {
        logger.info(`Restaurant found by ID: ${restaurant.name}`);
        return restaurant;
      }
    }

    // Option 2: Find by Vapi phone number (the number that was called)
    let vapiPhoneNumber = null;

    // Try multiple locations where Vapi might send the phone number
    if (req.body.phoneNumber && req.body.phoneNumber.number) {
      // Format for tool-calls: req.body.phoneNumber.number
      vapiPhoneNumber = req.body.phoneNumber.number;
    } else if (req.body.call && req.body.call.to) {
      // Format for other webhooks: req.body.call.to
      if (typeof req.body.call.to === "string") {
        vapiPhoneNumber = req.body.call.to;
      } else if (req.body.call.to.number) {
        vapiPhoneNumber = req.body.call.to.number;
      }
    }

    // Log what we received for debugging
    logger.info("Restaurant lookup attempt:", {
      hasPhoneNumber: !!req.body.phoneNumber,
      phoneNumberValue: req.body.phoneNumber,
      hasCall: !!req.body.call,
      extractedPhone: vapiPhoneNumber,
      topLevelKeys: Object.keys(req.body).slice(0, 10), // First 10 keys to avoid huge logs
    });

    if (vapiPhoneNumber) {
      logger.info(
        `Looking up restaurant by Vapi phone number: ${vapiPhoneNumber}`
      );
      const restaurant = await Restaurant.findOne({
        vapiPhoneNumber: vapiPhoneNumber,
      });

      if (restaurant) {
        logger.info(`Restaurant found: ${restaurant.name}`, {
          restaurantId: restaurant._id,
        });
        return restaurant;
      } else {
        logger.warn(
          `No restaurant found with vapiPhoneNumber: ${vapiPhoneNumber}`
        );
      }
    }

    // FALLBACK: For single-restaurant setups, use the only restaurant in DB
    logger.warn(
      "Restaurant identification failed, trying fallback to single restaurant"
    );

    const restaurantCount = await Restaurant.countDocuments();
    logger.info(`Found ${restaurantCount} restaurants in database`);

    if (restaurantCount === 1) {
      const restaurant = await Restaurant.findOne();
      logger.info(
        `Using fallback restaurant (single-tenant mode): ${restaurant.name}`,
        {
          restaurantId: restaurant._id,
        }
      );
      return restaurant;
    } else if (restaurantCount > 1) {
      // If multiple restaurants, use the first one as ultimate fallback
      // This is better than failing completely
      const restaurant = await Restaurant.findOne();
      logger.warn(
        `Multiple restaurants found (${restaurantCount}), using first one as fallback: ${restaurant.name}`,
        {
          restaurantId: restaurant._id,
        }
      );
      return restaurant;
    } else {
      throw new Error(
        "No restaurants found in database. Please run the seed script first."
      );
    }
  } catch (error) {
    logger.error("Error finding restaurant:", error);
    throw error;
  }
}

/**
 * Extract call ID from webhook request
 */
function getCallId(req) {
  // Try different locations where VAPI might send the call ID
  return (
    req.body.call?.id ||
    req.body.message?.call?.id ||
    req.body.message?.callId ||
    req.body.callId ||
    null
  );
}

/**
 * Extract caller's phone number from webhook
 */
function getCallerPhoneNumber(req) {
  // Try different locations where VAPI might send the caller's phone number
  // Try top-level call object
  if (req.body.call?.from?.number) {
    return req.body.call.from.number;
  }
  if (req.body.call?.from && typeof req.body.call.from === "string") {
    return req.body.call.from;
  }
  // Try message.call object
  if (req.body.message?.call?.from?.number) {
    return req.body.message.call.from.number;
  }
  if (
    req.body.message?.call?.from &&
    typeof req.body.message.call.from === "string"
  ) {
    return req.body.message.call.from;
  }
  // Try message.call.customer.number
  if (req.body.message?.call?.customer?.number) {
    return req.body.message.call.customer.number;
  }
  return null;
}

/**
 * Get or create Order for call (only creates if doesn't exist)
 * Uses atomic findOneAndUpdate with upsert to prevent race conditions
 * Used by search_menu on first call to create Order document
 */
async function getOrCreateOrderForCall(callId, restaurant, phoneNumber) {
  if (!callId) {
    throw new Error("Call ID required");
  }

  // Atomic operation: find existing order or create new one
  // Uses $setOnInsert to only set values if creating a new document
  const order = await Order.findOneAndUpdate(
    { callId, status: "in_progress" },
    {
      $setOnInsert: {
        restaurantId: restaurant._id,
        phoneNumber: phoneNumber ? sanitizePhoneNumber(phoneNumber) : null,
        status: "in_progress",
        items: [],
        total: 0,
        createdAt: new Date(),
      },
    },
    {
      upsert: true, // Create if doesn't exist
      new: true, // Return the document after update
      setDefaultsOnInsert: true, // Apply schema defaults on insert
    }
  );

  // Log only if this was a newly created order (has no updatedAt yet or matches createdAt)
  if (order.createdAt.getTime() === order.updatedAt.getTime()) {
    logger.info("Created new Order for call", {
      callId,
      orderId: order._id,
      restaurantId: restaurant._id,
    });
  }

  return order;
}

/**
 * Atomically recalculate and update order total
 * Prevents race conditions by reading current state and updating with version check
 */
async function recalculateOrderTotal(callId) {
  const order = await Order.findOne({ callId, status: "in_progress" });

  if (!order) {
    throw new Error("Order not found");
  }

  const total = order.items.reduce(
    (sum, item) => sum + item.price * item.quantity,
    0
  );

  // Update with version check for optimistic locking
  const updatedOrder = await Order.findOneAndUpdate(
    { callId, status: "in_progress", __v: order.__v },
    { $set: { total } },
    { new: true }
  );

  if (!updatedOrder) {
    // Version mismatch - retry once
    return recalculateOrderTotal(callId);
  }

  return updatedOrder;
}

module.exports = router;
