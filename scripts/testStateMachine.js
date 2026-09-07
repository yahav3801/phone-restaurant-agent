/**
 * Comprehensive Test Suite for State Machine
 *
 * Tests all 35 state transitions, function mappings, and validation rules
 *
 * Run: node scripts/testStateMachine.js
 */

const stateMachine = require('../src/services/stateMachine');

// ============================================================================
// TEST UTILITIES
// ============================================================================

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;

function assertEqual(actual, expected, testName) {
  totalTests++;
  if (actual === expected) {
    passedTests++;
    console.log(`✅ PASS: ${testName}`);
    return true;
  } else {
    failedTests++;
    console.log(`❌ FAIL: ${testName}`);
    console.log(`   Expected: ${expected}`);
    console.log(`   Actual: ${actual}`);
    return false;
  }
}

function assertArrayEqual(actual, expected, testName) {
  totalTests++;
  const actualStr = JSON.stringify(actual);
  const expectedStr = JSON.stringify(expected);

  if (actualStr === expectedStr) {
    passedTests++;
    console.log(`✅ PASS: ${testName}`);
    return true;
  } else {
    failedTests++;
    console.log(`❌ FAIL: ${testName}`);
    console.log(`   Expected: ${expectedStr}`);
    console.log(`   Actual: ${actualStr}`);
    return false;
  }
}

function assertTrue(actual, testName) {
  totalTests++;
  if (actual === true) {
    passedTests++;
    console.log(`✅ PASS: ${testName}`);
    return true;
  } else {
    failedTests++;
    console.log(`❌ FAIL: ${testName}`);
    console.log(`   Expected: true`);
    console.log(`   Actual: ${actual}`);
    return false;
  }
}

function assertFalse(actual, testName) {
  totalTests++;
  if (actual === false) {
    passedTests++;
    console.log(`✅ PASS: ${testName}`);
    return true;
  } else {
    failedTests++;
    console.log(`❌ FAIL: ${testName}`);
    console.log(`   Expected: false`);
    console.log(`   Actual: ${actual}`);
    return false;
  }
}

function printTestSummary() {
  console.log('\n' + '='.repeat(70));
  console.log('TEST SUMMARY');
  console.log('='.repeat(70));
  console.log(`Total Tests: ${totalTests}`);
  console.log(`✅ Passed: ${passedTests}`);
  console.log(`❌ Failed: ${failedTests}`);
  console.log(`Success Rate: ${((passedTests / totalTests) * 100).toFixed(1)}%`);
  console.log('='.repeat(70) + '\n');

  if (failedTests === 0) {
    console.log('🎉 ALL TESTS PASSED!\n');
    process.exit(0);
  } else {
    console.log('❌ SOME TESTS FAILED\n');
    process.exit(1);
  }
}

// ============================================================================
// TEST 1: STATE TRANSITIONS
// ============================================================================

