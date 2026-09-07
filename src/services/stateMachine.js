const logger = require('../utils/logger');

/**
 * State Machine for Restaurant Phone Agent
 *
 * Orchestrates conversation flow across 5 states using 7 intents.
 * Determines state transitions, function execution, and context validation.
 *
 * 5 States:
 * - GREETING: Initial greeting, restaurant intro
 * - COLLECTING_ORDER: Taking menu items, building cart
 * - COLLECTING_DETAILS: Gathering customer info (name, address, phone)
 * - CONFIRMING_ORDER: Final confirmation before placement
 * - ORDER_PLACED: Order successfully placed (terminal state)
 *
 * 7 Intents (from intentClassifier.js):
 * - order_taking: Customer ordering from menu
 * - general_info: Restaurant questions
 * - cart_update: Modify cart contents
 * - provide_details: Customer providing personal details
 * - confirm_order: Ready to finalize order
 * - cancel_order: Customer wants to cancel
 * - transfer: Customer wants human agent
 */

// ============================================================================
// CONSTANTS
// ============================================================================

const VALID_STATES = [
  'GREETING',
  'COLLECTING_ORDER',
  'COLLECTING_DETAILS',
  'CONFIRMING_ORDER',
  'ORDER_PLACED'
];

const VALID_INTENTS = [
  'order_taking',
  'general_info',
  'cart_update',
  'provide_details',
  'confirm_order',
  'cancel_order',
  'transfer'
];

/**
 * Global Intents
 * These intents can be triggered from ANY state and have consistent behavior
 * Similar to Vapi's global nodes concept
 */
const GLOBAL_INTENTS = [
  'cart_update',      // Can modify cart from anywhere
  'general_info',     // Can ask questions anytime
  'cancel_order',     // Can cancel from anywhere
  'transfer'          // Can request human transfer anytime
];

/**
 * Global Intent Transitions
 * Defines state transitions for global intents
 * - 'SAME': Stay in current state
 * - Specific state: Transition to that state
 */
const GLOBAL_TRANSITIONS = {
  cart_update: 'SAME',         // Stay in current state, allow cart modification
  general_info: 'SAME',        // Stay in current state, answer question
  cancel_order: 'ORDER_PLACED', // Cancel and end conversation
  transfer: 'ORDER_PLACED'      // Transfer to human, end AI conversation
};

/**
 * State Transition Matrix
 * Maps (currentState, intent) → nextState
 * Only includes NON-GLOBAL intents (global intents handled separately)
 */
const TRANSITION_MAP = {
  // GREETING state transitions
  'GREETING:order_taking': 'COLLECTING_ORDER',
  'GREETING:provide_details': 'GREETING',  // Ignore details in greeting
  'GREETING:confirm_order': 'GREETING',    // Nothing to confirm yet

  // COLLECTING_ORDER state transitions
  'COLLECTING_ORDER:order_taking': 'COLLECTING_ORDER',
  'COLLECTING_ORDER:provide_details': 'COLLECTING_DETAILS',
  'COLLECTING_ORDER:confirm_order': 'COLLECTING_DETAILS',

  // COLLECTING_DETAILS state transitions
  'COLLECTING_DETAILS:order_taking': 'COLLECTING_ORDER',  // Go back to ordering
  'COLLECTING_DETAILS:provide_details': 'COLLECTING_DETAILS',
  'COLLECTING_DETAILS:confirm_order': 'CONFIRMING_ORDER',

  // CONFIRMING_ORDER state transitions
  'CONFIRMING_ORDER:order_taking': 'COLLECTING_ORDER',  // Go back to ordering
  'CONFIRMING_ORDER:provide_details': 'COLLECTING_DETAILS',
  'CONFIRMING_ORDER:confirm_order': 'ORDER_PLACED',

  // ORDER_PLACED is terminal - non-global intents stay in ORDER_PLACED
  'ORDER_PLACED:order_taking': 'ORDER_PLACED',
  'ORDER_PLACED:provide_details': 'ORDER_PLACED',
  'ORDER_PLACED:confirm_order': 'ORDER_PLACED'
};

