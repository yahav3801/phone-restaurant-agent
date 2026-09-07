/**
 * Business Logic Functions for Restaurant Phone Agent
 *
 * Separates business logic from HTTP/Vapi concerns.
 * All functions return { success, data?, error?, errorType? } format.
 */

const OpenAI = require('openai');
const Order = require('../models/Order');
const KnowledgeBase = require('../models/KnowledgeBase');
const logger = require('../utils/logger');
const {
  sanitizePhoneNumber,
  sanitizeCustomerName,
  sanitizeDeliveryAddress,
} = require('../utils/validators');

// Initialize OpenAI client
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Calculate total from cart items
 *
 * @param {Array<{price: number, quantity: number}>} cart - Cart items
 * @returns {number} Total price
 */
function calculateTotal(cart) {
  if (!Array.isArray(cart) || cart.length === 0) {
    return 0;
  }

  return cart.reduce((sum, item) => {
    const itemTotal = (item.price || 0) * (item.quantity || 0);
    return sum + itemTotal;
  }, 0);
}

/**
 * Format cart items for Hebrew display
 *
 * @param {Array<{name: string, quantity: number, price: number}>} cart - Cart items
 * @param {number} total - Total price
 * @returns {string} Formatted Hebrew string
 *
 * @example
 * formatCartForDisplay([{name: 'פיצה', quantity: 2, price: 60}], 120)
 * // Returns: "הזמנתך:\n1. פיצה x2 - 120₪\nסה״כ: 120₪"
 */
function formatCartForDisplay(cart, total) {
  if (!cart || cart.length === 0) {
    return 'העגלה ריקה';
  }

  const itemLines = cart.map((item, index) => {
    const subtotal = item.price * item.quantity;
    return `${index + 1}. ${item.name} x${item.quantity} - ${subtotal}₪`;
  });

  return `הזמנתך:\n${itemLines.join('\n')}\nסה״כ: ${total}₪`;
}

/**
 * Validate Israeli phone number format
 *
 * @param {string} phone - Phone number to validate
 * @returns {Object} { valid: boolean, normalized?: string, error?: string }
 *
 * @example
 * validatePhone("0501234567")
 * // { valid: true, normalized: "+972501234567" }
 *
 * validatePhone("invalid")
 * // { valid: false, error: "Invalid phone format" }
 */
function validatePhone(phone) {
  try {
    const normalized = sanitizePhoneNumber(phone);
    const phoneWithoutPrefix = normalized.replace('+972', '');

    // Must be 9 digits after +972
    if (phoneWithoutPrefix.length !== 9) {
      return {
        valid: false,
        error: 'מספר הטלפון חייב להכיל 9 ספרות אחרי קידומת +972',
      };
    }

    // Valid prefixes: 2,3,4,8,9 (landline), 50-59 (mobile)
    const validPrefixes = /^(2|3|4|8|9|50|51|52|53|54|55|56|57|58|59)/;
    if (!validPrefixes.test(phoneWithoutPrefix)) {
      return {
        valid: false,
        error: 'קידומת מספר הטלפון לא תקינה',
      };
    }

    return { valid: true, normalized };
  } catch (error) {
    return { valid: false, error: error.message };
  }
}

/**
 * Validate delivery address
 *
 * @param {string} address - Delivery address to validate
 * @returns {Object} { valid: boolean, sanitized?: string, error?: string }
 */
function validateAddress(address) {
  try {
    const sanitized = sanitizeDeliveryAddress(address);

    // Must contain a number (house number)
    const hasNumber = /\d+/.test(sanitized);
    if (!hasNumber) {
      return {
        valid: false,
        error: 'הכתובת חייבת לכלול מספר בית',
      };
    }

    // Minimum length for street + number
    if (sanitized.length < 5) {
      return {
        valid: false,
        error: 'הכתובת חייבת לכלול שם רחוב ומספר בית',
      };
    }

    return { valid: true, sanitized };
  } catch (error) {
    return { valid: false, error: error.message };
  }
}

// ============================================================================
// INTERNAL HELPER FUNCTIONS
// ============================================================================

/**
 * Get or create Order for call (internal helper)
 * Uses atomic findOneAndUpdate with upsert to prevent race conditions
 *
 * @private
 * @param {string} callId - Call ID from Vapi
 * @param {Object} restaurant - Restaurant object
 * @param {string} [phoneNumber] - Optional caller phone number
 * @returns {Promise<Object>} Order document
 */