function testStateTransitions() {
  console.log('\n' + '='.repeat(70));
  console.log('TEST 1: State Transitions (35 combinations)');
  console.log('='.repeat(70) + '\n');

  const emptyContext = {};
  const cartContext = { cart: [{ name: 'Pizza', price: 50 }] };
  const fullContext = {
    cart: [{ name: 'Pizza', price: 50 }],
    customerName: 'John Doe',
    phoneNumber: '0501234567',
    deliveryType: 'delivery',
    deliveryAddress: '123 Main St, Tel Aviv'
  };

  // GREETING state transitions
  assertEqual(
    stateMachine.transitionState('GREETING', 'order_taking', emptyContext),
    'COLLECTING_ORDER',
    'GREETING + order_taking → COLLECTING_ORDER'
  );

  assertEqual(
    stateMachine.transitionState('GREETING', 'general_info', emptyContext),
    'GREETING',
    'GREETING + general_info → GREETING'
  );

  assertEqual(
    stateMachine.transitionState('GREETING', 'cart_update', emptyContext),
    'GREETING',
    'GREETING + cart_update → GREETING'
  );

  assertEqual(
    stateMachine.transitionState('GREETING', 'provide_details', emptyContext),
    'GREETING',
    'GREETING + provide_details → GREETING'
  );

  assertEqual(
    stateMachine.transitionState('GREETING', 'confirm_order', emptyContext),
    'GREETING',
    'GREETING + confirm_order → GREETING'
  );

  assertEqual(
    stateMachine.transitionState('GREETING', 'cancel_order', emptyContext),
    'ORDER_PLACED',
    'GREETING + cancel_order → ORDER_PLACED'
  );

  assertEqual(
    stateMachine.transitionState('GREETING', 'transfer', emptyContext),
    'ORDER_PLACED',
    'GREETING + transfer → ORDER_PLACED'
  );

  // COLLECTING_ORDER state transitions
  assertEqual(
    stateMachine.transitionState('COLLECTING_ORDER', 'order_taking', cartContext),
    'COLLECTING_ORDER',
    'COLLECTING_ORDER + order_taking → COLLECTING_ORDER'
  );

  assertEqual(
    stateMachine.transitionState('COLLECTING_ORDER', 'general_info', cartContext),
    'COLLECTING_ORDER',
    'COLLECTING_ORDER + general_info → COLLECTING_ORDER'
  );

  assertEqual(
    stateMachine.transitionState('COLLECTING_ORDER', 'cart_update', cartContext),
    'COLLECTING_ORDER',
    'COLLECTING_ORDER + cart_update → COLLECTING_ORDER'
  );

  assertEqual(
    stateMachine.transitionState('COLLECTING_ORDER', 'provide_details', cartContext),
    'COLLECTING_DETAILS',
    'COLLECTING_ORDER + provide_details → COLLECTING_DETAILS'
  );

  assertEqual(
    stateMachine.transitionState('COLLECTING_ORDER', 'confirm_order', cartContext),
    'COLLECTING_DETAILS',
    'COLLECTING_ORDER + confirm_order → COLLECTING_DETAILS'
  );

  assertEqual(
    stateMachine.transitionState('COLLECTING_ORDER', 'cancel_order', cartContext),
    'ORDER_PLACED',
    'COLLECTING_ORDER + cancel_order → ORDER_PLACED'
  );

  assertEqual(
    stateMachine.transitionState('COLLECTING_ORDER', 'transfer', cartContext),
    'ORDER_PLACED',
    'COLLECTING_ORDER + transfer → ORDER_PLACED'
  );

  // COLLECTING_DETAILS state transitions
  assertEqual(
    stateMachine.transitionState('COLLECTING_DETAILS', 'order_taking', fullContext),
    'COLLECTING_ORDER',
    'COLLECTING_DETAILS + order_taking → COLLECTING_ORDER'
  );

  assertEqual(
    stateMachine.transitionState('COLLECTING_DETAILS', 'general_info', fullContext),
    'COLLECTING_DETAILS',
    'COLLECTING_DETAILS + general_info → COLLECTING_DETAILS'
  );

  assertEqual(
    stateMachine.transitionState('COLLECTING_DETAILS', 'cart_update', fullContext),
    'COLLECTING_DETAILS',
    'COLLECTING_DETAILS + cart_update → COLLECTING_DETAILS (global)'
  );

  assertEqual(
    stateMachine.transitionState('COLLECTING_DETAILS', 'provide_details', fullContext),
    'COLLECTING_DETAILS',
    'COLLECTING_DETAILS + provide_details → COLLECTING_DETAILS'
  );

  assertEqual(
    stateMachine.transitionState('COLLECTING_DETAILS', 'confirm_order', fullContext),
    'CONFIRMING_ORDER',
    'COLLECTING_DETAILS + confirm_order (complete) → CONFIRMING_ORDER'
  );

  // Test conditional transition: incomplete context should stay in COLLECTING_DETAILS
  const incompleteContext = {
    cart: [{ name: 'Pizza', price: 50 }],
    customerName: 'John Doe'
    // Missing: phoneNumber, deliveryType, deliveryAddress
  };

  assertEqual(
    stateMachine.transitionState('COLLECTING_DETAILS', 'confirm_order', incompleteContext),
    'COLLECTING_DETAILS',
    'COLLECTING_DETAILS + confirm_order (incomplete) → COLLECTING_DETAILS'
  );

  assertEqual(
    stateMachine.transitionState('COLLECTING_DETAILS', 'cancel_order', fullContext),
    'ORDER_PLACED',
    'COLLECTING_DETAILS + cancel_order → ORDER_PLACED'
  );

  assertEqual(
    stateMachine.transitionState('COLLECTING_DETAILS', 'transfer', fullContext),
    'ORDER_PLACED',
    'COLLECTING_DETAILS + transfer → ORDER_PLACED'
  );

  // CONFIRMING_ORDER state transitions
  assertEqual(
    stateMachine.transitionState('CONFIRMING_ORDER', 'order_taking', fullContext),
    'COLLECTING_ORDER',
    'CONFIRMING_ORDER + order_taking → COLLECTING_ORDER'
  );

  assertEqual(
    stateMachine.transitionState('CONFIRMING_ORDER', 'general_info', fullContext),
    'CONFIRMING_ORDER',
    'CONFIRMING_ORDER + general_info → CONFIRMING_ORDER'
  );

  assertEqual(
    stateMachine.transitionState('CONFIRMING_ORDER', 'cart_update', fullContext),
    'CONFIRMING_ORDER',
    'CONFIRMING_ORDER + cart_update → CONFIRMING_ORDER (global)'
  );

  assertEqual(
    stateMachine.transitionState('CONFIRMING_ORDER', 'provide_details', fullContext),
    'COLLECTING_DETAILS',
    'CONFIRMING_ORDER + provide_details → COLLECTING_DETAILS'
  );

  assertEqual(
    stateMachine.transitionState('CONFIRMING_ORDER', 'confirm_order', fullContext),
    'ORDER_PLACED',
    'CONFIRMING_ORDER + confirm_order → ORDER_PLACED'
  );

  assertEqual(
    stateMachine.transitionState('CONFIRMING_ORDER', 'cancel_order', fullContext),
    'ORDER_PLACED',
    'CONFIRMING_ORDER + cancel_order → ORDER_PLACED'
  );

  assertEqual(
    stateMachine.transitionState('CONFIRMING_ORDER', 'transfer', fullContext),
    'ORDER_PLACED',
    'CONFIRMING_ORDER + transfer → ORDER_PLACED'
  );

  // ORDER_PLACED state transitions (terminal)
  assertEqual(
    stateMachine.transitionState('ORDER_PLACED', 'order_taking', emptyContext),
    'ORDER_PLACED',
    'ORDER_PLACED + order_taking → ORDER_PLACED (terminal)'
  );

  assertEqual(
    stateMachine.transitionState('ORDER_PLACED', 'general_info', emptyContext),
    'ORDER_PLACED',
    'ORDER_PLACED + general_info → ORDER_PLACED (terminal)'
  );

  assertEqual(
    stateMachine.transitionState('ORDER_PLACED', 'cart_update', emptyContext),
    'ORDER_PLACED',
    'ORDER_PLACED + cart_update → ORDER_PLACED (terminal)'
  );

  assertEqual(
    stateMachine.transitionState('ORDER_PLACED', 'provide_details', emptyContext),
    'ORDER_PLACED',
    'ORDER_PLACED + provide_details → ORDER_PLACED (terminal)'
  );

  assertEqual(
    stateMachine.transitionState('ORDER_PLACED', 'confirm_order', emptyContext),
    'ORDER_PLACED',
    'ORDER_PLACED + confirm_order → ORDER_PLACED (terminal)'
  );

  assertEqual(
    stateMachine.transitionState('ORDER_PLACED', 'cancel_order', emptyContext),
    'ORDER_PLACED',
    'ORDER_PLACED + cancel_order → ORDER_PLACED (terminal)'
  );

  assertEqual(
    stateMachine.transitionState('ORDER_PLACED', 'transfer', emptyContext),
    'ORDER_PLACED',
    'ORDER_PLACED + transfer → ORDER_PLACED (terminal)'
  );
}

