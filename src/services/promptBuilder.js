const logger = require("../utils/logger");
const { BASE_PROMPT, STATE_PROMPTS } = require("../config/prompts");

/**
 * Prompt Builder Service
 *
 * Dynamically assembles context-aware prompts for conversation orchestrator
 * Integrates RAG results, function results, cart state, and customer context
 */

// Valid states for validation
const VALID_STATES = [
  "GREETING",
  "COLLECTING_ORDER",
  "COLLECTING_DETAILS",
  "CONFIRMING_ORDER",
  "ORDER_PLACED",
];

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Format menu items from RAG search results
 *
 * @param {Array} menuItems - Array of menu items from RAG search
 * @returns {string} Formatted menu section in Hebrew
 */
function formatMenuResults(menuItems) {
  if (!menuItems || menuItems.length === 0) return "";

  const items = menuItems
    .slice(0, 5) // Top 5 only
    .map((item) => {
      const stock = item.inStock === false ? " (אזל)" : "";
      // Format: "ב X שקלים" (space before number, שקלים after, NO HYPHEN - TTS reads it as "minus"!)
      // Ensure price is formatted as complete number, not digit-by-digit
      return `${item.name} ב ${item.price} שקלים${stock}`;
    })
    .join(", "); // One line instead of multiple

  return `תפריט: ${items}`; // Much shorter header
}

/**
 * Format restaurant info from RAG search results
 *
 * @param {Array} infoItems - Array of info items from RAG search
 * @returns {string} Formatted info section in Hebrew
 */
function formatInfoResults(infoItems) {
  if (!infoItems || infoItems.length === 0) return "";

  const items = infoItems
    .slice(0, 3) // Reduce to 3
    .map((item) => item.answer) // Just the answer, skip question
    .join(". "); // One line

  return `מידע: ${items}`;
}

/**
 * Format function execution results
 *
 * @param {any} functionResults - Results from tool handler execution
 * @returns {string} Formatted function results section
 */
function formatFunctionResults(functionResults) {
  if (!functionResults) {
    return "";
  }

  // String result (from add_to_cart, place_order)
  if (typeof functionResults === "string") {
    return `תוצאת פעולה:\n${functionResults}\n\nהשתמש במידע זה בתשובתך ללקוח.`;
  }

  // cart_summary result
  if (functionResults.items && Array.isArray(functionResults.items)) {
    return formatCartSummaryFromResult(functionResults);
  }

  // restaurant_info result
  if (functionResults.name || functionResults.address) {
    return formatRestaurantInfo(functionResults);
  }

  // Generic object
  return `תוצאת פעולה:\n${JSON.stringify(functionResults, null, 2)}`;
}

/**
 * Format cart summary for display in prompt (optimized)
 *
 * @param {Array} cart - Array of cart items
 * @returns {string} Formatted cart section in Hebrew
 */
function formatCartSummary(cart) {
  if (!cart || cart.length === 0) return "עגלה ריקה";

  // Optimize: calculate total during map for single pass
  let total = 0;
  const items = cart.map((i) => {
    const itemTotal = (i.price || 0) * (i.quantity || 0);
    total += itemTotal;
    return `${i.name} x${i.quantity}`;
  }).join(", ");

  // Use consistent format: "ב-X שקלים" instead of "X₪"
  return `עגלה: ${items}. סכום: ${total} שקלים`;
}

/**
 * Format phone number for display (Israeli format)
 *
 * @param {string} phoneNumber - Raw phone number
 * @returns {string} Formatted phone number (e.g., "052-1234567")
 */
function formatPhoneNumber(phoneNumber) {
  if (!phoneNumber) return "";

  // Remove all non-digit characters
  const digits = phoneNumber.replace(/\D/g, "");

  // Israeli format: 05X-XXXXXXX or 0X-XXXXXXX
  if (digits.length === 10) {
    return `${digits.slice(0, 3)}-${digits.slice(3)}`;
  } else if (digits.length === 9) {
    return `${digits.slice(0, 2)}-${digits.slice(2)}`;
  }

  // Return as-is if unexpected format
  return phoneNumber;
}

/**
 * Format cart summary from get_cart_summary result
 *
 * @param {Object} result - Result from get_cart_summary handler
 * @returns {string} Formatted cart summary
 */
function formatCartSummaryFromResult(result) {
  const { items, subtotal, itemCount, message } = result;

  if (!items || items.length === 0) {
    return message || "העגלה ריקה.";
  }

  const itemsList = items
    .map((item) => `- ${item.name} x${item.quantity}: ${item.subtotal} שקלים`)
    .join("\n");

  return `סיכום העגלה:\n${itemsList}\n סך הכל: ${subtotal} שקלים (${itemCount} פריטים)`;
}

