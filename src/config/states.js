/**
 * State Machine State Definitions
 *
 * 5 conversation states for restaurant phone ordering
 *
 * Each state defines:
 * - name: State identifier (matches stateMachine.js)
 * - description: What happens in this state
 * - allowedTransitions: Which states can be reached from here
 * - requiresContext: Required fields in session context
 */

module.exports = {
  GREETING: {
    name: 'GREETING',
    description: 'Initial greeting, restaurant introduction',
    allowedTransitions: [
      'COLLECTING_ORDER',  // When user starts ordering
      'ORDER_PLACED'       // When user cancels or transfers
    ],
    requiresContext: []
  },

  COLLECTING_ORDER: {
    name: 'COLLECTING_ORDER',
    description: 'Taking menu items, building cart',
    allowedTransitions: [
      'COLLECTING_ORDER',  // Continue ordering more items
      'COLLECTING_DETAILS', // When ready to provide details
      'ORDER_PLACED'       // When user cancels or transfers
    ],
    requiresContext: ['cart']  // Must have at least one item in cart
  },

  COLLECTING_DETAILS: {
    name: 'COLLECTING_DETAILS',
    description: 'Gathering customer information (name, phone, address, delivery type)',
    allowedTransitions: [
      'COLLECTING_ORDER',  // Go back to add/modify items
      'COLLECTING_DETAILS', // Continue providing details
      'CONFIRMING_ORDER',  // When all details complete
      'ORDER_PLACED'       // When user cancels or transfers
    ],
    requiresContext: [
      'cart',
      'customerName',
      'phoneNumber',
      'deliveryType'
      // deliveryAddress (conditional: only required if deliveryType === 'delivery')
    ]
  },

  CONFIRMING_ORDER: {
    name: 'CONFIRMING_ORDER',
    description: 'Final confirmation before placing order',
    allowedTransitions: [
      'COLLECTING_ORDER',  // Go back to modify cart
      'COLLECTING_DETAILS', // Go back to change details
      'CONFIRMING_ORDER',  // Stay for more questions
      'ORDER_PLACED'       // Confirm, cancel, or transfer
    ],
    requiresContext: [
      'cart',
      'customerName',
      'phoneNumber',
      'deliveryType'
      // deliveryAddress (conditional: only required if deliveryType === 'delivery')
    ]
  },

  ORDER_PLACED: {
    name: 'ORDER_PLACED',
    description: 'Order successfully placed (terminal state)',
    allowedTransitions: [],  // Terminal state - no outgoing transitions
    requiresContext: []
  }
};