// ============================================================================
// TEST 2: FUNCTION MAPPING
// ============================================================================

function testFunctionMapping() {
  console.log('\n' + '='.repeat(70));
  console.log('TEST 2: Function Mapping');
  console.log('='.repeat(70) + '\n');

  // GREETING state functions
  assertArrayEqual(
    stateMachine.getFunctionsToExecute('GREETING', 'order_taking'),
    ['search_menu'],
    'GREETING + order_taking → [search_menu]'
  );

  assertArrayEqual(
    stateMachine.getFunctionsToExecute('GREETING', 'general_info'),
    ['get_restaurant_info'],
    'GREETING + general_info → [get_restaurant_info]'
  );

  assertArrayEqual(
    stateMachine.getFunctionsToExecute('GREETING', 'transfer'),
    ['redirect_to_human'],
    'GREETING + transfer → [redirect_to_human]'
  );

  // COLLECTING_ORDER state functions
  assertArrayEqual(
    stateMachine.getFunctionsToExecute('COLLECTING_ORDER', 'order_taking'),
    ['search_menu', 'add_to_cart'],
    'COLLECTING_ORDER + order_taking → [search_menu, add_to_cart]'
  );

  assertArrayEqual(
    stateMachine.getFunctionsToExecute('COLLECTING_ORDER', 'general_info'),
    ['get_restaurant_info'],
    'COLLECTING_ORDER + general_info → [get_restaurant_info]'
  );

  assertArrayEqual(
    stateMachine.getFunctionsToExecute('COLLECTING_ORDER', 'cart_update'),
    ['update_cart'],
    'COLLECTING_ORDER + cart_update → [update_cart]'
  );

  assertArrayEqual(
    stateMachine.getFunctionsToExecute('COLLECTING_ORDER', 'confirm_order'),
    ['get_cart_summary'],
    'COLLECTING_ORDER + confirm_order → [get_cart_summary]'
  );

  // COLLECTING_DETAILS state functions
  assertArrayEqual(
    stateMachine.getFunctionsToExecute('COLLECTING_DETAILS', 'order_taking'),
    ['search_menu'],
    'COLLECTING_DETAILS + order_taking → [search_menu]'
  );

  assertArrayEqual(
    stateMachine.getFunctionsToExecute('COLLECTING_DETAILS', 'cart_update'),
    ['update_cart'],
    'COLLECTING_DETAILS + cart_update → [update_cart]'
  );

  // CONFIRMING_ORDER state functions
  assertArrayEqual(
    stateMachine.getFunctionsToExecute('CONFIRMING_ORDER', 'confirm_order'),
    ['place_order'],
    'CONFIRMING_ORDER + confirm_order → [place_order]'
  );

  assertArrayEqual(
    stateMachine.getFunctionsToExecute('CONFIRMING_ORDER', 'cart_update'),
    ['update_cart'],
    'CONFIRMING_ORDER + cart_update → [update_cart]'
  );

  // Functions with no state-specific mapping (returns empty array)
  assertArrayEqual(
    stateMachine.getFunctionsToExecute('GREETING', 'provide_details'),
    [],
    'GREETING + provide_details → [] (no function mapping)'
  );

  assertArrayEqual(
    stateMachine.getFunctionsToExecute('ORDER_PLACED', 'order_taking'),
    [],
    'ORDER_PLACED + order_taking → [] (terminal state)'
  );
}

