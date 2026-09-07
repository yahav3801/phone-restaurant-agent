const express = require("express");
const router = express.Router();
const { v4: uuidv4 } = require("uuid");
const OpenAI = require("openai");
const logger = require("../utils/logger");
const langfuseClient = require("../utils/langfuse");
const sessionManager = require("../services/sessionManager");
const stateMachine = require("../services/stateMachine");
const intentClassifier = require("../services/intentClassifier");
const ragSearch = require("../services/ragSearch");
const promptBuilder = require("../services/promptBuilder");
const functions = require("../services/functions");

// Initialize OpenAI client (points to LiteLLM proxy)
const openai = new OpenAI({
  apiKey: "anything", // LiteLLM doesn't validate this, uses config file
  baseURL: process.env.LITELLM_URL || "http://localhost:4000",
});

/**
 * Helper: Summarize earlier conversation context for very long sessions
 * Used when history exceeds HISTORY_WINDOW to preserve critical details
 */
function summarizeEarlierContext(messages, session) {
  const parts = [];

  // Add customer details if available (using session.context structure)
  if (session.context.customerName) {
    parts.push(`שם: ${session.context.customerName}`);
  }
  if (session.context.phoneNumber) {
    parts.push(`טלפון: ${session.context.phoneNumber}`);
  }
  if (session.context.deliveryAddress) {
    parts.push(`כתובת: ${session.context.deliveryAddress}`);
  }
  if (session.context.deliveryType) {
    parts.push(`אופן קבלה: ${session.context.deliveryType}`);
  }

  // Add cart summary if items exist
  if (session.context.cart && session.context.cart.length > 0) {
    const items = session.context.cart
      .map((item) => `${item.name} (${item.price} ש״ח)`)
      .join(", ");
    parts.push(`פריטים בעגלה: ${items}`);
  }

  return parts.join(" | ");
}

/**
 * Fix digit-by-digit number formatting in text
 * Converts "4. 2. 6. 5. 6." → "426 שקלים" or "4 2 6 שקלים" → "426 שקלים"
 *
 * @param {string} text - Text that may contain digit-by-digit numbers
 * @returns {string} Fixed text with proper number formatting
 */
function fixDigitByDigitNumbers(text) {
  // Pattern: sequences of digits separated by spaces, dots, or followed by "שקלים"
  // Example: "4. 2. 6. שקלים" or "4 2 6 שקלים" or "4. 2. 6. 5. 6."

  // Match patterns like "4. 2. 6." or "4 2 6" followed by optional "שקלים"
  return text.replace(
    /(\d+)[\s\.]+(\d+)[\s\.]+(\d+)(?:[\s\.]+(\d+))?(?:[\s\.]+(\d+))?(?:\s*שקלים)?/g,
    (match, d1, d2, d3, d4, d5) => {
      // Reconstruct the full number
      let fullNumber = d1 + d2 + d3;
      if (d4) fullNumber += d4;
      if (d5) fullNumber += d5;

      // Check if this is followed by "שקלים" in the original text
      const afterMatch = text.substring(text.indexOf(match) + match.length);
      const hasShekels =
        afterMatch.trim().startsWith("שקלים") || match.includes("שקלים");

      return `${fullNumber}${hasShekels ? " שקלים" : ""}`;
    }
  );
}

/**
 * Ensure "שקלים" appears after all prices
 * Fixes cases like "ב 85" → "ב 85 שקלים"
 *
 * @param {string} text - Text that may be missing "שקלים"
 * @returns {string} Text with "שקלים" added where needed
 */
function ensureShekelsAfterPrices(text) {
  // Pattern: "ב X" or "X שקלים" where X is a number
  // Add "שקלים" if missing after price numbers

  // Fix "ב X" (without שקלים) → "ב X שקלים"
  text = text.replace(/ב\s+(\d+)(?!\s*שקלים)(?=\s|$|\.|,)/g, "ב $1 שקלים");

  // Fix standalone numbers that look like prices (3+ digits) → add שקלים
  text = text.replace(/(\d{3,})(?!\s*שקלים)(?=\s|$|\.|,)/g, "$1 שקלים");

  return text;
}

/**
 * Extract phone number from digit-by-digit text (e.g., "9 7 2 5 0 6 7 7" → "972-50-67677")
 * Handles cases where agent reads phone number digit-by-digit
 */
function extractPhoneFromDigitByDigit(text) {
  // Pattern: sequence of digits separated by spaces, dots, or question marks
  // Example: "9 7? 2 5. 0 6 7 7." or "9 7 2 5 0 6 7 7"
  const digitSequence = text.match(/(?:[\d\s?\.]+){9,}/);
  if (!digitSequence) return null;

  // Extract all digits
  const digits = digitSequence[0].replace(/[^\d]/g, "");

  // Must have 9-10 digits for Israeli phone
  if (digits.length < 9 || digits.length > 10) return null;

  // Format as Israeli phone: 05X-XXXXXXX or 0X-XXXXXXX
  if (digits.length === 10 && digits.startsWith("0")) {
    // Format: 05X-XXXXXXX
    return `${digits.slice(0, 3)}-${digits.slice(3)}`;
  } else if (digits.length === 9) {
    // Format: 0X-XXXXXXX
    return `${digits.slice(0, 2)}-${digits.slice(2)}`;
  } else if (digits.length === 10 && digits.startsWith("972")) {
    // International format without +: 972501234567
    return `+${digits}`;
  }

  return null;
}

/**
 * Helper: Extract customer details from conversation text
 * Scans user and assistant messages for name, phone, address, delivery method
 */