/**
 * Format restaurant info from get_restaurant_info result (optimized with template literals)
 *
 * @param {Object} info - Result from get_restaurant_info handler
 * @returns {string} Formatted restaurant info
 */
function formatRestaurantInfo(info) {
  const parts = ["מידע על המסעדה:"];

  if (info.name) parts.push(`שם: ${info.name}`);
  if (info.address) parts.push(`כתובת: ${info.address}`);
  if (info.businessHours) parts.push(`שעות פתיחה: ${info.businessHours}`);

  if (info.policies) {
    if (info.policies.delivery) {
      let deliveryLine = `משלוח: ${info.policies.delivery.available ? "זמין" : "לא זמין"}`;
      if (info.policies.delivery.fee) {
        deliveryLine += ` (דמי משלוח: ${info.policies.delivery.fee} שקלים)`;
      }
      parts.push(deliveryLine);
    }
    if (info.policies.pickup) {
      parts.push(`איסוף עצמי: ${info.policies.pickup.available ? "זמין" : "לא זמין"}`);
    }
  }

  return parts.join("\n") + (parts.length > 1 ? "\n" : "");
}

/**
 * Detect missing fields in customer context
 *
 * @param {Object} context - Session context
 * @returns {Array} Array of missing field objects {field, label}
 */
function detectMissingFields(context) {
  const missing = [];

  // Always required fields
  if (!context.customerName || context.customerName.trim().length === 0) {
    missing.push({ field: "customerName", label: "שם לקוח" });
  }

  if (
    !context.phoneNumber ||
    context.phoneNumber.replace(/\D/g, "").length < 9
  ) {
    missing.push({ field: "phoneNumber", label: "מספר טלפון" });
  }

  if (!context.deliveryType) {
    missing.push({ field: "deliveryType", label: "סוג הזמנה (משלוח/איסוף)" });
  }

  // Only required for delivery
  if (context.deliveryType === "delivery") {
    if (
      !context.deliveryAddress ||
      context.deliveryAddress.trim().length < 10
    ) {
      missing.push({ field: "deliveryAddress", label: "כתובת משלוח" });
    }
  }

  // Cart must not be empty
  if (!context.cart || context.cart.length === 0) {
    missing.push({ field: "cart", label: "פריטים בעגלה" });
  }

  return missing;
}

/**
 * Format missing fields for display in prompt
 *
 * @param {Array} missingFields - Array of missing field objects
 * @returns {string} Formatted missing fields section
 */
function formatMissingFields(missingFields) {
  if (!missingFields || missingFields.length === 0) {
    return "כל הפרטים הנדרשים התקבלו. ניתן לעבור לאישור הזמנה.";
  }

  const header = "פרטים חסרים שיש לאסוף:";
  const items = missingFields.map((f) => `- ${f.label}`).join("\n");

  return `${header}\n${items}\n\nשאל על פרט אחד בכל פעם בצורה טבעית ונעימה.`;
}

/**
 * Replace all variable placeholders in prompt (optimized - single pass)
 *
 * @param {string} prompt - Prompt template with placeholders
 * @param {Object} context - Session context
 * @param {string} caller_number - System caller number
 * @returns {string} Prompt with variables replaced
 */