// ============================================================================
// TEST 3: STATE COMPLETION VALIDATION
// ============================================================================

function testStateCompletion() {
  console.log('\n' + '='.repeat(70));
  console.log('TEST 3: State Completion Validation');
  console.log('='.repeat(70) + '\n');

  // GREETING - always complete (no requirements)
  assertTrue(
    stateMachine.isStateComplete('GREETING', {}),
    'GREETING state is always complete'
  );

  // COLLECTING_ORDER - requires non-empty cart
  assertFalse(
    stateMachine.isStateComplete('COLLECTING_ORDER', {}),
    'COLLECTING_ORDER incomplete without cart'
  );

  assertFalse(
    stateMachine.isStateComplete('COLLECTING_ORDER', { cart: [] }),
    'COLLECTING_ORDER incomplete with empty cart'
  );

  assertTrue(
    stateMachine.isStateComplete('COLLECTING_ORDER', {
      cart: [{ name: 'Pizza', price: 50 }]
    }),
    'COLLECTING_ORDER complete with items in cart'
  );

  // COLLECTING_DETAILS - requires cart, name, phone, deliveryType
  assertFalse(
    stateMachine.isStateComplete('COLLECTING_DETAILS', {}),
    'COLLECTING_DETAILS incomplete without any fields'
  );

  assertFalse(
    stateMachine.isStateComplete('COLLECTING_DETAILS', {
      cart: [{ name: 'Pizza', price: 50 }],
      customerName: 'John Doe'
    }),
    'COLLECTING_DETAILS incomplete with only cart and name'
  );

  assertFalse(
    stateMachine.isStateComplete('COLLECTING_DETAILS', {
      cart: [{ name: 'Pizza', price: 50 }],
      customerName: 'John Doe',
      phoneNumber: '123' // Too short
    }),
    'COLLECTING_DETAILS incomplete with invalid phone (too short)'
  );

  assertFalse(
    stateMachine.isStateComplete('COLLECTING_DETAILS', {
      cart: [{ name: 'Pizza', price: 50 }],
      customerName: 'John Doe',
      phoneNumber: '0501234567',
      deliveryType: 'delivery'
      // Missing deliveryAddress for delivery
    }),
    'COLLECTING_DETAILS incomplete - delivery without address'
  );

  assertTrue(
    stateMachine.isStateComplete('COLLECTING_DETAILS', {
      cart: [{ name: 'Pizza', price: 50 }],
      customerName: 'John Doe',
      phoneNumber: '0501234567',
      deliveryType: 'pickup'
      // No address needed for pickup
    }),
    'COLLECTING_DETAILS complete - pickup without address'
  );

  assertTrue(
    stateMachine.isStateComplete('COLLECTING_DETAILS', {
      cart: [{ name: 'Pizza', price: 50 }],
      customerName: 'John Doe',
      phoneNumber: '050-123-4567', // With dashes
      deliveryType: 'delivery',
      deliveryAddress: '123 Main St, Tel Aviv'
    }),
    'COLLECTING_DETAILS complete - delivery with address'
  );

  // ORDER_PLACED - always complete (no requirements)
  assertTrue(
    stateMachine.isStateComplete('ORDER_PLACED', {}),
    'ORDER_PLACED state is always complete'
  );
}