/**
 * Global Intent Function Mapping
 * Maps global intents → array of tool handler function names
 * These functions are called regardless of current state
 */
const GLOBAL_FUNCTIONS = {
  cart_update: ['update_cart'],
  general_info: [],  // No function needed, RAG provides info
  cancel_order: [],  // No function needed, just transition
  transfer: ['redirect_to_human']
};

/**
 * State-Specific Function Mapping
 * Maps (state, intent) → array of tool handler function names
 * Only includes NON-GLOBAL intents
 */
const FUNCTION_MAP = {
  // GREETING state functions
  'GREETING:order_taking': ['search_menu'],

  // COLLECTING_ORDER state functions
  'COLLECTING_ORDER:order_taking': ['search_menu', 'add_to_cart'],
  'COLLECTING_ORDER:confirm_order': ['get_cart_summary'],

  // COLLECTING_DETAILS state functions
  'COLLECTING_DETAILS:order_taking': ['search_menu', 'add_to_cart'],
  'COLLECTING_DETAILS:confirm_order': ['get_cart_summary'],

  // CONFIRMING_ORDER state functions
  'CONFIRMING_ORDER:order_taking': ['search_menu'],
  'CONFIRMING_ORDER:confirm_order': ['place_order']

  // ORDER_PLACED: No functions (terminal state)
  // GLOBAL intents: Handled in GLOBAL_FUNCTIONS
};

/**
 * State Completion Requirements
 * Defines required fields and validation rules for each state
 */
const STATE_REQUIREMENTS = {
  GREETING: {
    requiredFields: [],
    validationRules: []
  },

  COLLECTING_ORDER: {
    requiredFields: ['cart'],
    validationRules: [
      {
        field: 'cart',
        validator: (cart) => Array.isArray(cart) && cart.length > 0,
        errorMessage: 'Cart must have at least one item'
      }
    ]
  },

  COLLECTING_DETAILS: {
    requiredFields: ['cart', 'customerName', 'phoneNumber', 'deliveryType'],
    validationRules: [
      {
        field: 'cart',
        validator: (cart) => Array.isArray(cart) && cart.length > 0,
        errorMessage: 'Cart must have at least one item'
      },
      {
        field: 'customerName',
        validator: (name) => typeof name === 'string' && name.trim().length > 0,
        errorMessage: 'Customer name is required'
      },
      {
        field: 'phoneNumber',
        validator: (phone) => {
          if (typeof phone !== 'string') return false;
          const digits = phone.replace(/\D/g, '');
          return digits.length >= 9;
        },
        errorMessage: 'Valid phone number is required (min 9 digits)'
      },
      {
        field: 'deliveryType',
        validator: (type) => type === 'delivery' || type === 'pickup',
        errorMessage: 'Delivery type must be "delivery" or "pickup"'
      },
      {
        field: 'deliveryAddress',
        validator: (address, context) => {
          // Only required for delivery orders
          if (context.deliveryType === 'delivery') {
            return typeof address === 'string' && address.trim().length > 10;
          }
          return true; // Not required for pickup
        },
        errorMessage: 'Delivery address required for delivery orders (min 10 characters)'
      }
    ]
  },

  CONFIRMING_ORDER: {
    // Same requirements as COLLECTING_DETAILS
    requiredFields: ['cart', 'customerName', 'phoneNumber', 'deliveryType'],
    validationRules: [
      {
        field: 'cart',
        validator: (cart) => Array.isArray(cart) && cart.length > 0,
        errorMessage: 'Cart must have at least one item'
      },
      {
        field: 'customerName',
        validator: (name) => typeof name === 'string' && name.trim().length > 0,
        errorMessage: 'Customer name is required'
      },
      {
        field: 'phoneNumber',
        validator: (phone) => {
          if (typeof phone !== 'string') return false;
          const digits = phone.replace(/\D/g, '');
          return digits.length >= 9;
        },
        errorMessage: 'Valid phone number is required (min 9 digits)'
      },
      {
        field: 'deliveryType',
        validator: (type) => type === 'delivery' || type === 'pickup',
        errorMessage: 'Delivery type must be "delivery" or "pickup"'
      },
      {
        field: 'deliveryAddress',
        validator: (address, context) => {
          if (context.deliveryType === 'delivery') {
            return typeof address === 'string' && address.trim().length > 10;
          }
          return true;
        },
        errorMessage: 'Delivery address required for delivery orders (min 10 characters)'
      }
    ]
  },

  ORDER_PLACED: {
    requiredFields: [],
    validationRules: []
  }
};