function replaceVariables(prompt, context, caller_number) {
  // Prepare all replacement values once
  const replacements = {
    customerName: context.customerName || "[לא צוין]",
    phoneNumber: context.phoneNumber || "[לא צוין]",
    deliveryAddress: context.deliveryAddress || "[לא צוין]",
    deliveryType: context.deliveryType || "[לא צוין]",
    caller_number: caller_number || "[לא זמין]"
  };

  // Handle conditional sections first (before variable replacement)
  let result = prompt.replace(
    /\{\{#if deliveryType === 'delivery'\}\}(.*?)\{\{\/if\}\}/gs,
    (match, content) => {
      return context.deliveryType === "delivery" ? content : "";
    }
  );

  // Batch all variable replacements in a single pass using a function
  result = result.replace(/\{\{(\w+)\}\}/g, (match, key) => {
    return replacements[key] !== undefined ? replacements[key] : match;
  });

  return result;
}

// ============================================================================
// MAIN FUNCTION
// ============================================================================

/**
 * Build dynamic prompt for conversation orchestrator
 *
 * Assembles a complete system prompt by combining:
 * - BASE_PROMPT (core identity and rules)
 * - State-specific instructions
 * - RAG search results (menu items and restaurant info)
 * - Function execution results
 * - Cart summary
 * - Missing fields (for COLLECTING_DETAILS state)
 * - Variable replacements
 *
 * @param {Object} params - Prompt building parameters
 * @param {string} params.state - Current conversation state
 * @param {string} params.intent - Classified user intent
 * @param {Array} [params.ragResults=[]] - RAG search results
 * @param {any} [params.functionResults=null] - Tool handler results
 * @param {Object} [params.context={}] - Session context
 * @param {string} [params.caller_number=''] - System caller number
 * @returns {string} Complete assembled prompt
 */
function buildPrompt({
  state,
  intent,
  ragResults = [],
  functionResults = null,
  context = {},
  caller_number = "",
}) {
  const startTime = Date.now();

  // Validate state
  if (!VALID_STATES.includes(state)) {
    logger.error("Invalid state for prompt building", {
      state,
      validStates: VALID_STATES,
    });
    state = "GREETING"; // Fallback to safe default
  }

  logger.debug("Building prompt", {
    state,
    intent,
    ragResultCount: ragResults?.length || 0,
    hasFunctionResults: !!functionResults,
    cartSize: context.cart?.length || 0,
  });

  // Build all sections first (cache-able computations)
  const statePrompt = STATE_PROMPTS[state] || "";
  
  // Format RAG results (only if needed)
  let menuSection = "";
  let infoSection = "";
  if (ragResults && ragResults.length > 0) {
    const menuItems = ragResults.filter((r) => r.type === "menu");
    const infoItems = ragResults.filter((r) => r.type === "info");

    if (menuItems.length > 0) {
      menuSection = formatMenuResults(menuItems);
    }

    if (infoItems.length > 0) {
      infoSection = formatInfoResults(infoItems);
    }
  }

  // Format function results
  let functionSection = "";
  if (functionResults) {
    const formatted = formatFunctionResults(functionResults);
    if (formatted) {
      functionSection = formatted;
    }
  }

  // Format cart summary
  const cartSection = formatCartSummary(context.cart || []);

  // Prepare placeholder replacements (batch all replacements)
  const placeholders = {
    CART_SECTION: cartSection,
    MISSING_FIELDS_SECTION: state === "COLLECTING_DETAILS" 
      ? formatMissingFields(detectMissingFields(context))
      : "",
    PHONE_COLLECTION_INSTRUCTION: (() => {
      if (context.callerNumber && !context.phoneNumber) {
        const callerNumberFormatted = formatPhoneNumber(context.callerNumber);
        return `יש לך את המספר של הלקוח מזיהוי שיחה: ${callerNumberFormatted}. תשאל אותו: "האם אפשר להשתמש במספר ממנו התקשרת (${callerNumberFormatted}) להזמנה?" אם הוא אומר כן, שמור את המספר. אם לא, בקש ממנו מספר אחר.`;
      } else if (!context.phoneNumber) {
        return 'בקש מהלקוח את מספר הטלפון שלו להזמנה.';
      }
      return '';
    })()
  };

  // Build prompt using template literal (faster than concatenation)
  let prompt = `${BASE_PROMPT}\n\n${statePrompt}`;

  // Add RAG sections if present
  if (menuSection) {
    prompt = `${prompt}\n\n${menuSection}`;
  }
  if (infoSection) {
    prompt = `${prompt}\n\n${infoSection}`;
  }

  // Add function results if present
  if (functionSection) {
    prompt = `${prompt}\n\n${functionSection}`;
  }

  // Replace all placeholders in a single pass
  prompt = prompt.replace(/\{\{(\w+)\}\}/g, (match, key) => {
    return placeholders[key] !== undefined ? placeholders[key] : match;
  });

  // Replace all variable placeholders
  prompt = replaceVariables(prompt, context, caller_number);

  // Log final prompt stats
  const finalPrompt = prompt.trim();
  const duration = Date.now() - startTime;

  logger.debug("Prompt built successfully", {
    promptLength: finalPrompt.length,
    hasRAGSection: finalPrompt.includes("תפריט:"),
    hasCartSection: finalPrompt.includes("עגלה:"),
    duration
  });

  if (finalPrompt.length > 4000) {
    logger.warn("Prompt exceeds 4000 characters", {
      length: finalPrompt.length,
      state,
      intent,
    });
  }

  return finalPrompt;
}

// ============================================================================
// EXPORTS
// ============================================================================

module.exports = {
  buildPrompt,
  // Export helpers for testing
  formatMenuResults,
  formatInfoResults,
  formatCartSummary,
  formatFunctionResults,
  detectMissingFields,
  formatMissingFields,
  replaceVariables,
};