function extractCustomerDetailsFromText(assistantText, userText) {
  const details = {};

  // Extract delivery method
  if (userText.includes("משלוח") || assistantText.includes("משלוח")) {
    details.deliveryType = "delivery";
  } else if (userText.includes("איסוף") || assistantText.includes("איסוף")) {
    details.deliveryType = "pickup";
  }

  // Extract address (Hebrew address patterns: רחוב X מספר Y or "בורוכוב 3 קריית אתא")
  // Try multiple patterns
  let addressMatch = userText.match(
    /(?:רחוב\s+)?([א-ת\s]+)\s+(\d+)(?:\s+[א-ת\s]+)?/
  );
  if (addressMatch) {
    details.deliveryAddress = addressMatch[0].trim();
  } else {
    // Try pattern like "בורוכוב 3 קריית אתא" or "בורוכוב שלוש קריית אתא"
    // Hebrew number to digit mapping
    const hebrewToDigit = {
      אחד: "1",
      אחת: "1",
      שני: "2",
      שניים: "2",
      שתי: "2",
      שתיים: "2",
      שלוש: "3",
      שלושה: "3",
      ארבע: "4",
      ארבעה: "4",
      חמש: "5",
      חמישה: "5",
      שש: "6",
      שישה: "6",
      שבע: "7",
      שבעה: "7",
      שמונה: "8",
      תשע: "9",
      תשעה: "9",
      עשר: "10",
      עשרה: "10",
    };

    // Pattern: street name + number (Hebrew or digit) + optional city
    addressMatch = userText.match(
      /([א-ת]+(?:\s+[א-ת]+)?)\s+(?:מספר\s+)?(\d+|אחד|אחת|שני|שניים|שתי|שתיים|שלוש|שלושה|ארבע|ארבעה|חמש|חמישה|שש|שישה|שבע|שבעה|שמונה|תשע|תשעה|עשר|עשרה)(?:\s+([א-ת\s]+))?/
    );
    if (addressMatch) {
      const streetName = addressMatch[1].trim();
      const streetNumber = hebrewToDigit[addressMatch[2]] || addressMatch[2];
      const cityPart = addressMatch[3] ? addressMatch[3].trim() : "";
      details.deliveryAddress = `${streetName} ${streetNumber}${
        cityPart ? " " + cityPart : ""
      }`.trim();
    }
  }

  // Extract phone number - try multiple patterns
  // 1. Standard Israeli format: 05X-XXXXXXX or 0X-XXXXXXX
  let phoneMatch = userText.match(/0\d{1,2}[-\s]?\d{3}[-\s]?\d{4}/);
  if (phoneMatch) {
    details.phoneNumber = phoneMatch[0].replace(/\s/g, "-");
  } else {
    // 2. Try digit-by-digit extraction (from assistant reading it)
    const digitByDigit = extractPhoneFromDigitByDigit(
      assistantText + " " + userText
    );
    if (digitByDigit) {
      details.phoneNumber = digitByDigit;
    } else {
      // 3. Try 10-digit sequence
      const tenDigits = userText.match(/\b\d{10}\b/);
      if (tenDigits && tenDigits[0].startsWith("0")) {
        details.phoneNumber = tenDigits[0];
      }
    }
  }

  // Extract name (after "שמי" or "קוראים לי" or "יהב בן הרוש" format)
  // First try "X בן Y" or "X בת Y" format (Hebrew full name like "יהב בן הרוש")
  const fullNameMatch = userText.match(/([א-ת]+)\s+(בן|בת)\s+([א-ת]+)/);
  if (fullNameMatch) {
    details.customerName = `${fullNameMatch[1]} ${fullNameMatch[2]} ${fullNameMatch[3]}`;
  } else {
    // Try simple name after keywords
    const nameMatch = userText.match(
      /(?:שמי|קוראים לי|השם שלי|השם)\s+([א-ת\s]+?)(?:\s|$|\.|,)/
    );
    if (nameMatch) {
      details.customerName = nameMatch[1].trim();
    }
  }

  return details;
}

/**
 * POST /v1/chat/completions
 * OpenAI-compatible endpoint for VAPI custom LLM integration
 *
 * VAPI Configuration:
 * - Set "Custom LLM" in VAPI dashboard
 * - URL: https://your-domain.com/v1/chat/completions
 * - No authentication required (can add later)
 *
 * Request format (OpenAI-compatible):
 * {
 *   "messages": [
 *     { "role": "system", "content": "You are a restaurant assistant..." },
 *     { "role": "user", "content": "I want to order pizza" },
 *     { "role": "assistant", "content": "Sure! What size?" },
 *     { "role": "user", "content": "Large" }
 *   ],
 *   "model": "gpt-4o-mini",
 *   "temperature": 0.7,
 *   "max_tokens": 500
 * }
 *
 * Response format (OpenAI-compatible):
 * {
 *   "id": "chatcmpl-123",
 *   "object": "chat.completion",
 *   "created": 1234567890,
 *   "model": "gpt-4o-mini",
 *   "choices": [
 *     {
 *       "index": 0,
 *       "message": {
 *         "role": "assistant",
 *         "content": "Great! I'll add a large pizza to your order."
 *       },
 *       "finish_reason": "stop"
 *     }
 *   ],
 *   "usage": {
 *     "prompt_tokens": 50,
 *     "completion_tokens": 20,
 *     "total_tokens": 70
 *   }
 * }
 */