// ============================================================================
// TEST 4: MISSING FIELDS DETECTION
// ============================================================================

function testMissingFields() {
  console.log('\n' + '='.repeat(70));
  console.log('TEST 4: Missing Fields Detection');
  console.log('='.repeat(70) + '\n');

  // GREETING - no missing fields
  assertArrayEqual(
    stateMachine.getMissingFields('GREETING', {}),
    [],
    'GREETING has no missing fields'
  );

  // COLLECTING_ORDER - empty cart
  const missingCart = stateMachine.getMissingFields('COLLECTING_ORDER', {});
  assertEqual(
    missingCart.length,
    1,
    'COLLECTING_ORDER missing 1 field (cart)'
  );
  assertEqual(
    missingCart[0].field,
    'cart',
    'Missing field is cart'
  );

  // COLLECTING_DETAILS - all fields missing
  // Note: deliveryAddress is NOT required when deliveryType is undefined (not 'delivery')
  const missingAll = stateMachine.getMissingFields('COLLECTING_DETAILS', {});
  assertEqual(
    missingAll.length,
    4,
    'COLLECTING_DETAILS missing 4 fields (cart, name, phone, deliveryType)'
  );

  // COLLECTING_DETAILS - delivery without address
  const missingAddress = stateMachine.getMissingFields('COLLECTING_DETAILS', {
    cart: [{ name: 'Pizza', price: 50 }],
    customerName: 'John Doe',
    phoneNumber: '0501234567',
    deliveryType: 'delivery'
    // Missing: deliveryAddress
  });
  assertEqual(
    missingAddress.length,
    1,
    'COLLECTING_DETAILS (delivery) missing 1 field (address)'
  );
  assertEqual(
    missingAddress[0].field,
    'deliveryAddress',
    'Missing field is deliveryAddress'
  );

  // COLLECTING_DETAILS - pickup (no address needed)
  const pickupComplete = stateMachine.getMissingFields('COLLECTING_DETAILS', {
    cart: [{ name: 'Pizza', price: 50 }],
    customerName: 'John Doe',
    phoneNumber: '0501234567',
    deliveryType: 'pickup'
  });
  assertArrayEqual(
    pickupComplete,
    [],
    'COLLECTING_DETAILS (pickup) has no missing fields'
  );
}

// ============================================================================
// TEST 5: EDGE CASES
// ============================================================================