// ============================================================================
// STATE MACHINE CLASS
// ============================================================================

class StateMachine {
  constructor() {
    logger.info('StateMachine initialized', {
      states: VALID_STATES.length,
      intents: VALID_INTENTS.length,
      transitions: Object.keys(TRANSITION_MAP).length
    });
  }

  /**
   * Determine next state based on current state and intent
   *
   * Global intents are handled first and work from any state.
   * State-specific intents are handled via TRANSITION_MAP.
   *
   * @param {string} currentState - Current conversation state
   * @param {string} intent - Classified intent from intentClassifier
   * @param {object} context - Session context (for conditional transitions)
   * @returns {string} Next state to transition to
   */
  transitionState(currentState, intent, context = {}) {
    // Validate inputs
    if (!VALID_STATES.includes(currentState)) {
      logger.error('Invalid current state', { currentState, validStates: VALID_STATES });
      return currentState; // Stay in current state if invalid
    }

    if (!VALID_INTENTS.includes(intent)) {
      logger.error('Invalid intent', { intent, validIntents: VALID_INTENTS });
      return currentState; // Stay in current state if invalid intent
    }

    // ORDER_PLACED is terminal state - no outgoing transitions
    if (currentState === 'ORDER_PLACED') {
      logger.debug('Already in terminal state ORDER_PLACED', { intent });
      return 'ORDER_PLACED';
    }

    // ========================================================================
    // GLOBAL INTENTS - Handle first, work from any state
    // ========================================================================
    if (GLOBAL_INTENTS.includes(intent)) {
      const globalTransition = GLOBAL_TRANSITIONS[intent];

      if (globalTransition === 'SAME') {
        // Stay in current state
        logger.info('Global intent - staying in current state', {
          currentState,
          intent,
          type: 'global'
        });
        return currentState;
      } else {
        // Transition to specified state
        logger.info('Global intent - transitioning', {
          from: currentState,
          to: globalTransition,
          intent,
          type: 'global'
        });
        return globalTransition;
      }
    }

    // ========================================================================
    // STATE-SPECIFIC INTENTS - Use TRANSITION_MAP
    // ========================================================================
    const transitionKey = `${currentState}:${intent}`;
    const nextState = TRANSITION_MAP[transitionKey];

    if (!nextState) {
      logger.warn('No transition defined', { currentState, intent, transitionKey });
      return currentState; // Default: stay in current state
    }

    // Special handling: COLLECTING_DETAILS → CONFIRMING_ORDER requires complete details
    if (currentState === 'COLLECTING_DETAILS' &&
        nextState === 'CONFIRMING_ORDER' &&
        intent === 'confirm_order') {

      if (!this.isStateComplete('COLLECTING_DETAILS', context)) {
        const missing = this.getMissingFields('COLLECTING_DETAILS', context);
        logger.info('Cannot transition to CONFIRMING_ORDER - missing fields', {
          currentState,
          intent,
          missingFields: missing.map(m => m.field)
        });
        return 'COLLECTING_DETAILS'; // Stay in COLLECTING_DETAILS until complete
      }
    }

    // Log successful transition
    logger.info('State transition', {
      from: currentState,
      to: nextState,
      intent,
      transitionKey
    });

    return nextState;
  }