router.post("/", async (req, res) => {
  const requestStartTime = Date.now();
  let conversationId;
  let userText;

  // 🔍 DEBUG: Log full request details
  console.log("\n" + "=".repeat(80));
  console.log("🔵 INCOMING REQUEST TO /v1/chat/completions");
  console.log("=".repeat(80));
  console.log("Timestamp:", new Date().toISOString());
  console.log("User-Agent:", req.headers["user-agent"]);
  console.log("Headers:", JSON.stringify(req.headers, null, 2));
  console.log("Body Messages Count:", req.body.messages?.length || 0);
  console.log("Full Body:", JSON.stringify(req.body, null, 2));
  console.log("=".repeat(80) + "\n");

  try {
    // STEP 1: Extract conversation ID
    conversationId = extractConversationId(req);

    // STEP 2: Extract user message
    const messages = req.body.messages || [];
    const userMessage = messages.filter((m) => m.role === "user").pop();

    if (!userMessage) {
      return res.status(400).json({
        error: {
          message: "No user message found in request",
          type: "invalid_request",
        },
      });
    }

    userText = userMessage.content;

    // Get restaurant context (needed early for session creation)
    const restaurant = await findRestaurantForRequest(req);
    if (!restaurant) {
      return res.status(404).json({
        error: { message: "Restaurant not found", type: "invalid_request" },
      });
    }

    logger.info("Chat completion request received", {
      conversationId,
      messageCount: messages.length,
      restaurantId: restaurant._id,
    });

    // Log Vapi-specific requests for debugging
    if (
      req.headers["user-agent"]?.includes("Vapi") ||
      req.headers["x-vapi-call-id"]
    ) {
      logger.info("Vapi request received", {
        conversationId,
        vapiCallId: req.headers["x-vapi-call-id"],
        userAgent: req.headers["user-agent"],
        messageCount: messages.length,
      });
    }

    // STEP 3: Load or create session
    const sessionStartTime = Date.now();
    let session = await sessionManager.getSession(conversationId);
    const isNewSession = !session;

    // Detect and handle Vapi's auto first message
    // Vapi sends an auto greeting when call starts, and sometimes sends it as a user message
    // We should detect this and respond with our greeting instead of processing it
    const isFirstTurn = isNewSession && messages.length <= 2; // First turn usually has 1-2 messages
    const looksLikeAutoGreeting =
      isFirstTurn &&
      // Very short messages that are likely auto-generated (but not actual orders)
      ((userText.trim().length < 10 &&
        !userText.includes("המבורגר") &&
        !userText.includes("פיצה") &&
        !userText.includes("מנה") &&
        !userText.includes("רוצה") &&
        !userText.includes("אפשר")) ||
        // Just speaker tags with minimal content
        (userText.includes("$<Speaker") &&
          userText.replace(/\$<Speaker[^>]*>/g, "").trim().length < 5));

    if (looksLikeAutoGreeting) {
      logger.info(
        "Detected Vapi auto first message - responding with greeting",
        {
          conversationId,
          message: userText,
          isNewSession,
        }
      );

      // Initialize session if needed
      if (isNewSession) {
        session = await sessionManager.createSession({
          conversationId,
          restaurantId: restaurant._id,
          callId: req.body.call?.id || conversationId,
          phoneNumber: req.body.call?.customer?.number,
        });
      }

      // Return a proper greeting response without full processing
      const greetingResponse =
        "שלום! ברוכים הבאים למסעדת הבוקרים. איך אוכל לעזור?";

      return res.json({
        id: `chatcmpl-${conversationId.slice(0, 8)}`,
        object: "chat.completion",
        created: Math.floor(Date.now() / 1000),
        model: "gemini-flash-latest",
        choices: [
          {
            index: 0,
            message: {
              role: "assistant",
              content: greetingResponse,
            },
            finish_reason: "stop",
          },
        ],
        usage: {
          prompt_tokens: 0,
          completion_tokens: 0,
          total_tokens: 0,
        },
      });
    }

    // Normal flow: create session if needed
    if (!session) {
      session = await sessionManager.createSession({
        conversationId,
        restaurantId: restaurant._id,
        callId: req.body.call?.id || conversationId,
        phoneNumber: req.body.call?.customer?.number,
      });
      logger.info("New session created", {
        conversationId,
        restaurantId: restaurant._id,
      });
    } else {
      logger.debug("Existing session loaded", {
        conversationId,
        currentState: session.state,
      });
    }

    // CRITICAL FIX: Always load cart from MongoDB (source of truth)
    // IMPORTANT: Only sync cart, NOT customer details!
    // Customer details exist in session BEFORE being saved to Order (during collection phase)
    const Order = require("../models/Order");
    const currentOrder = await Order.findOne({
      callId: conversationId,
      status: "in_progress",
    });

    if (currentOrder) {
      // Sync ONLY cart - MongoDB is authoritative for cart
      session.context.cart = currentOrder.items || [];

      logger.info("Cart synchronized from MongoDB Order", {
        conversationId,
        cartItems: currentOrder.items?.length || 0,
        total: currentOrder.total,
      });
    }

    // Store caller number from call metadata for proactive suggestion
    if (req.body.call?.customer?.number && !session.context.callerNumber) {
      session.context.callerNumber = req.body.call.customer.number;

      logger.debug("Caller number extracted from call metadata", {
        conversationId,
        callerNumber: session.context.callerNumber,
      });
    }

    // STEP 4: Optimized processing (Intent first, then conditional RAG)
    const parallelStartTime = Date.now();

    // Intent classification is now fast (keyword-based), so run it first
    const intentStartTime = Date.now();
    const intentResult = await intentClassifier.classify(
      userText,
      session.state
    );
    const intentDuration = Date.now() - intentStartTime;

    const intent = intentResult.intent;
    const confidence = intentResult.confidence;

    // RAG is only needed for specific intents - run conditionally
    const RAG_REQUIRED_INTENTS = ["order_taking", "general_info"];
    let ragResults = [];
    let ragDuration = 0;

    // Quick check: does message contain menu-related keywords?
    const hasMenuKeywords =
      /\b(פיצה|המבורגר|בירה|קולה|סטייק|סלט|מנה|תפריט|יש לכם|כמה עולה|מה המחיר)\b/i.test(
        userText
      );

    // Run RAG only if intent requires it OR message suggests menu query
    if (RAG_REQUIRED_INTENTS.includes(intent) || hasMenuKeywords) {
      const ragStartTime = Date.now();
      try {
        ragResults = await ragSearch.search(userText, restaurant._id, {
          limit: 7,
        });
        ragDuration = Date.now() - ragStartTime;
      } catch (err) {
        logger.warn("RAG search failed, continuing without it", {
          error: err.message,
        });
        ragResults = [];
      }
    }

    const parallelDuration = Date.now() - parallelStartTime;

    logger.info("Processing complete (optimized)", {
      intent,
      confidence,
      intentDuration,
      ragDuration,
      ragSkipped: !RAG_REQUIRED_INTENTS.includes(intent) && !hasMenuKeywords,
      ragResultCount: ragResults.length,
      parallelDuration,
    });

    // Check for transfer to human request
    const transferKeywords = [
      "מענה אנושי",
      "נציג אנושי",
      "בן אדם",
      "תעביר אותי",
    ];
    const wantsTransfer = transferKeywords.some((keyword) =>
      userText.includes(keyword)
    );

    if (wantsTransfer) {
      const transferNumber =
        restaurant.humanRedirectPhone || restaurant.phoneNumber;

      logger.info("Transfer to human requested", {
        conversationId,
        transferNumber: transferNumber ? "available" : "not configured",
      });

      // Return transfer response
      const transferResponse = {
        id: `chatcmpl-${conversationId.slice(0, 8)}`,
        object: "chat.completion",
        created: Math.floor(Date.now() / 1000),
        model: "gemini-flash-latest",
        choices: [
          {
            index: 0,
            message: {
              role: "assistant",
              content: transferNumber
                ? "רגע אחד, אני מעביר אותך לנציג אנושי..."
                : "סליחה, אין כרגע נציג אנושי זמין. אוכל לעזור לך בעצמי?",
            },
            finish_reason: "stop",
          },
        ],
        usage: {
          prompt_tokens: 0,
          completion_tokens: 0,
          total_tokens: 0,
        },
      };

      return res.json(transferResponse);
    }

    // STEP 5: State transition
    const transitionStartTime = Date.now();

    let newState = stateMachine.transitionState(
      session.state,
      intent,
      session.context
    );
    const functionsToCall = stateMachine.getFunctionsToExecute(
      session.state,
      intent
    );

    // Validate customer details before transitioning to CONFIRMING_ORDER
    if (newState === "CONFIRMING_ORDER") {
      const missing = [];

      if (!session.context.customerName) missing.push("name");
      if (!session.context.phoneNumber) missing.push("phoneNumber");

      // Address required only for delivery
      if (
        session.context.deliveryType === "delivery" &&
        !session.context.deliveryAddress
      ) {
        missing.push("address");
      }

      if (missing.length > 0) {
        logger.warn(
          "Missing customer details before confirmation - preventing transition",
          {
            conversationId,
            missing,
            currentState: session.state,
            attemptedState: newState,
          }
        );

        // Don't transition - stay in current state
        newState = session.state;
      }
    }

    // Console log for state transitions
    if (newState !== session.state) {
      console.log(`\n${"=".repeat(60)}`);
      console.log(`🔄 STATE TRANSITION`);
      console.log(`${"=".repeat(60)}`);
      console.log(`Conversation: ${conversationId}`);
      console.log(`Previous State: ${session.state}`);
      console.log(`New State: ${newState}`);
      console.log(
        `Intent: ${intent} (confidence: ${(confidence * 100).toFixed(1)}%)`
      );
      console.log(
        `Functions to Execute: ${
          functionsToCall.length > 0 ? functionsToCall.join(", ") : "none"
        }`
      );
      console.log(`${"=".repeat(60)}\n`);
    }

    logger.debug("State transition complete", {
      previousState: session.state,
      newState,
      intent,
      functionsToCall,
      duration: Date.now() - transitionStartTime,
    });

    // STEP 6: Execute functions (if any)
    const functionStartTime = Date.now();
    let functionResults = null;

    // Prepare context update (used in both streaming and non-streaming)
    let updatedContext = { ...session.context };

    // Function registry: map snake_case names to service functions
    const functionRegistry = {
      add_to_cart: functions.addMultipleItemsToCart, // Multi-item parsing enabled
      update_cart: functions.updateCart,
      get_cart_summary: functions.getCartSummary,
      place_order: functions.placeOrder,
      extract_customer_details: functions.extractCustomerDetails,
      search_menu: functions.searchMenu,
    };

    if (functionsToCall.length > 0) {
      const results = [];

      for (const fnName of functionsToCall) {
        const fn = functionRegistry[fnName];

        if (!fn) {
          logger.error("Function not found in registry", {
            functionName: fnName,
          });
          continue;
        }

        try {
          const funcStartTime = Date.now();
          let params = {};

          if (fnName === "add_to_cart") {
            params = {
              itemName: userText,
              quantity: 1,
              callId: conversationId,
              restaurant,
              callerPhone: session.context.phoneNumber,
            };
          } else if (fnName === "get_cart_summary") {
            params = {
              callId: conversationId,
              restaurant,
            };
          } else if (fnName === "extract_customer_details") {
            params = {
              userMessage: userText,
              currentContext: session.context,
            };
          } else if (fnName === "search_menu") {
            params = {
              query: userText,
              restaurantId: restaurant._id,
            };
          } else if (fnName === "place_order") {
            params = {
              callId: conversationId,
              restaurant,
              customerName: session.context.customerName,
              phoneNumber: session.context.phoneNumber,
              paymentType: session.context.deliveryType,
              deliveryAddress: session.context.deliveryAddress,
            };
          }

          const result = await fn(params);
          results.push({ function: fnName, result });

          logger.info("Function executed", {
            functionName: fnName,
            success: result.success,
            duration: Date.now() - funcStartTime,
          });
        } catch (error) {
          logger.error("Function execution failed", {
            functionName: fnName,
            error: error.message,
          });
          results.push({
            function: fnName,
            result: { success: false, error: error.message },
          });
        }
      }

      functionResults = results;

      // Update context with extracted customer details
      if (functionResults) {
        const extractResult = functionResults.find(
          (r) => r.function === "extract_customer_details"
        );
        if (extractResult && extractResult.result.success) {
          const validated = extractResult.result.data.validated;
          updatedContext = {
            ...updatedContext,
            ...validated,
          };
        }

        // Update cart when add_to_cart is called
        const cartResult = functionResults.find(
          (r) => r.function === "add_to_cart"
        );
        if (
          cartResult &&
          cartResult.result.success &&
          cartResult.result.data.cart
        ) {
          updatedContext.cart = cartResult.result.data.cart;
          logger.debug("Cart updated in context", {
            conversationId,
            cartItems: cartResult.result.data.cart.length,
          });
        }

        // CHECK: If function has a direct message, skip LLM and use it
        const functionWithMessage = functionResults.find(
          (r) => r.result.success && r.result.data?.message
        );

        if (functionWithMessage) {
          const directMessage = functionWithMessage.result.data.message;

          logger.info("Using direct function message, skipping LLM", {
            conversationId,
            function: functionWithMessage.function,
            message: directMessage,
          });

          // Update session with function message
          const updatedHistory = [
            ...session.history,
            { role: "user", content: userText, timestamp: new Date() },
            {
              role: "assistant",
              content: directMessage,
              timestamp: new Date(),
            },
          ];

          await sessionManager.updateSession(conversationId, {
            state: newState,
            history: updatedHistory.slice(-20),
            context: updatedContext,
            lastIntent: intent,
          });

          // Return response immediately without LLM
          return res.json({
            id: `chatcmpl-${conversationId.slice(0, 8)}`,
            object: "chat.completion",
            created: Math.floor(Date.now() / 1000),
            model: "server-authoritative",
            choices: [
              {
                index: 0,
                message: {
                  role: "assistant",
                  content: directMessage,
                },
                finish_reason: "stop",
              },
            ],
            usage: {
              prompt_tokens: 0,
              completion_tokens: 0,
              total_tokens: 0,
            },
          });
        }
      }
    }

    // AUTO-EXTRACTION FIX: Proactively extract customer details every turn
    // This prevents the agent from repeatedly asking for information user already gave
    // Only run in states where customer details are relevant to avoid unnecessary LLM calls
    const detailRelevantStates = [
      "COLLECTING_ORDER",
      "COLLECTING_DETAILS",
      "CONFIRMING_ORDER",
    ];

    if (detailRelevantStates.includes(newState)) {
      try {
        logger.debug("Running automatic customer detail extraction", {
          conversationId,
          state: newState,
          userMessage: userText.substring(0, 100), // Log first 100 chars for debugging
        });

        // Use the robust LLM-based extraction function from functions.js
        const extractionResult = await functions.extractCustomerDetails({
          userMessage: userText,
          currentContext: updatedContext,
        });

        if (
          extractionResult.success &&
          extractionResult.data &&
          extractionResult.data.validated
        ) {
          const extractedFields = extractionResult.data.validated;
          const updatedFields = [];

          // Only update fields that were actually extracted (non-null/empty)
          if (extractedFields.customerName && !updatedContext.customerName) {
            updatedContext.customerName = extractedFields.customerName;
            updatedFields.push("customerName");
          }

          if (extractedFields.phoneNumber && !updatedContext.phoneNumber) {
            updatedContext.phoneNumber = extractedFields.phoneNumber;
            updatedFields.push("phoneNumber");
          }

          if (
            extractedFields.deliveryAddress &&
            !updatedContext.deliveryAddress
          ) {
            updatedContext.deliveryAddress = extractedFields.deliveryAddress;
            updatedFields.push("deliveryAddress");
          }

          if (extractedFields.deliveryType && !updatedContext.deliveryType) {
            updatedContext.deliveryType = extractedFields.deliveryType;
            updatedFields.push("deliveryType");
          }

          if (updatedFields.length > 0) {
            logger.info("Auto-extracted customer details from user message", {
              conversationId,
              state: newState,
              extractedFields: updatedFields,
              values: updatedFields.reduce((obj, field) => {
                obj[field] = updatedContext[field];
                return obj;
              }, {}),
            });
          } else {
            logger.debug("Auto-extraction ran but no new fields found", {
              conversationId,
              state: newState,
            });
          }
        }
      } catch (extractionError) {
        // Log error but do not fail the request - extraction is a nice-to-have enhancement
        logger.error("Automatic customer detail extraction failed", {
          conversationId,
          error: extractionError.message,
          state: newState,
          continueWithoutExtraction: true,
        });
      }
    }

    // Check for caller number confirmation (smart phone number feature)
    if (detailRelevantStates.includes(newState)) {
      // Check if user is confirming to use caller number
      const confirmationKeywords = [
        "כן",
        "בסדר",
        "תשתמש",
        "נכון",
        "אוקיי",
        "yes",
        "ok",
        "אפשר",
      ];
      const isConfirmation = confirmationKeywords.some((kw) =>
        userText.toLowerCase().includes(kw.toLowerCase())
      );

      // Also check if assistant just asked about using caller number
      const assistantJustAskedAboutPhone =
        session.history.length > 0 &&
        session.history[session.history.length - 1].role === "assistant" &&
        (session.history[session.history.length - 1].content.includes(
          "האם אפשר להשתמש"
        ) ||
          session.history[session.history.length - 1].content.includes(
            "במספר ממנו"
          ));

      if (
        isConfirmation &&
        updatedContext.callerNumber &&
        !updatedContext.phoneNumber &&
        (userText.length < 20 || assistantJustAskedAboutPhone)
      ) {
        // Short message = likely confirmation, or assistant just asked about phone

        // Format caller number properly (remove +972 prefix if present, add back with proper format)
        let formattedPhone = updatedContext.callerNumber;
        if (formattedPhone.startsWith("+972")) {
          // Convert +972501234567 to 050-1234567
          const digits = formattedPhone.substring(4);
          if (digits.length === 9) {
            formattedPhone = `0${digits.slice(0, 2)}-${digits.slice(2)}`;
          }
        }

        updatedContext.phoneNumber = formattedPhone;

        logger.info("Auto-confirmed caller number usage", {
          conversationId,
          phoneNumber: updatedContext.phoneNumber,
          callerNumber: updatedContext.callerNumber,
          confirmedBy: userText,
          assistantJustAsked: assistantJustAskedAboutPhone,
        });
      }

      // Fallback: Try to extract phone from conversation if still missing
      if (!updatedContext.phoneNumber) {
        const extractedDetails = extractCustomerDetailsFromText(
          session.history.length > 0
            ? session.history[session.history.length - 1].content
            : "",
          userText
        );

        if (extractedDetails.phoneNumber) {
          updatedContext.phoneNumber = extractedDetails.phoneNumber;
          logger.info("Extracted phone number from conversation", {
            conversationId,
            phoneNumber: updatedContext.phoneNumber,
            source: "conversation_extraction",
          });
        }
      }
    }

    // STEP 7: Build dynamic prompt
    const promptStartTime = Date.now();

    // Debug: Log context state before building prompt
    logger.debug("Building prompt with context", {
      conversationId,
      state: newState,
      cartItems: updatedContext.cart?.length || 0,
      cartDetails:
        updatedContext.cart?.map((i) => `${i.name} x${i.quantity}`) || [],
      hasCustomerName: !!updatedContext.customerName,
      hasPhoneNumber: !!updatedContext.phoneNumber,
      hasDeliveryAddress: !!updatedContext.deliveryAddress,
    });

    const systemPrompt = promptBuilder.buildPrompt({
      state: newState,
      intent,
      ragResults: ragResults,
      functionResults,
      context: updatedContext, // Use updatedContext instead of session.context
      caller_number: req.body.call?.customer?.number || "",
    });

    logger.debug("Prompt built", {
      promptLength: systemPrompt.length,
      state: newState,
      intent,
      duration: Date.now() - promptStartTime,
    });

    // STEP 8: Call LLM with optional streaming
    const llmStartTime = Date.now();
    const shouldStream = req.body.stream === true;

    // HISTORY MANAGEMENT: Send last 20 messages for better context retention
    const HISTORY_WINDOW = 20; // Last 20 messages (~10 turns)
    const recentHistory = session.history.slice(-HISTORY_WINDOW);

    // If conversation is longer, add summary of earlier context
    let contextMessages = [...recentHistory];
    if (session.history.length > HISTORY_WINDOW) {
      const earlierMessages = session.history.slice(0, -HISTORY_WINDOW);
      const summary = summarizeEarlierContext(earlierMessages, session);

      if (summary) {
        contextMessages.unshift({
          role: "system",
          content: `סיכום השיחה הקודמת: ${summary}`,
        });
      }
    }

    logger.debug("Building LLM request", {
      conversationId,
      totalHistoryLength: session.history.length,
      sentHistoryLength: contextMessages.length,
      state: newState,
      includedSummary: session.history.length > HISTORY_WINDOW,
    });

    const stream = await openai.chat.completions.create({
      model: "gemini-flash-latest", // LiteLLM model name from config
      messages: [
        { role: "system", content: systemPrompt },
        ...contextMessages,
        { role: "user", content: userText },
      ],
      temperature: 0.3, // Balanced: natural responses but still follows rules (was 0 - too robotic)
      max_tokens: 300, // Increased from 250 to allow more complete, intelligent responses
      stream: true,
      user: conversationId,
    });

    // If Vapi requests streaming, send SSE format
    if (shouldStream) {
      console.log("🔴 STREAMING MODE: Sending SSE response to Vapi");

      // Set SSE headers
      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");
      res.setHeader("X-Accel-Buffering", "no"); // Prevent nginx buffering
      res.flushHeaders(); // Immediately send headers to client

      let assistantMessage = "";
      let chunkCount = 0;

      try {
        for await (const chunk of stream) {
          let content = chunk.choices[0]?.delta?.content || "";
          if (content) {
            // CRITICAL FIX: Remove hyphens before numbers to prevent TTS saying "minus"
            // Example: "ב-200" becomes "ב 200" so TTS says "b'200" not "minus 200"
            content = content.replace(/ב-(\d)/g, "ב $1"); // Add space after ב before numbers
            content = content.replace(/-(\d)/g, " $1"); // Replace any hyphen-number with space-number

            assistantMessage += content;

            // Optimized: Send chunks as they come from Gemini (larger chunks = less overhead)
            // Only split into smaller pieces if chunk is very large (>100 chars)
            if (content.length > 100) {
              // Split large chunks by sentences/periods for better TTS flow
              const sentences = content.split(/([.!?]\s+)/);
              for (let i = 0; i < sentences.length; i += 2) {
                const sentence = sentences[i] + (sentences[i + 1] || "");
                if (!sentence.trim()) continue;

                chunkCount++;
                const sseData = {
                  id: `chatcmpl-${conversationId.slice(0, 8)}`,
                  object: "chat.completion.chunk",
                  created: Math.floor(Date.now() / 1000),
                  model: "gemini-flash-latest",
                  choices: [
                    {
                      index: 0,
                      delta: { content: sentence },
                      finish_reason: null,
                    },
                  ],
                };
                res.write(`data: ${JSON.stringify(sseData)}\n\n`);

                // Flush immediately - no artificial delay (let Vapi handle buffering)
                if (res.flush) res.flush();
              }
            } else {
              // Small chunks: send as-is
              chunkCount++;
              const sseData = {
                id: `chatcmpl-${conversationId.slice(0, 8)}`,
                object: "chat.completion.chunk",
                created: Math.floor(Date.now() / 1000),
                model: "gemini-flash-latest",
                choices: [
                  {
                    index: 0,
                    delta: { content },
                    finish_reason: null,
                  },
                ],
              };
              res.write(`data: ${JSON.stringify(sseData)}\n\n`);

              // Flush immediately - no artificial delay
              if (res.flush) res.flush();
            }
          }
        }

        console.log(
          `✅ Total chunks sent: ${chunkCount}, Total message length: ${assistantMessage.length}`
        );

        // Apply post-processing fixes to the complete message
        const originalStreamMessage = assistantMessage;
        assistantMessage = fixDigitByDigitNumbers(assistantMessage);
        assistantMessage = ensureShekelsAfterPrices(assistantMessage);

        if (assistantMessage !== originalStreamMessage) {
          logger.info("Applied post-processing fixes to streamed message", {
            conversationId,
            originalLength: originalStreamMessage.length,
            fixedLength: assistantMessage.length,
          });
        }

        // Send final chunk with finish_reason
        const finalChunk = {
          id: `chatcmpl-${conversationId.slice(0, 8)}`,
          object: "chat.completion.chunk",
          created: Math.floor(Date.now() / 1000),
          model: "gemini-flash-latest",
          choices: [
            {
              index: 0,
              delta: {},
              finish_reason: "stop",
            },
          ],
        };
        res.write(`data: ${JSON.stringify(finalChunk)}\n\n`);
        res.write(`data: [DONE]\n\n`);
        res.end();

        const llmDuration = Date.now() - llmStartTime;

        console.log("🟢 STREAMING COMPLETE");
        console.log("Assistant Message:", assistantMessage);
        console.log("Duration:", llmDuration, "ms\n");

        // Extract customer details from conversation
        const extractedDetails = extractCustomerDetailsFromText(
          assistantMessage,
          userText
        );

        if (Object.keys(extractedDetails).length > 0) {
          updatedContext = {
            ...updatedContext,
            ...extractedDetails,
          };

          logger.info("Extracted customer details from conversation", {
            conversationId,
            extracted: extractedDetails,
          });
        }

        // Update session with streamed response
        const updatedHistory = [
          ...session.history,
          { role: "user", content: userText, timestamp: new Date() },
          {
            role: "assistant",
            content: assistantMessage,
            timestamp: new Date(),
          },
        ];

        await sessionManager.updateSession(conversationId, {
          state: newState,
          history: updatedHistory.slice(-20),
          context: updatedContext,
          lastIntent: intent,
        });

        logger.info("Streaming response complete", {
          conversationId,
          responseLength: assistantMessage.length,
          duration: llmDuration,
        });

        return; // Exit early for streaming
      } catch (streamError) {
        console.error("Streaming error:", streamError);
        res.end();
        return;
      }
    }

    // Non-streaming mode: Collect full response
    let assistantMessage = "";
    let promptTokens = 0;
    let completionTokens = 0;

    for await (const chunk of stream) {
      const content = chunk.choices[0]?.delta?.content || "";
      assistantMessage += content;
    }

    const llmDuration = Date.now() - llmStartTime;

    logger.info("LLM response generated", {
      model: "gemini-flash-latest",
      responseLength: assistantMessage.length,
      duration: llmDuration,
    });

    // VALIDATION FIX: Catch and correct LLM hallucinations and format violations
    // This prevents TTS from saying "minus" or users hearing invented prices
    const originalMessage = assistantMessage;
    let validationFailed = false;
    let validationReason = "";

    // Pattern 0: Fix digit-by-digit number formatting (e.g., "4. 2. 6. שקלים" → "426 שקלים")
    const beforeDigitFix = assistantMessage;
    assistantMessage = fixDigitByDigitNumbers(assistantMessage);
    if (assistantMessage !== beforeDigitFix) {
      validationFailed = true;
      validationReason = "Fixed digit-by-digit number formatting";
      logger.warn("Auto-fixed digit-by-digit numbers", {
        conversationId,
        original: beforeDigitFix,
        fixed: assistantMessage,
      });
    }

    // Pattern 0.5: Ensure "שקלים" appears after all prices
    const beforeShekelsFix = assistantMessage;
    assistantMessage = ensureShekelsAfterPrices(assistantMessage);
    if (assistantMessage !== beforeShekelsFix) {
      validationFailed = true;
      if (validationReason) validationReason += ", ";
      validationReason += 'Added missing "שקלים" after prices';
      logger.warn("Auto-added missing שקלים", {
        conversationId,
        original: beforeShekelsFix,
        fixed: assistantMessage,
      });
    }

    // Pattern 1: Check for "במינוס" which TTS reads as "be-MINUS"
    if (/במינוס/gi.test(assistantMessage)) {
      validationFailed = true;
      if (validationReason) validationReason += ", ";
      validationReason += 'Contains "במינוס" (wrong price format)';

      // Attempt auto-fix: replace "במינוס X" with "ב X"
      assistantMessage = assistantMessage.replace(/במינוס\s*/gi, "ב ");

      logger.warn("Auto-fixed price format in LLM response", {
        conversationId,
        original: originalMessage,
        fixed: assistantMessage,
      });
    }

    // Pattern 2: Check for hyphen between ב and numbers (TTS reads as minus)
    if (/ב-\d+/g.test(assistantMessage)) {
      validationFailed = true;
      if (validationReason) validationReason += ", ";
      validationReason += 'Contains "ב-" followed by number (hyphen format)';

      // Auto-fix: replace "ב-X" with "ב X" (add space)
      assistantMessage = assistantMessage.replace(/ב-(\d+)/g, "ב $1");

      logger.warn("Auto-fixed hyphen in price format", {
        conversationId,
        original: originalMessage,
        fixed: assistantMessage,
      });
    }

    // Pattern 3: Check for suspiciously high prices (> 200 shekels suggests hallucination)
    const priceMatches = assistantMessage.match(
      /(\d{3,})\s*(?:שקלים|שקל|ש״ח)/gi
    );
    if (priceMatches) {
      const hasSuspiciousPrice = priceMatches.some((match) => {
        const price = parseInt(match.match(/\d+/)[0]);
        return price > 200; // Breakfast items should not exceed 200 NIS
      });

      if (hasSuspiciousPrice) {
        validationFailed = true;
        validationReason =
          "Contains suspiciously high price (>200 NIS - likely hallucination)";

        // Cannot auto-fix price hallucination - use safe fallback
        assistantMessage = "סליחה, לא הבנתי בדיוק. תוכל לחזור על הבקשה?";

        logger.warn("LLM hallucinated price - using fallback response", {
          conversationId,
          original: originalMessage,
          suspiciousMatches: priceMatches,
          fallback: assistantMessage,
        });
      }
    }

    // Pattern 4: Check for gibberish or mixed language in Hebrew context
    // Look for patterns like "במהנדס" or "האווירה" when talking about food
    const gibberishPatterns = [
      /במהנדס/gi,
      /האווירה/gi, // Unless actually talking about atmosphere
    ];

    for (const pattern of gibberishPatterns) {
      if (pattern.test(assistantMessage)) {
        validationFailed = true;
        validationReason = `Contains potential gibberish: ${pattern.toString()}`;

        // Use fallback for gibberish - cannot auto-fix
        assistantMessage = "סליחה, לא הבנתי. מה תרצה להזמין?";

        logger.warn("Detected gibberish in LLM response", {
          conversationId,
          original: originalMessage,
          pattern: pattern.toString(),
          fallback: assistantMessage,
        });

        break; // Only need to catch first gibberish pattern
      }
    }

    // Log validation results for monitoring
    if (validationFailed) {
      logger.warn("LLM response validation failed - response corrected", {
        conversationId,
        reason: validationReason,
        originalResponse: originalMessage,
        correctedResponse: assistantMessage,
        wasAutoFixed:
          assistantMessage !== "סליחה, לא הבנתי בדיוק. תוכל לחזור על הבקשה?" &&
          assistantMessage !== "סליחה, לא הבנתי. מה תרצה להזמין?",
      });
    }

    // Extract customer details from conversation
    const extractedDetails = extractCustomerDetailsFromText(
      assistantMessage,
      userText
    );

    if (Object.keys(extractedDetails).length > 0) {
      updatedContext = {
        ...updatedContext,
        ...extractedDetails,
      };

      logger.info("Extracted customer details from conversation", {
        conversationId,
        extracted: extractedDetails,
      });
    }

    // STEP 9: Update session
    const updateStartTime = Date.now();

    // Build updated conversation history
    const updatedHistory = [
      ...session.history,
      { role: "user", content: userText, timestamp: new Date() },
      { role: "assistant", content: assistantMessage, timestamp: new Date() },
    ];

    // Trim history if too long (keep last 20 messages)
    const trimmedHistory = updatedHistory.slice(-20);

    // Update session
    await sessionManager.updateSession(conversationId, {
      state: newState,
      history: trimmedHistory,
      context: updatedContext,
      lastIntent: intent,
    });

    logger.debug("Session updated", {
      conversationId,
      newState,
      historyLength: trimmedHistory.length,
      duration: Date.now() - updateStartTime,
    });

    // STEP 10: Log to Langfuse
    const trace = langfuseClient.trace({
      id: conversationId,
      name: "chat_completion",
      userId: session.phoneNumber,
      metadata: {
        restaurantId: restaurant._id.toString(),
        state: newState,
        intent,
        confidence,
      },
    });

    // Span 1: Intent Classification
    const intentEndTime = parallelStartTime + intentDuration;
    trace.span({
      name: "intent_classification",
      startTime: new Date(parallelStartTime),
      endTime: new Date(intentEndTime),
      metadata: { intent, confidence, duration: intentDuration },
    });

    // Span 2: RAG Search (if used)
    if (ragResults.length > 0 && ragDuration > 0) {
      const ragStartTime = intentEndTime;
      const ragEndTime = ragStartTime + ragDuration;
      trace.span({
        name: "rag_search",
        startTime: new Date(ragStartTime),
        endTime: new Date(ragEndTime),
        metadata: { resultCount: ragResults.length, duration: ragDuration },
      });
    }

    // Span 3: State Transition
    trace.span({
      name: "state_transition",
      startTime: new Date(transitionStartTime),
      endTime: new Date(
        transitionStartTime + (Date.now() - transitionStartTime)
      ),
      metadata: { previousState: session.state, newState },
    });

    // Span 4: Function Execution (if any)
    if (functionResults) {
      trace.span({
        name: "function_execution",
        startTime: new Date(functionStartTime),
        endTime: new Date(functionStartTime + (Date.now() - functionStartTime)),
        metadata: { functions: functionsToCall, results: functionResults },
      });
    }

    // Span 5: Prompt Building
    trace.span({
      name: "prompt_building",
      startTime: new Date(promptStartTime),
      endTime: new Date(promptStartTime + (Date.now() - promptStartTime)),
      metadata: { promptLength: systemPrompt.length },
    });

    // Generation: LLM Response
    trace.generation({
      name: "llm_response",
      model: "gemini-flash-latest",
      startTime: new Date(llmStartTime),
      endTime: new Date(llmStartTime + llmDuration),
      input: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userText },
      ],
      output: assistantMessage,
      usage: {
        promptTokens: promptTokens || 0,
        completionTokens: completionTokens || 0,
        totalTokens: (promptTokens || 0) + (completionTokens || 0),
      },
      metadata: { temperature: 0.7, max_tokens: 250 },
    });

    await langfuseClient.flushAsync();

    // STEP 11: Build OpenAI-compatible response
    const response = {
      id: `chatcmpl-${conversationId.slice(0, 8)}`,
      object: "chat.completion",
      created: Math.floor(Date.now() / 1000),
      model: "gemini-flash-latest",
      choices: [
        {
          index: 0,
          message: {
            role: "assistant",
            content: assistantMessage,
          },
          finish_reason: "stop",
        },
      ],
      usage: {
        prompt_tokens: promptTokens || 0,
        completion_tokens: completionTokens || 0,
        total_tokens: (promptTokens || 0) + (completionTokens || 0),
      },
    };

    // STEP 12: Return response + timing logs
    const totalDuration = Date.now() - requestStartTime;

    logger.info("Chat completion request processed", {
      conversationId,
      intent,
      state: newState,
      totalDuration,
      breakdown: {
        parallel: Date.now() - parallelStartTime,
        stateTransition: Date.now() - transitionStartTime,
        functionExecution: functionResults ? Date.now() - functionStartTime : 0,
        promptBuilding: Date.now() - promptStartTime,
        llmCall: llmDuration,
        sessionUpdate: Date.now() - updateStartTime,
      },
    });

    // 🔍 DEBUG: Log response before sending
    console.log("\n" + "=".repeat(80));
    console.log("🟢 SENDING RESPONSE");
    console.log("=".repeat(80));
    console.log("Status: 200");
    console.log("Response:", JSON.stringify(response, null, 2));
    console.log("Assistant Message:", assistantMessage);
    console.log("Total Duration:", totalDuration, "ms");
    console.log("=".repeat(80) + "\n");

    return res.json(response);
  } catch (error) {
    // 🔍 DEBUG: Log error details
    console.log("\n" + "=".repeat(80));
    console.log("🔴 ERROR IN /v1/chat/completions");
    console.log("=".repeat(80));
    console.log("Error Message:", error.message);
    console.log("Error Stack:", error.stack);
    console.log("Conversation ID:", conversationId);
    console.log("User Message:", userText);
    console.log("=".repeat(80) + "\n");

    logger.error("Chat completion failed", {
      error: error.message,
      stack: error.stack,
      conversationId,
      userMessage: userText,
    });

    // Log to Langfuse
    if (conversationId) {
      langfuseClient.trace({
        id: conversationId,
        name: "chat_completion_error",
        metadata: { error: error.message },
      });
    }

    // Return OpenAI-compatible error response
    return res.status(500).json({
      id: `chatcmpl-error-${Date.now()}`,
      object: "chat.completion",
      created: Math.floor(Date.now() / 1000),
      model: "gemini-flash-latest",
      choices: [
        {
          index: 0,
          message: {
            role: "assistant",
            content: "מצטער, נתקלתי בבעיה. אנא נסה שוב או צור קשר עם התמיכה.",
          },
          finish_reason: "stop",
        },
      ],
      usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
    });
  }
});

/**
 * Extract conversation ID from request with 4-level priority fallback
 * @param {Object} req - Express request object
 * @returns {string} Conversation ID (UUID format)
 */
function extractConversationId(req) {
  // Priority 1: Header
  if (req.headers["x-conversation-id"]) {
    return req.headers["x-conversation-id"];
  }

  // Priority 2: VAPI call.id
  if (req.body.call?.id) {
    return req.body.call.id;
  }

  // Priority 3: System message pattern
  const systemMsg = req.body.messages?.find((m) => m.role === "system");
  if (systemMsg) {
    const match = systemMsg.content.match(/conversationId:\s*([a-f0-9-]+)/i);
    if (match) return match[1];
  }

  // Priority 4: Generate new UUID
  return uuidv4();
}

/**
 * Find restaurant from request context
 * @param {Object} req - Express request object
 * @returns {Promise<Object|null>} Restaurant object or null
 */
async function findRestaurantForRequest(req) {
  // For now, return the default restaurant
  // In production, this would extract from VAPI call context
  const Restaurant = require("../models/Restaurant");
  return await Restaurant.findOne({ name: "מסעדת הבוקרים" });
}

module.exports = router;