function testEdgeCases() {
  console.log('\n' + '='.repeat(70));
  console.log('TEST 5: Edge Cases');
  console.log('='.repeat(70) + '\n');

  // Invalid state
  assertEqual(
    stateMachine.transitionState('INVALID_STATE', 'order_taking', {}),
    'INVALID_STATE',
    'Invalid state stays in same state'
  );

  // Invalid intent
  assertEqual(
    stateMachine.transitionState('GREETING', 'invalid_intent', {}),
    'GREETING',
    'Invalid intent stays in same state'
  );

  // Invalid state for function mapping
  assertArrayEqual(
    stateMachine.getFunctionsToExecute('INVALID_STATE', 'order_taking'),
    [],
    'Invalid state returns empty function array'
  );

  // Invalid intent for function mapping
  assertArrayEqual(
    stateMachine.getFunctionsToExecute('GREETING', 'invalid_intent'),
    [],
    'Invalid intent returns empty function array'
  );

  // Invalid state for completion check
  assertFalse(
    stateMachine.isStateComplete('INVALID_STATE', {}),
    'Invalid state is not complete'
  );

  // Phone number validation with various formats
  assertTrue(
    stateMachine.isStateComplete('COLLECTING_DETAILS', {
      cart: [{ name: 'Pizza', price: 50 }],
      customerName: 'John Doe',
      phoneNumber: '050-123-4567', // Dashes
      deliveryType: 'pickup'
    }),
    'Phone with dashes is valid'
  );

  assertTrue(
    stateMachine.isStateComplete('COLLECTING_DETAILS', {
      cart: [{ name: 'Pizza', price: 50 }],
      customerName: 'John Doe',
      phoneNumber: '+972501234567', // International format
      deliveryType: 'pickup'
    }),
    'International phone format is valid'
  );

  // Address length validation
  assertFalse(
    stateMachine.isStateComplete('COLLECTING_DETAILS', {
      cart: [{ name: 'Pizza', price: 50 }],
      customerName: 'John Doe',
      phoneNumber: '0501234567',
      deliveryType: 'delivery',
      deliveryAddress: 'Short' // Too short (< 10 chars)
    }),
    'Short address is invalid'
  );
}

// ============================================================================
// TEST 6: GLOBAL INTENTS
// ============================================================================