  /**
   * Get array of tool handler functions to execute
   *
   * Global intents are checked first and return their functions regardless of state.
   * State-specific intents use FUNCTION_MAP.
   *
   * @param {string} currentState - Current conversation state
   * @param {string} intent - Classified intent
   * @returns {string[]} Array of function names to call (in order)
   */
  getFunctionsToExecute(currentState, intent) {
    // Validate inputs
    if (!VALID_STATES.includes(currentState) || !VALID_INTENTS.includes(intent)) {
      logger.warn('Invalid state or intent for function mapping', { currentState, intent });
      return [];
    }

    // Check if this is a global intent first
    if (GLOBAL_INTENTS.includes(intent)) {
      const functions = GLOBAL_FUNCTIONS[intent] || [];
      logger.debug('Functions to execute (global)', {
        currentState,
        intent,
        functions,
        type: 'global'
      });
      return functions;
    }

    // Look up state-specific functions
    const functionKey = `${currentState}:${intent}`;
    const functions = FUNCTION_MAP[functionKey] || [];

    logger.debug('Functions to execute', {
      currentState,
      intent,
      functions,
      type: 'state-specific'
    });

    return functions;
  }

  /**
   * Check if state has all required fields and passes validation
   *
   * @param {string} state - State to validate
   * @param {object} context - Session context with fields to validate
   * @returns {boolean} True if state is complete, false otherwise
   */
  isStateComplete(state, context = {}) {
    if (!VALID_STATES.includes(state)) {
      logger.error('Invalid state for completion check', { state });
      return false;
    }

    const requirements = STATE_REQUIREMENTS[state];
    if (!requirements) {
      logger.warn('No requirements defined for state', { state });
      return true; // No requirements = always complete
    }

    // Check all validation rules
    for (const rule of requirements.validationRules) {
      const fieldValue = context[rule.field];
      const isValid = rule.validator(fieldValue, context);

      if (!isValid) {
        logger.debug('State validation failed', {
          state,
          field: rule.field,
          error: rule.errorMessage
        });
        return false;
      }
    }

    // All validations passed
    logger.debug('State validation passed', { state });
    return true;
  }

  /**
   * Get array of missing or invalid fields for a state
   *
   * @param {string} state - State to validate
   * @param {object} context - Session context
   * @returns {Array<{field: string, error: string}>} Array of validation errors
   */
  getMissingFields(state, context = {}) {
    if (!VALID_STATES.includes(state)) {
      return [{ field: 'state', error: 'Invalid state' }];
    }

    const requirements = STATE_REQUIREMENTS[state];
    if (!requirements) {
      return [];
    }

    const missing = [];

    // Check all validation rules
    for (const rule of requirements.validationRules) {
      const fieldValue = context[rule.field];
      const isValid = rule.validator(fieldValue, context);

      if (!isValid) {
        missing.push({
          field: rule.field,
          error: rule.errorMessage
        });
      }
    }

    return missing;
  }

  /**
   * Get all valid states
   * @returns {string[]} Array of valid state names
   */
  getValidStates() {
    return [...VALID_STATES];
  }

  /**
   * Get all valid intents
   * @returns {string[]} Array of valid intent names
   */
  getValidIntents() {
    return [...VALID_INTENTS];
  }

  /**
   * Get all global intents
   * @returns {string[]} Array of global intent names
   */
  getGlobalIntents() {
    return [...GLOBAL_INTENTS];
  }

  /**
   * Check if intent is global
   * @param {string} intent - Intent to check
   * @returns {boolean} True if intent is global
   */
  isGlobalIntent(intent) {
    return GLOBAL_INTENTS.includes(intent);
  }
}

// Export singleton instance
module.exports = new StateMachine();
