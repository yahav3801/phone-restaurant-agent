/**
 * Input validation and sanitization utilities
 */

/**
 * Sanitize string input to prevent NoSQL injection
 * Removes special MongoDB operators and dangerous characters
 */
function sanitizeString(input) {
  if (typeof input !== "string") {
    return input;
  }

  // Remove MongoDB operators
  const dangerous = ["$", "{", "}", "[", "]", "(", ")", ";", '"', "'", "\\"];
  let sanitized = input;

  dangerous.forEach((char) => {
    sanitized = sanitized.replace(new RegExp("\\" + char, "g"), "");
  });

  // Trim whitespace
  sanitized = sanitized.trim();

  // Limit length
  if (sanitized.length > 500) {
    sanitized = sanitized.substring(0, 500);
  }

  return sanitized;
}

/**
 * Validate and sanitize Israeli phone number
 * Accepts formats: +972501234567, 0501234567, 972501234567
 */
function sanitizePhoneNumber(phone) {
  if (!phone || typeof phone !== "string") {
    throw new Error("Invalid phone number format");
  }

  // Remove all non-digit characters except +
  let cleaned = phone.replace(/[^\d+]/g, "");

  // Handle different formats
  if (cleaned.startsWith("+972")) {
    // International format: +972501234567
    return cleaned;
  } else if (cleaned.startsWith("972")) {
    // International without +: 972501234567
    return "+" + cleaned;
  } else if (cleaned.startsWith("0")) {
    // Local format: 0501234567
    return "+972" + cleaned.substring(1);
  } else if (cleaned.length === 9) {
    // Missing leading zero: 501234567
    return "+972" + cleaned;
  }

  throw new Error("Invalid Israeli phone number format");
}

/**
 * Validate order items structure
 * Ensures each item has required fields and valid types
 */
function validateOrderItems(items) {
  if (!Array.isArray(items) || items.length === 0) {
    throw new Error("Order must contain at least one item");
  }

  if (items.length > 50) {
    throw new Error("Order cannot contain more than 50 items");
  }

  items.forEach((item, index) => {
    // Check required fields
    if (!item.name || typeof item.name !== "string") {
      throw new Error(`Item ${index + 1}: name is required and must be a string`);
    }

    if (typeof item.price !== "number" || item.price < 0) {
      throw new Error(`Item ${index + 1}: price must be a positive number`);
    }

    if (typeof item.quantity !== "number" || item.quantity < 1 || !Number.isInteger(item.quantity)) {
      throw new Error(`Item ${index + 1}: quantity must be a positive integer`);
    }

    // Sanitize string fields
    item.name = sanitizeString(item.name);

    if (item.notes) {
      item.notes = sanitizeString(item.notes);
    }

    // Validate reasonable values
    if (item.price > 10000) {
      throw new Error(`Item ${index + 1}: price seems unreasonably high`);
    }

    if (item.quantity > 100) {
      throw new Error(`Item ${index + 1}: quantity seems unreasonably high`);
    }
  });

  return items;
}

/**
 * Validate and sanitize customer name
 */
function sanitizeCustomerName(name) {
  if (!name || typeof name !== "string") {
    throw new Error("Customer name is required");
  }

  let sanitized = sanitizeString(name);

  if (sanitized.length < 2) {
    throw new Error("Customer name must be at least 2 characters");
  }

  if (sanitized.length > 100) {
    sanitized = sanitized.substring(0, 100);
  }

  return sanitized;
}

/**
 * Validate and sanitize delivery address
 */
function sanitizeDeliveryAddress(address) {
  if (!address || typeof address !== "string") {
    throw new Error("Delivery address is required for delivery orders");
  }

  let sanitized = sanitizeString(address);

  if (sanitized.length < 5) {
    throw new Error("Delivery address must be at least 5 characters");
  }

  if (sanitized.length > 500) {
    sanitized = sanitized.substring(0, 500);
  }

  return sanitized;
}

/**
 * Validate MongoDB ObjectId format
 */
function isValidObjectId(id) {
  if (!id || typeof id !== "string") {
    return false;
  }

  // MongoDB ObjectId is 24 hex characters
  return /^[0-9a-fA-F]{24}$/.test(id);
}

module.exports = {
  sanitizeString,
  sanitizePhoneNumber,
  validateOrderItems,
  sanitizeCustomerName,
  sanitizeDeliveryAddress,
  isValidObjectId,
};