function testGlobalIntents() {
  console.log('\n' + '='.repeat(70));
  console.log('TEST 6: Global Intents (work from any state)');
  console.log('='.repeat(70) + '\n');

  const cartContext = { cart: [{ name: 'Pizza', price: 50 }] };

  // Global intent: cart_update (stays in current state)
  assertEqual(
    stateMachine.transitionState('GREETING', 'cart_update', cartContext),
    'GREETING',
    'cart_update from GREETING → GREETING (global)'
  );

  assertEqual(
    stateMachine.transitionState('COLLECTING_ORDER', 'cart_update', cartContext),
    'COLLECTING_ORDER',
    'cart_update from COLLECTING_ORDER → COLLECTING_ORDER (global)'
  );

  assertEqual(
    stateMachine.transitionState('COLLECTING_DETAILS', 'cart_update', cartContext),
    'COLLECTING_DETAILS',
    'cart_update from COLLECTING_DETAILS → COLLECTING_DETAILS (global)'
  );

  assertEqual(
    stateMachine.transitionState('CONFIRMING_ORDER', 'cart_update', cartContext),
    'CONFIRMING_ORDER',
    'cart_update from CONFIRMING_ORDER → CONFIRMING_ORDER (global)'
  );

  // Global intent: general_info (stays in current state)
  assertEqual(
    stateMachine.transitionState('GREETING', 'general_info', cartContext),
    'GREETING',
    'general_info from GREETING → GREETING (global)'
  );

  assertEqual(
    stateMachine.transitionState('COLLECTING_ORDER', 'general_info', cartContext),
    'COLLECTING_ORDER',
    'general_info from COLLECTING_ORDER → COLLECTING_ORDER (global)'
  );

  assertEqual(
    stateMachine.transitionState('COLLECTING_DETAILS', 'general_info', cartContext),
    'COLLECTING_DETAILS',
    'general_info from COLLECTING_DETAILS → COLLECTING_DETAILS (global)'
  );

  assertEqual(
    stateMachine.transitionState('CONFIRMING_ORDER', 'general_info', cartContext),
    'CONFIRMING_ORDER',
    'general_info from CONFIRMING_ORDER → CONFIRMING_ORDER (global)'
  );

  // Global intent: cancel_order (goes to ORDER_PLACED from anywhere)
  assertEqual(
    stateMachine.transitionState('GREETING', 'cancel_order', cartContext),
    'ORDER_PLACED',
    'cancel_order from GREETING → ORDER_PLACED (global)'
  );

  assertEqual(
    stateMachine.transitionState('COLLECTING_ORDER', 'cancel_order', cartContext),
    'ORDER_PLACED',
    'cancel_order from COLLECTING_ORDER → ORDER_PLACED (global)'
  );

  assertEqual(
    stateMachine.transitionState('COLLECTING_DETAILS', 'cancel_order', cartContext),
    'ORDER_PLACED',
    'cancel_order from COLLECTING_DETAILS → ORDER_PLACED (global)'
  );

  assertEqual(
    stateMachine.transitionState('CONFIRMING_ORDER', 'cancel_order', cartContext),
    'ORDER_PLACED',
    'cancel_order from CONFIRMING_ORDER → ORDER_PLACED (global)'
  );

  // Global intent: transfer (goes to ORDER_PLACED from anywhere)
  assertEqual(
    stateMachine.transitionState('GREETING', 'transfer', cartContext),
    'ORDER_PLACED',
    'transfer from GREETING → ORDER_PLACED (global)'
  );

  assertEqual(
    stateMachine.transitionState('COLLECTING_ORDER', 'transfer', cartContext),
    'ORDER_PLACED',
    'transfer from COLLECTING_ORDER → ORDER_PLACED (global)'
  );

  assertEqual(
    stateMachine.transitionState('COLLECTING_DETAILS', 'transfer', cartContext),
    'ORDER_PLACED',
    'transfer from COLLECTING_DETAILS → ORDER_PLACED (global)'
  );

  assertEqual(
    stateMachine.transitionState('CONFIRMING_ORDER', 'transfer', cartContext),
    'ORDER_PLACED',
    'transfer from CONFIRMING_ORDER → ORDER_PLACED (global)'
  );

  // Global intent function mapping
  assertArrayEqual(
    stateMachine.getFunctionsToExecute('GREETING', 'cart_update'),
    ['update_cart'],
    'cart_update → [update_cart] (global, from any state)'
  );

  assertArrayEqual(
    stateMachine.getFunctionsToExecute('COLLECTING_DETAILS', 'cart_update'),
    ['update_cart'],
    'cart_update from COLLECTING_DETAILS → [update_cart] (global)'
  );

  assertArrayEqual(
    stateMachine.getFunctionsToExecute('GREETING', 'general_info'),
    ['get_restaurant_info'],
    'general_info → [get_restaurant_info] (global)'
  );

  assertArrayEqual(
    stateMachine.getFunctionsToExecute('CONFIRMING_ORDER', 'general_info'),
    ['get_restaurant_info'],
    'general_info from CONFIRMING_ORDER → [get_restaurant_info] (global)'
  );

  assertArrayEqual(
    stateMachine.getFunctionsToExecute('COLLECTING_ORDER', 'transfer'),
    ['redirect_to_human'],
    'transfer → [redirect_to_human] (global)'
  );

  assertArrayEqual(
    stateMachine.getFunctionsToExecute('COLLECTING_DETAILS', 'cancel_order'),
    [],
    'cancel_order → [] (global, no function needed)'
  );

  // Check isGlobalIntent helper
  assertTrue(
    stateMachine.isGlobalIntent('cart_update'),
    'cart_update is global intent'
  );

  assertTrue(
    stateMachine.isGlobalIntent('general_info'),
    'general_info is global intent'
  );

  assertTrue(
    stateMachine.isGlobalIntent('cancel_order'),
    'cancel_order is global intent'
  );

  assertTrue(
    stateMachine.isGlobalIntent('transfer'),
    'transfer is global intent'
  );

  assertFalse(
    stateMachine.isGlobalIntent('order_taking'),
    'order_taking is NOT global intent'
  );

  assertFalse(
    stateMachine.isGlobalIntent('provide_details'),
    'provide_details is NOT global intent'
  );

  assertFalse(
    stateMachine.isGlobalIntent('confirm_order'),
    'confirm_order is NOT global intent'
  );
}

// ============================================================================
// RUN ALL TESTS
// ============================================================================

function runAllTests() {
  console.log('\n' + '█'.repeat(70));
  console.log('STATE MACHINE TEST SUITE (WITH GLOBAL INTENTS)');
  console.log('█'.repeat(70));

  testStateTransitions();
  testFunctionMapping();
  testStateCompletion();
  testMissingFields();
  testEdgeCases();
  testGlobalIntents();

  printTestSummary();
}

// Run tests
runAllTests();