async function getOrCreateOrderForCall(callId, restaurant, phoneNumber) {
  if (!callId) {
    throw new Error('Call ID required');
  }

  // Atomic operation: find existing order or create new one
  const order = await Order.findOneAndUpdate(
    { callId, status: 'in_progress' },
    {
      $setOnInsert: {
        restaurantId: restaurant._id,
        phoneNumber: phoneNumber ? sanitizePhoneNumber(phoneNumber) : null,
        status: 'in_progress',
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

  // Log only if this was a newly created order
  if (order.createdAt.getTime() === order.updatedAt.getTime()) {
    logger.info('Created new Order for call', {
      callId,
      orderId: order._id,
      restaurantId: restaurant._id,
    });
  }

  return order;
}

/**
 * Atomically recalculate and update order total (internal helper)
 * Prevents race conditions with optimistic locking
 *
 * @private
 * @param {string} callId - Call ID
 * @returns {Promise<Object>} Updated Order document
 */
async function recalculateOrderTotal(callId) {
  const order = await Order.findOne({ callId, status: 'in_progress' });

  if (!order) {
    throw new Error('Order not found');
  }

  const total = order.items.reduce(
    (sum, item) => sum + item.price * item.quantity,
    0
  );

  // Update with version check for optimistic locking
  const updatedOrder = await Order.findOneAndUpdate(
    { callId, status: 'in_progress', __v: order.__v },
    { $set: { total } },
    { new: true }
  );

  if (!updatedOrder) {
    // Version mismatch - retry once
    return recalculateOrderTotal(callId);
  }

  return updatedOrder;
}

// ============================================================================
// MAIN FUNCTIONS
// ============================================================================

/**
 * Get current cart summary
 *
 * @param {Object} params
 * @param {string} params.callId - Call ID from Vapi webhook
 * @param {Object} params.restaurant - Restaurant object from middleware
 *
 * @returns {Promise<Object>}
 * Success: { success: true, data: { items: [...], subtotal: number, itemCount: number, message: string } }
 * Error: { success: false, error: string, errorType: 'DATABASE_ERROR' }
 */
async function getCartSummary({ callId, restaurant }) {
  const startTime = Date.now();

  try {
    // Validate inputs
    if (!callId) {
      return {
        success: true,
        data: {
          items: [],
          subtotal: 0,
          itemCount: 0,
          message: 'אין עגלה פעילה',
        },
      };
    }

    if (!restaurant) {
      return {
        success: false,
        error: 'Restaurant not found',
        errorType: 'VALIDATION_ERROR',
      };
    }

    // Find in-progress Order for this call
    const order = await Order.findOne({ callId, status: 'in_progress' });

    // If no order or empty cart
    if (!order || !order.items || order.items.length === 0) {
      logger.debug('Cart is empty', { callId });
      return {
        success: true,
        data: {
          items: [],
          subtotal: 0,
          itemCount: 0,
          message: 'העגלה ריקה',
        },
      };
    }

    // Build summary
    const summary = {
      items: order.items.map((item) => ({
        name: item.name,
        quantity: item.quantity,
        price: item.price,
        subtotal: item.price * item.quantity,
        category: item.category,
      })),
      subtotal: order.total || 0,
      itemCount: order.items.reduce((sum, item) => sum + item.quantity, 0),
      message: '', // No message when cart has items
    };

    logger.debug('Cart summary retrieved', {
      callId,
      itemCount: summary.itemCount,
      subtotal: summary.subtotal,
      duration: `${Date.now() - startTime}ms`,
    });

    return { success: true, data: summary };
  } catch (error) {
    logger.error('Error in getCartSummary', {
      error: error.message,
      callId,
      restaurantId: restaurant?._id,
    });

    return {
      success: false,
      error: `שגיאה בקבלת סיכום ההזמנה: ${error.message}`,
      errorType: 'DATABASE_ERROR',
    };
  }
}

// ============================================================================
// MULTI-ITEM PARSING HELPERS
// ============================================================================

/**
 * Parse Hebrew quantity words to numbers
 * @param {string} text - Text that may contain Hebrew numbers
 * @returns {number} Parsed quantity or 1 if not found
 */
function parseHebrewQuantity(text) {
  const hebrewNumbers = {
    'אחד': 1, 'אחת': 1,
    'שני': 2, 'שניים': 2, 'שתי': 2, 'שתיים': 2,
    'שלוש': 3, 'שלושה': 3,
    'ארבע': 4, 'ארבעה': 4,
    'חמש': 5, 'חמישה': 5,
    'שש': 6, 'שישה': 6,
    'שבע': 7, 'שבעה': 7,
    'שמונה': 8,
    'תשע': 9, 'תשעה': 9,
    'עשר': 10, 'עשרה': 10
  };

  // Check for digit numbers first (e.g., "2 המבורגרים")
  const digitMatch = text.match(/(\d+)\s*x?\s*/i);
  if (digitMatch) {
    return parseInt(digitMatch[1], 10);
  }

  // Check for Hebrew number words
  const textLower = text.toLowerCase();
  for (const [word, num] of Object.entries(hebrewNumbers)) {
    if (textLower.includes(word)) {
      return num;
    }
  }

  return 1; // Default quantity
}

/**
 * Split user message into individual item requests
 * Handles conjunctions like "ו" (and) and commas
 * Improved to handle "1 והמבורגר" correctly (quantity before "ו")
 *
 * @param {string} text - User message
 * @returns {Array<{quantity: number, itemName: string}>}
 *
 * @example
 * splitIntoItemRequests("שני המבורגרים, בירה ואחד קולה")
 * // Returns: [
 * //   {quantity: 2, itemName: "המבורגרים"},
 * //   {quantity: 1, itemName: "בירה"},
 * //   {quantity: 1, itemName: "קולה"}
 * // ]
 * 
 * @example
 * splitIntoItemRequests("המבורגר 200 גרם , 1 והמבורגר, אחד 300 גרם")
 * // Returns: [
 * //   {quantity: 1, itemName: "המבורגר 200 גרם"},
 * //   {quantity: 1, itemName: "המבורגר"},
 * //   {quantity: 1, itemName: "300 גרם"}
 * // ]
 */
function splitIntoItemRequests(text) {
  // Remove common filler words
  let cleaned = text
    .replace(/\$<Speaker \d+>/g, '') // Remove VAPI speaker tags
    .replace(/רוצה|אני רוצה|תן לי|אפשר|בבקשה|כתבי|לי/gi, '')
    .trim();

  const items = [];
  
  // First, handle patterns like "1 והמבורגר" or "אחד והמבורגר"
  // These should be treated as quantity + item, not split
  cleaned = cleaned.replace(/(\d+|אחד|אחת|שני|שניים|שתי|שתיים|שלוש|שלושה|ארבע|ארבעה|חמש|חמישה|שש|שישה|שבע|שבעה|שמונה|תשע|תשעה|עשר|עשרה)\s+ו\s+(ה|המבורגר|הפיצה|הקולה|הבירה)/gi, '$1 $2');
  
  // Split by commas first
  const commaParts = cleaned.split(/[,،]/);
  
  for (const commaPart of commaParts) {
    const trimmed = commaPart.trim();
    if (!trimmed || trimmed.length < 2) continue;
    
    // Now split by " ו" (space + and) but be careful with quantity patterns
    // Pattern: split on " ו" when it's clearly separating items (not part of quantity phrase)
    const andParts = trimmed.split(/\s+ו\s+(?![א-ת]*\s+(?:גרם|קילו|מיליליטר|מ"ל|ליטר))/i);
    
    for (const part of andParts) {
      const trimmedPart = part.trim();
      if (!trimmedPart || trimmedPart.length < 2) continue;

      // Extract quantity (can be at start: "1 המבורגר" or "אחד המבורגר")
      const quantity = parseHebrewQuantity(trimmedPart);

      // Remove quantity words/numbers from item name
      let itemName = trimmedPart
        .replace(/^(\d+)\s*x?\s*/i, '') // Remove leading digits like "1 " or "2x "
        .replace(/^(אחד|אחת|שני|שניים|שתי|שתיים|שלוש|שלושה|ארבע|ארבעה|חמש|חמישה|שש|שישה|שבע|שבעה|שמונה|תשע|תשעה|עשר|עשרה)\s+/i, '') // Remove Hebrew numbers
        .replace(/^(ו|את)\s*/i, '') // Remove leading conjunctions
        .trim();

      // If item name is empty after removing quantity, use the original part
      if (!itemName || itemName.length < 2) {
        itemName = trimmedPart.replace(/^(ו|את)\s*/i, '').trim();
      }

      if (itemName && itemName.length >= 2) {
        items.push({ quantity, itemName });
      }
    }
  }

  // If no items found after parsing, return the whole text as single item
  if (items.length === 0) {
    items.push({ quantity: 1, itemName: cleaned });
  }

  return items;
}

/**
 * Add multiple items to cart from a single user message
 *
 * Intelligently parses user requests like:
 * - "שני המבורגרים, בירה ואחד קולה" → 2 burgers, 1 beer, 1 cola
 * - "המבורגר וקולה" → 1 burger, 1 cola
 *
 * Uses RAG search to match parsed items to actual menu items.
 *
 * @param {Object} params
 * @param {string} params.itemName - Full user message with multiple items
 * @param {number} params.quantity - Default quantity (usually 1)
 * @param {string} params.callId - Call ID from Vapi webhook
 * @param {Object} params.restaurant - Restaurant object from middleware
 * @param {string} params.callerPhone - Caller's phone number
 *
 * @returns {Promise<Object>}
 * Success: { success: true, data: { message: string, order: Order, addedItems: [...] } }
 * Error: { success: false, error: string, errorType: string }
 */
async function addMultipleItemsToCart({
  itemName,
  quantity,
  callId,
  restaurant,
  callerPhone,
}) {
  const startTime = Date.now();

  try {
    // Validate inputs
    if (!itemName || typeof itemName !== 'string') {
      return {
        success: false,
        error: 'שם הפריט נדרש',
        errorType: 'VALIDATION_ERROR',
      };
    }

    if (!callId || !restaurant) {
      return {
        success: false,
        error: 'Call ID and restaurant required',
        errorType: 'VALIDATION_ERROR',
      };
    }

    // Get or create Order for this call
    await getOrCreateOrderForCall(callId, restaurant, callerPhone);

    // Parse user message into individual item requests
    const itemRequests = splitIntoItemRequests(itemName);

    logger.info('Parsed user request into items', {
      callId,
      originalText: itemName,
      parsedItems: itemRequests
    });

    // Use RAG search to find ALL potential matches (topK: 5)
    const ragSearch = require('./ragSearch');
    const searchResults = await ragSearch.searchMenu(itemName, restaurant._id, {
      topK: 5,
      inStockOnly: true
    });

    if (searchResults.length === 0) {
      return {
        success: false,
        error: `לא מצאתי פריטים מתאימים בתפריט`,
        errorType: 'ITEM_NOT_FOUND',
      };
    }

    // Match each parsed item request to a menu item from search results
    const addedItems = [];
    const failedItems = [];

    for (const request of itemRequests) {
      // Find best match for this specific item request
      let bestMatch = null;
      let bestScore = 0;

      for (const result of searchResults) {
        // Simple matching: check if item name is in the request or vice versa
        const requestLower = request.itemName.toLowerCase();
        const resultLower = result.name.toLowerCase();

        if (requestLower.includes(resultLower) || resultLower.includes(requestLower)) {
          const score = result.similarity || 0.5;
          if (score > bestScore) {
            bestScore = score;
            bestMatch = result;
          }
        }
      }

      // If no match found, try the first result (highest similarity overall)
      if (!bestMatch && searchResults.length > 0) {
        bestMatch = searchResults[0];
      }

      if (!bestMatch) {
        failedItems.push(request.itemName);
        continue;
      }

      // Get full menu item from KnowledgeBase
      const menuItem = await KnowledgeBase.findOne({
        type: 'menu',
        restaurantId: restaurant._id,
        name: bestMatch.name,
      });

      if (!menuItem || !menuItem.inStock) {
        failedItems.push(request.itemName);
        continue;
      }

      // Add item to cart using atomic operations
      const itemQuantity = request.quantity;

      // Atomic operation: try to increment quantity of existing item
      let order = await Order.findOneAndUpdate(
        {
          callId,
          status: 'in_progress',
          'items.name': menuItem.name,
        },
        {
          $inc: { 'items.$.quantity': itemQuantity },
        },
        {
          new: true,
        }
      );

      // If item doesn't exist in cart, add it atomically
      if (!order) {
        order = await Order.findOneAndUpdate(
          { callId, status: 'in_progress' },
          {
            $push: {
              items: {
                name: menuItem.name,
                quantity: itemQuantity,
                price: menuItem.price,
                category: menuItem.category,
              },
            },
          },
          { new: true }
        );
      }

      addedItems.push({
        name: menuItem.name,
        quantity: itemQuantity,
        price: menuItem.price,
      });

      logger.info('Item added to cart', {
        callId,
        itemName: menuItem.name,
        quantity: itemQuantity,
        requestedAs: request.itemName
      });
    }

    // Recalculate total atomically
    const updatedOrder = await recalculateOrderTotal(callId);

    // Build Hebrew message
    let message = '';
    if (addedItems.length > 0) {
      const itemsList = addedItems.map(item =>
        `${item.quantity}x ${item.name} ב ${item.price} שקלים`
      ).join(', ');
      message = `הוספתי: ${itemsList}. סה״כ: ${updatedOrder.total} שקלים`;
    }

    if (failedItems.length > 0) {
      message += `. לא מצאתי: ${failedItems.join(', ')}`;
    }

    logger.info('Multiple items added to cart', {
      callId,
      orderId: updatedOrder._id,
      addedCount: addedItems.length,
      failedCount: failedItems.length,
      newTotal: updatedOrder.total,
      duration: `${Date.now() - startTime}ms`,
    });

    return {
      success: true,
      data: {
        message,
        order: updatedOrder,
        cart: updatedOrder.items,
        addedItems,
        failedItems,
      },
    };
  } catch (error) {
    logger.error('Error in addMultipleItemsToCart', {
      error: error.message,
      callId,
      itemName,
      restaurantId: restaurant?._id,
    });

    return {
      success: false,
      error: `שגיאה בהוספה לעגלה: ${error.message}`,
      errorType: 'DATABASE_ERROR',
    };
  }
}

/**
 * Add item to cart (Order document)
 *
 * @param {Object} params
 * @param {string} params.itemName - Name of menu item to add
 * @param {number} params.quantity - Quantity to add (positive integer)
 * @param {string} params.callId - Call ID from Vapi webhook
 * @param {Object} params.restaurant - Restaurant object from middleware
 * @param {string} [params.callerPhone] - Caller's phone number (optional)
 *
 * @returns {Promise<Object>}
 * Success: { success: true, data: { message: string (Hebrew), order: Order, addedItem: {...} } }
 * Error: { success: false, error: string, errorType: string }
 */
async function addToCart({
  itemName,
  quantity,
  callId,
  restaurant,
  callerPhone,
}) {
  const startTime = Date.now();

  try {
    // Validate inputs
    if (!itemName || typeof itemName !== 'string') {
      return {
        success: false,
        error: 'שם הפריט נדרש',
        errorType: 'VALIDATION_ERROR',
      };
    }

    if (!quantity || typeof quantity !== 'number' || quantity <= 0) {
      return {
        success: false,
        error: 'כמות חייבת להיות מספר חיובי',
        errorType: 'VALIDATION_ERROR',
      };
    }

    if (!callId) {
      return {
        success: false,
        error: 'Call ID required',
        errorType: 'VALIDATION_ERROR',
      };
    }

    if (!restaurant) {
      return {
        success: false,
        error: 'Restaurant not found',
        errorType: 'VALIDATION_ERROR',
      };
    }

    // Get or create Order for this call
    await getOrCreateOrderForCall(callId, restaurant, callerPhone);

    // Use RAG search to find best matching menu item
    const ragSearch = require('./ragSearch');
    const searchResults = await ragSearch.searchMenu(itemName, restaurant._id, {
      topK: 1,
      inStockOnly: true
    });

    if (searchResults.length === 0) {
      return {
        success: false,
        error: `פריט "${itemName}" לא נמצא בתפריט`,
        errorType: 'ITEM_NOT_FOUND',
      };
    }

    const topMatch = searchResults[0];

    // Get full menu item from KnowledgeBase using matched name
    const menuItem = await KnowledgeBase.findOne({
      type: 'menu',
      restaurantId: restaurant._id,
      name: topMatch.name,
    });

    if (!menuItem) {
      return {
        success: false,
        error: `פריט לא נמצא: ${itemName}`,
        errorType: 'ITEM_NOT_FOUND',
      };
    }

    if (!menuItem.inStock) {
      return {
        success: false,
        error: `הפריט לא זמין כרגע: ${itemName}`,
        errorType: 'ITEM_OUT_OF_STOCK',
      };
    }

    // Atomic operation: try to increment quantity of existing item
    let order = await Order.findOneAndUpdate(
      {
        callId,
        status: 'in_progress',
        'items.name': itemName,
      },
      {
        $inc: { 'items.$.quantity': quantity },
      },
      {
        new: true,
      }
    );

    // If item doesn't exist in cart, add it atomically
    if (!order) {
      order = await Order.findOneAndUpdate(
        { callId, status: 'in_progress' },
        {
          $push: {
            items: {
              name: menuItem.name,
              quantity: quantity,
              price: menuItem.price,
              category: menuItem.category,
            },
          },
        },
        { new: true }
      );
    }

    // Recalculate total atomically
    const updatedOrder = await recalculateOrderTotal(callId);

    logger.info('Item added to cart', {
      callId,
      orderId: updatedOrder._id,
      itemName,
      quantity,
      newTotal: updatedOrder.total,
      duration: `${Date.now() - startTime}ms`,
    });

    return {
      success: true,
      data: {
        message: `הוספתי ${quantity}x ${menuItem.name} ב ${menuItem.price} שקלים. סה״כ: ${updatedOrder.total} שקלים`,
        order: updatedOrder,
        cart: updatedOrder.items,  // Simple cart array for session context
        addedItem: {
          name: menuItem.name,
          quantity,
          price: menuItem.price,
        },
      },
    };
  } catch (error) {
    logger.error('Error in addToCart', {
      error: error.message,
      callId,
      itemName,
      quantity,
      restaurantId: restaurant?._id,
    });

    return {
      success: false,
      error: `שגיאה בהוספה לעגלה: ${error.message}`,
      errorType: 'DATABASE_ERROR',
    };
  }
}

/**
 * Update cart items (replace entire cart or clear if empty array)
 *
 * @param {Object} params
 * @param {Array<{name: string, quantity: number}>} params.items - New cart items
 * @param {string} params.callId - Call ID from Vapi webhook
 * @param {Object} params.restaurant - Restaurant object from middleware
 *
 * @returns {Promise<Object>}
 * Success: { success: true, data: { message: string, order: Order, summary: {...} } }
 * Error: { success: false, error: string, errorType: string }
 */
async function updateCart({ items, callId, restaurant }) {
  const startTime = Date.now();

  try {
    // Validate inputs
    if (!Array.isArray(items)) {
      return {
        success: false,
        error: 'Items must be an array',
        errorType: 'VALIDATION_ERROR',
      };
    }

    if (!callId) {
      return {
        success: false,
        error: 'Call ID required',
        errorType: 'VALIDATION_ERROR',
      };
    }

    if (!restaurant) {
      return {
        success: false,
        error: 'Restaurant not found',
        errorType: 'VALIDATION_ERROR',
      };
    }

    // Get Order for this call
    const order = await Order.findOne({ callId, status: 'in_progress' });
    if (!order) {
      return {
        success: false,
        error: 'לא נמצאה הזמנה פעילה. אנא הוסף פריטים לעגלה תחילה',
        errorType: 'ORDER_NOT_FOUND',
      };
    }

    // If empty array, clear cart
    if (items.length === 0) {
      order.items = [];
      order.total = 0;
      await order.save();

      logger.info('Cart cleared', {
        callId,
        orderId: order._id,
        duration: `${Date.now() - startTime}ms`,
      });

      return {
        success: true,
        data: {
          message: 'העגלה נוקתה',
          order,
          summary: {
            items: [],
            total: 0,
            itemCount: 0,
          },
        },
      };
    }

    // Validate all items exist and are in stock
    const validatedItems = [];
    for (const item of items) {
      if (!item.name || typeof item.quantity !== 'number') {
        return {
          success: false,
          error: `פריט לא תקין: ${JSON.stringify(item)}`,
          errorType: 'VALIDATION_ERROR',
        };
      }

      if (item.quantity === 0) {
        // Skip items with quantity 0 (they'll be removed)
        continue;
      }

      const menuItem = await KnowledgeBase.findOne({
        type: 'menu',
        restaurantId: restaurant._id,
        name: item.name,
      });

      if (!menuItem) {
        return {
          success: false,
          error: `פריט לא נמצא: ${item.name}`,
          errorType: 'ITEM_NOT_FOUND',
        };
      }

      if (!menuItem.inStock) {
        return {
          success: false,
          error: `הפריט לא זמין: ${item.name}`,
          errorType: 'ITEM_OUT_OF_STOCK',
        };
      }

      validatedItems.push({
        name: menuItem.name,
        quantity: item.quantity,
        price: menuItem.price,
        category: menuItem.category,
      });
    }

    // Update order items
    order.items = validatedItems;
    order.total = validatedItems.reduce(
      (sum, item) => sum + item.price * item.quantity,
      0
    );
    await order.save();

    logger.info('Cart updated', {
      callId,
      orderId: order._id,
      itemCount: validatedItems.length,
      newTotal: order.total,
      duration: `${Date.now() - startTime}ms`,
    });

    return {
      success: true,
      data: {
        message: 'העגלה עודכנה',
        order,
        summary: {
          items: validatedItems,
          total: order.total,
          itemCount: validatedItems.length,
        },
      },
    };
  } catch (error) {
    logger.error('Error in updateCart', {
      error: error.message,
      callId,
      restaurantId: restaurant?._id,
    });

    return {
      success: false,
      error: `שגיאה בעדכון העגלה: ${error.message}`,
      errorType: 'DATABASE_ERROR',
    };
  }
}

/**
 * Finalize order with customer details
 *
 * @param {Object} params
 * @param {string} params.callId - Call ID from Vapi webhook
 * @param {Object} params.restaurant - Restaurant object from middleware
 * @param {string} params.customerName - Customer full name
 * @param {string} params.phoneNumber - Customer phone number
 * @param {string} params.paymentType - "delivery" | "pickup"
 * @param {string} [params.deliveryAddress] - Required if paymentType is "delivery"
 *
 * @returns {Promise<Object>}
 * Success: { success: true, data: { message: string, order: Order, summary: {...} } }
 * Error: { success: false, error: string, errorType: string }
 */
async function placeOrder({
  callId,
  restaurant,
  customerName,
  phoneNumber,
  paymentType,
  deliveryAddress,
}) {
  const startTime = Date.now();

  try {
    // Validate inputs
    if (!callId) {
      return {
        success: false,
        error: 'Call ID required',
        errorType: 'VALIDATION_ERROR',
      };
    }

    if (!restaurant) {
      return {
        success: false,
        error: 'Restaurant not found',
        errorType: 'VALIDATION_ERROR',
      };
    }

    // Get in-progress Order for this call
    const order = await Order.findOne({ callId, status: 'in_progress' });
    if (!order) {
      return {
        success: false,
        error: 'לא נמצאה הזמנה פעילה. אנא הוסף פריטים לעגלה תחילה',
        errorType: 'ORDER_NOT_FOUND',
      };
    }

    // Validate cart is not empty
    if (!order.items || order.items.length === 0) {
      return {
        success: false,
        error: 'העגלה ריקה. אנא הוסף פריטים לפני ביצוע הזמנה',
        errorType: 'EMPTY_CART',
      };
    }

    // Sanitize and validate inputs
    const sanitizedCustomerName = sanitizeCustomerName(customerName);
    const sanitizedPhoneNumber = sanitizePhoneNumber(phoneNumber);

    // Validate delivery address for delivery orders
    let sanitizedAddress = null;
    if (paymentType === 'delivery') {
      if (!deliveryAddress) {
        return {
          success: false,
          error: 'כתובת המשלוח נדרשת להזמנת משלוח',
          errorType: 'VALIDATION_ERROR',
        };
      }
      sanitizedAddress = sanitizeDeliveryAddress(deliveryAddress);
    }

    // Validate items are still in stock (final check)
    for (const item of order.items) {
      const menuItem = await KnowledgeBase.findOne({
        type: 'menu',
        restaurantId: restaurant._id,
        name: item.name,
      });

      if (!menuItem) {
        return {
          success: false,
          error: `פריט לא נמצא: ${item.name}`,
          errorType: 'ITEM_NOT_FOUND',
        };
      }

      if (!menuItem.inStock) {
        return {
          success: false,
          error: `הפריט אזל מהמלאי: ${item.name}`,
          errorType: 'ITEM_OUT_OF_STOCK',
        };
      }

      // SERVER-SIDE PRICE VALIDATION (Critical security)
      if (item.price !== menuItem.price) {
        return {
          success: false,
          error: `אי-התאמה במחיר עבור ${item.name}. אנא נסה שוב`,
          errorType: 'PRICE_MISMATCH',
        };
      }
    }

    // Calculate items subtotal
    const itemsSubtotal = order.items.reduce(
      (sum, item) => sum + item.price * item.quantity,
      0
    );

    // Add delivery fee if applicable
    let finalTotal = itemsSubtotal;
    let deliveryFee = 0;
    if (paymentType === 'delivery') {
      deliveryFee = restaurant.settings?.deliveryFee || 0;
      finalTotal += deliveryFee;
      logger.info('Added delivery fee to total', {
        itemsSubtotal,
        deliveryFee,
        finalTotal,
      });
    }

    // Update Order with customer info and finalize
    // Save to both individual fields (backward compatibility) AND customer object
    order.customerName = sanitizedCustomerName;
    order.phoneNumber = sanitizedPhoneNumber;
    order.paymentType = paymentType;
    order.deliveryAddress = sanitizedAddress;
    
    // Also save to customer object (unified structure)
    order.customer = {
      name: sanitizedCustomerName,
      phoneNumber: sanitizedPhoneNumber,
      deliveryAddress: sanitizedAddress,
    };
    
    order.total = finalTotal;
    order.status = 'pending_payment';

    await order.save();

    // Log the final order details
    logger.info('✅ ORDER PLACED SUCCESSFULLY', {
      orderId: order._id,
      callId,
      restaurant: restaurant.name,
      customerName: sanitizedCustomerName,
      phoneNumber: sanitizedPhoneNumber,
      items: order.items.map((item) => ({
        name: item.name,
        quantity: item.quantity,
        price: item.price,
        subtotal: item.price * item.quantity,
      })),
      itemsSubtotal,
      finalTotal,
      paymentType,
      deliveryAddress: sanitizedAddress,
      status: order.status,
      duration: `${Date.now() - startTime}ms`,
    });

    // Print formatted order to console
    console.log('\n' + '='.repeat(80));
    console.log('📋 ORDER RECEIVED');
    console.log('='.repeat(80));
    console.log(`Restaurant: ${restaurant.name}`);
    console.log(`Order ID: ${order._id}`);
    console.log(`Call ID: ${callId}`);
    console.log(`Customer: ${sanitizedCustomerName}`);
    console.log(`Phone: ${sanitizedPhoneNumber}`);
    console.log(`Type: ${paymentType}`);
    if (sanitizedAddress) {
      console.log(`Delivery Address: ${sanitizedAddress}`);
    }
    console.log('\nItems:');
    order.items.forEach((item, index) => {
      console.log(
        `  ${index + 1}. ${item.name} x${item.quantity} - ${item.price}₪ each (${
          item.quantity * item.price
        }₪)`
      );
    });
    console.log(`\nSubtotal: ${itemsSubtotal}₪`);
    if (paymentType === 'delivery') {
      console.log(`Delivery Fee: ${deliveryFee}₪`);
    }
    console.log(`Total: ${finalTotal}₪`);
    console.log('='.repeat(80) + '\n');

    return {
      success: true,
      data: {
        message: `ההזמנה נקלטה בהצלחה! מספר הזמנה: ${order._id}. תודה רבה!`,
        order,
        summary: {
          orderId: order._id,
          total: finalTotal,
          itemsSubtotal,
          deliveryFee: paymentType === 'delivery' ? deliveryFee : 0,
          items: order.items,
        },
      },
    };
  } catch (error) {
    logger.error('Error in placeOrder', {
      error: error.message,
      callId,
      restaurantId: restaurant?._id,
    });

    return {
      success: false,
      error: `שגיאה בהזמנה: ${error.message}. אנא נסה שוב או התקשר לייצוג אנושי.`,
      errorType: 'DATABASE_ERROR',
    };
  }
}

/**
 * Extract customer details from natural language message using GPT-4o-mini
 *
 * @param {Object} params
 * @param {string} params.userMessage - Customer's message in Hebrew
 * @param {Object} [params.currentContext] - Current customer context (for incremental updates)
 *
 * @returns {Promise<Object>}
 * Success: {
 *   success: true,
 *   data: {
 *     extracted: { customerName?, phoneNumber?, deliveryAddress?, deliveryType? },
 *     validated: { ... sanitized versions ... },
 *     confidence: number (0-1),
 *     fieldsFound: string[]
 *   }
 * }
 * Error: { success: false, error: string, errorType: string }
 */
async function extractCustomerDetails({ userMessage, currentContext = {} }) {
  const startTime = Date.now();

  try {
    // Validate input
    if (!userMessage || typeof userMessage !== 'string') {
      return {
        success: false,
        error: 'User message is required',
        errorType: 'VALIDATION_ERROR',
      };
    }

    // Build system prompt for GPT
    const systemPrompt = `אתה עוזר חכם שמחלץ פרטי לקוח מהודעות בעברית.

המשימה שלך: לחלץ את הפרטים הבאים מההודעה:
1. שם מלא (customerName) - כולל שמות כמו "יהב בן הרוש" (פורמט: שם פרטי + בן/בת + שם משפחה)
   דוגמאות: "יהב בן הרוש", "דוד כהן", "שרה בת לוי"
   ⚠️ חשוב: שמור את כל השם כולל "בן" או "בת" (לדוגמה: "יהב בן הרוש" לא רק "יהב")
2. מספר טלפון (phoneNumber) - פורמטים אפשריים: 050-1234567, 0501234567, +972501234567
   ⚠️ חשוב: אם המספר מופיע ספרה-ספרה (כמו "9 7 2 5 0 6 7 7"), חבר את כל הספרות למספר אחד
3. כתובת משלוח (deliveryAddress) - רחוב, מספר בית, עיר
   דוגמאות: "בורוכוב 3 קריית אתא", "רחוב הרצל 5 תל אביב", "בורוכוב שלוש קריית אתא"
   ⚠️ חשוב: כלול את כל הכתובת: רחוב + מספר + עיר (אם מופיע)
4. סוג הזמנה (deliveryType) - "delivery" למשלוח או "pickup" לאיסוף עצמי

חוקים:
- אם פרט לא מופיע בהודעה, החזר null
- אל תנחש או תמציא מידע
- מספר טלפון חייב להיות 9-10 ספרות לפחות (אחרי חיבור ספרות אם נאמר ספרה-ספרה)
- כתובת חייבת לכלול רחוב ומספר בית (אם מופיעים)
- סוג הזמנה: זהה מילות מפתח כמו "משלוח", "דליברי", "תביאו", "איסוף", "אאסוף"
- אם המספר נאמר ספרה-ספרה, חבר את כל הספרות למספר אחד (לדוגמה: "9 7 2 5 0 6 7 7" → "972-50-67677")
- אם הלקוח אומר "ואמרתי לך בורוכוב שלוש קריית אתא", חלץ: "בורוכוב 3 קריית אתא"

החזר תשובה במבנה JSON בלבד:
{
  "customerName": "שם מלא או null",
  "phoneNumber": "מספר טלפון בפורמט 05X-XXXXXXX או null",
  "deliveryAddress": "כתובת מלאה או null",
  "deliveryType": "delivery או pickup או null",
  "confidence": 0.0-1.0
}`;

    // Build user prompt with context
    let userPrompt = `הודעה מהלקוח: "${userMessage}"`;

    if (Object.keys(currentContext).length > 0) {
      userPrompt += '\n\nמידע קיים:';
      if (currentContext.customerName) {
        userPrompt += `\nשם קיים: ${currentContext.customerName}`;
      }
      if (currentContext.phoneNumber) {
        userPrompt += `\nטלפון קיים: ${currentContext.phoneNumber}`;
      }
      if (currentContext.deliveryAddress) {
        userPrompt += `\nכתובת קיימת: ${currentContext.deliveryAddress}`;
      }
      if (currentContext.deliveryType) {
        userPrompt += `\nסוג הזמנה קיים: ${currentContext.deliveryType}`;
      }
      userPrompt += '\n\nאנא חלץ פרטים חדשים או מעודכנים מההודעה הנוכחית.';
    }

    // Call OpenAI API
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.1, // Low temperature for consistent extraction
      max_tokens: 300,
    });

    // Parse response
    const content = response.choices[0].message.content;
    let extracted;
    try {
      extracted = JSON.parse(content);
    } catch (parseError) {
      logger.error('Failed to parse GPT response', {
        content,
        error: parseError.message,
      });
      return {
        success: false,
        error: 'שגיאה בעיבוד התשובה מהמערכת',
        errorType: 'INVALID_JSON',
      };
    }

    // Validate and sanitize extracted fields
    const validated = {};
    const fieldsFound = [];
    const validationErrors = [];

    // customerName
    if (extracted.customerName && extracted.customerName !== 'null') {
      try {
        validated.customerName = sanitizeCustomerName(extracted.customerName);
        fieldsFound.push('customerName');
      } catch (error) {
        validationErrors.push(`customerName: ${error.message}`);
      }
    }

    // phoneNumber - handle digit-by-digit format
    if (extracted.phoneNumber && extracted.phoneNumber !== 'null') {
      try {
        // If phone number contains spaces or is digit-by-digit, clean it first
        let phoneToSanitize = extracted.phoneNumber;
        
        // Remove spaces, dots, question marks - keep only digits and +/-
        phoneToSanitize = phoneToSanitize.replace(/[^\d+\-]/g, '');
        
        // If it's a sequence of digits without proper formatting, try to format it
        if (/^\d{9,12}$/.test(phoneToSanitize)) {
          // 9-10 digits: Israeli format
          if (phoneToSanitize.length === 9 || phoneToSanitize.length === 10) {
            if (phoneToSanitize.startsWith('0')) {
              // Format: 05X-XXXXXXX
              if (phoneToSanitize.length === 10) {
                phoneToSanitize = `${phoneToSanitize.slice(0, 3)}-${phoneToSanitize.slice(3)}`;
              } else {
                phoneToSanitize = `${phoneToSanitize.slice(0, 2)}-${phoneToSanitize.slice(2)}`;
              }
            } else if (phoneToSanitize.startsWith('972')) {
              // International format
              phoneToSanitize = '+' + phoneToSanitize;
            } else {
              // Missing leading zero
              phoneToSanitize = '0' + phoneToSanitize;
              if (phoneToSanitize.length === 10) {
                phoneToSanitize = `${phoneToSanitize.slice(0, 3)}-${phoneToSanitize.slice(3)}`;
              }
            }
          } else if (phoneToSanitize.length === 12 && phoneToSanitize.startsWith('972')) {
            // International format: 972501234567
            phoneToSanitize = '+' + phoneToSanitize;
          }
        }
        
        validated.phoneNumber = sanitizePhoneNumber(phoneToSanitize);
        fieldsFound.push('phoneNumber');
      } catch (error) {
        validationErrors.push(`phoneNumber: ${error.message}`);
      }
    }

    // deliveryAddress
    if (extracted.deliveryAddress && extracted.deliveryAddress !== 'null') {
      try {
        validated.deliveryAddress = sanitizeDeliveryAddress(
          extracted.deliveryAddress
        );
        fieldsFound.push('deliveryAddress');
      } catch (error) {
        validationErrors.push(`deliveryAddress: ${error.message}`);
      }
    }

    // deliveryType
    if (extracted.deliveryType && extracted.deliveryType !== 'null') {
      if (['delivery', 'pickup'].includes(extracted.deliveryType)) {
        validated.deliveryType = extracted.deliveryType;
        fieldsFound.push('deliveryType');
      } else {
        validationErrors.push(
          `deliveryType: Invalid value "${extracted.deliveryType}"`
        );
      }
    }

    logger.info('Customer details extracted', {
      userMessage: userMessage.substring(0, 100),
      fieldsFound,
      confidence: extracted.confidence || 0,
      validationErrors,
      duration: `${Date.now() - startTime}ms`,
    });

    return {
      success: true,
      data: {
        extracted: {
          customerName: extracted.customerName || null,
          phoneNumber: extracted.phoneNumber || null,
          deliveryAddress: extracted.deliveryAddress || null,
          deliveryType: extracted.deliveryType || null,
        },
        validated,
        confidence: extracted.confidence || 0,
        fieldsFound,
        validationErrors:
          validationErrors.length > 0 ? validationErrors : undefined,
      },
    };
  } catch (error) {
    logger.error('Error in extractCustomerDetails', {
      error: error.message,
      userMessage: userMessage?.substring(0, 100),
    });

    return {
      success: false,
      error: `שגיאה בחילוץ פרטי לקוח: ${error.message}`,
      errorType: 'OPENAI_API_ERROR',
    };
  }
}

/**
 * Search menu using RAG (vector similarity)
 *
 * @param {Object} params - Function parameters
 * @param {string} params.query - User's search query (e.g., "המבורגר", "שקשוקה")
 * @param {ObjectId} params.restaurantId - Restaurant ID
 * @returns {Promise<Object>} { success: true, data: [...menu items] }
 */
async function searchMenu({ query, restaurantId }) {
  try {
    const ragSearch = require('./ragSearch');

    const results = await ragSearch.searchMenu(query, restaurantId, {
      topK: 5,
      inStockOnly: true
    });

    logger.info('Menu search via RAG', {
      query,
      restaurantId,
      resultsCount: results.length
    });

    return {
      success: true,
      data: results
    };
  } catch (error) {
    logger.error('searchMenu failed', {
      error: error.message,
      query,
      restaurantId
    });

    return {
      success: false,
      error: 'Failed to search menu',
      errorType: 'search_error'
    };
  }
}

// ============================================================================
// EXPORTS
// ============================================================================

module.exports = {
  // Main functions
  getCartSummary,
  addToCart,
  addMultipleItemsToCart,
  updateCart,
  placeOrder,
  extractCustomerDetails,
  searchMenu,

  // Helper functions (exported for testing and reuse)
  calculateTotal,
  formatCartForDisplay,
  validatePhone,
  validateAddress,
};
