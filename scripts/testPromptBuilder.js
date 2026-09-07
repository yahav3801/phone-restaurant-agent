/**
 * Test Suite for Prompt Builder
 *
 * Tests all helper functions and buildPrompt integration
 *
 * Run: node scripts/testPromptBuilder.js
 */

const {
  buildPrompt,
  formatMenuResults,
  formatInfoResults,
  formatCartSummary,
  formatFunctionResults,
  detectMissingFields,
  formatMissingFields,
  replaceVariables
} = require('../src/services/promptBuilder');

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

function assertContains(actual, substring, testName) {
  totalTests++;
  if (actual.includes(substring)) {
    passedTests++;
    console.log(`✅ PASS: ${testName}`);
    return true;
  } else {
    failedTests++;
    console.log(`❌ FAIL: ${testName}`);
    console.log(`   Expected to contain: ${substring}`);
    console.log(`   Actual: ${actual.substring(0, 200)}...`);
    return false;
  }
}

function assertNotContains(actual, substring, testName) {
  totalTests++;
  if (!actual.includes(substring)) {
    passedTests++;
    console.log(`✅ PASS: ${testName}`);
    return true;
  } else {
    failedTests++;
    console.log(`❌ FAIL: ${testName}`);
    console.log(`   Expected NOT to contain: ${substring}`);
    console.log(`   But it was found in: ${actual.substring(0, 200)}...`);
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
// TEST 1: FORMAT MENU RESULTS
// ============================================================================

function testFormatMenuResults() {
  console.log('\n' + '='.repeat(70));
  console.log('TEST 1: formatMenuResults');
  console.log('='.repeat(70) + '\n');

  // Test empty array
  const emptyResult = formatMenuResults([]);
  assertEqual(emptyResult, '', 'Empty array returns empty string');

  // Test single item
  const singleItem = [
    { type: 'menu', name: 'שקשוקה', price: 42, inStock: true }
  ];
  const singleResult = formatMenuResults(singleItem);
  assertContains(singleResult, 'פריטים רלוונטיים מהתפריט:', 'Single item has header');
  assertContains(singleResult, 'שקשוקה: 42₪', 'Single item formatted correctly');
  assertNotContains(singleResult, '[אזל מהמלאי]', 'In-stock item has no out-of-stock marker');

  // Test out-of-stock item
  const outOfStockItem = [
    { type: 'menu', name: 'חביתה', price: 38, inStock: false }
  ];
  const outOfStockResult = formatMenuResults(outOfStockItem);
  assertContains(outOfStockResult, '[אזל מהמלאי]', 'Out-of-stock item marked');

  // Test multiple items
  const multipleItems = [
    { type: 'menu', name: 'שקשוקה', price: 42, inStock: true },
    { type: 'menu', name: 'חביתה', price: 38, inStock: true },
    { type: 'menu', name: 'קפה', price: 12, inStock: false }
  ];
  const multipleResult = formatMenuResults(multipleItems);
  assertContains(multipleResult, 'שקשוקה: 42₪', 'First item included');
  assertContains(multipleResult, 'חביתה: 38₪', 'Second item included');
  assertContains(multipleResult, 'קפה: 12₪ [אזל מהמלאי]', 'Out-of-stock item with marker');
}

// ============================================================================
// TEST 2: FORMAT INFO RESULTS
// ============================================================================

function testFormatInfoResults() {
  console.log('\n' + '='.repeat(70));
  console.log('TEST 2: formatInfoResults');
  console.log('='.repeat(70) + '\n');

  // Test empty array
  const emptyResult = formatInfoResults([]);
  assertEqual(emptyResult, '', 'Empty array returns empty string');

  // Test single info item
  const singleInfo = [
    {
      type: 'info',
      question: 'האם אתם כשרים?',
      answer: 'כן, המסעדה כשרה'
    }
  ];
  const singleResult = formatInfoResults(singleInfo);
  assertContains(singleResult, 'מידע רלוונטי על המסעדה:', 'Has header');
  assertContains(singleResult, 'שאלה: האם אתם כשרים?', 'Has question');
  assertContains(singleResult, 'תשובה: כן, המסעדה כשרה', 'Has answer');

  // Test with response guidelines
  const infoWithGuidelines = [
    {
      type: 'info',
      question: 'מה שעות הפתיחה?',
      answer: 'ראשון-חמישי 7:00-15:00',
      response_guidelines: 'הדגש שסוגרים בשישי ב-14:00'
    }
  ];
  const guidelinesResult = formatInfoResults(infoWithGuidelines);
  assertContains(guidelinesResult, 'הנחיות: הדגש שסוגרים בשישי ב-14:00', 'Includes guidelines');
}

// ============================================================================
// TEST 3: FORMAT CART SUMMARY
// ============================================================================

function testFormatCartSummary() {
  console.log('\n' + '='.repeat(70));
  console.log('TEST 3: formatCartSummary');
  console.log('='.repeat(70) + '\n');

  // Test empty cart
  const emptyResult = formatCartSummary([]);
  assertEqual(emptyResult, 'העגלה ריקה כרגע.', 'Empty cart message');

  // Test null cart
  const nullResult = formatCartSummary(null);
  assertEqual(nullResult, 'העגלה ריקה כרגע.', 'Null cart message');

  // Test single item
  const singleItemCart = [
    { name: 'שקשוקה', price: 42, quantity: 1 }
  ];
  const singleResult = formatCartSummary(singleItemCart);
  assertContains(singleResult, 'תוכן העגלה הנוכחי:', 'Has header');
  assertContains(singleResult, 'שקשוקה x1: 42₪', 'Item formatted correctly');
  assertContains(singleResult, 'סה״כ: 42 שקלים', 'Total calculated');

  // Test multiple items
  const multipleItemsCart = [
    { name: 'שקשוקה', price: 42, quantity: 2 },
    { name: 'קפה', price: 12, quantity: 1 }
  ];
  const multipleResult = formatCartSummary(multipleItemsCart);
  assertContains(multipleResult, 'שקשוקה x2: 84₪', 'First item with quantity');
  assertContains(multipleResult, 'קפה x1: 12₪', 'Second item');
  assertContains(multipleResult, 'סה״כ: 96 שקלים', 'Total 84+12=96');
}

// ============================================================================
// TEST 4: DETECT MISSING FIELDS
// ============================================================================

function testDetectMissingFields() {
  console.log('\n' + '='.repeat(70));
  console.log('TEST 4: detectMissingFields');
  console.log('='.repeat(70) + '\n');

  // Test all fields missing
  const allMissing = detectMissingFields({});
  assertEqual(allMissing.length, 4, 'All fields missing (name, phone, type, cart)');
  assertTrue(allMissing.some(f => f.field === 'customerName'), 'Customer name missing');
  assertTrue(allMissing.some(f => f.field === 'phoneNumber'), 'Phone number missing');
  assertTrue(allMissing.some(f => f.field === 'deliveryType'), 'Delivery type missing');
  assertTrue(allMissing.some(f => f.field === 'cart'), 'Cart missing');

  // Test with cart
  const withCart = detectMissingFields({
    cart: [{ name: 'Pizza', price: 50, quantity: 1 }]
  });
  assertEqual(withCart.length, 3, 'Three fields missing (cart now present)');
  assertTrue(!withCart.some(f => f.field === 'cart'), 'Cart not in missing');

  // Test pickup (no address needed)
  const pickupContext = {
    cart: [{ name: 'Pizza', price: 50, quantity: 1 }],
    customerName: 'דוד',
    phoneNumber: '0501234567',
    deliveryType: 'pickup'
  };
  const pickupMissing = detectMissingFields(pickupContext);
  assertEqual(pickupMissing.length, 0, 'Pickup complete - no missing fields');
  assertTrue(!pickupMissing.some(f => f.field === 'deliveryAddress'), 'Address not required for pickup');

  // Test delivery without address
  const deliveryNoAddress = {
    cart: [{ name: 'Pizza', price: 50, quantity: 1 }],
    customerName: 'דוד',
    phoneNumber: '0501234567',
    deliveryType: 'delivery'
  };
  const deliveryMissing = detectMissingFields(deliveryNoAddress);
  assertEqual(deliveryMissing.length, 1, 'One field missing (address)');
  assertTrue(deliveryMissing.some(f => f.field === 'deliveryAddress'), 'Delivery address required');

  // Test invalid phone (too short)
  const invalidPhone = {
    cart: [{ name: 'Pizza', price: 50, quantity: 1 }],
    customerName: 'דוד',
    phoneNumber: '123',
    deliveryType: 'pickup'
  };
  const phoneMissing = detectMissingFields(invalidPhone);
  assertEqual(phoneMissing.length, 1, 'Invalid phone detected');
  assertTrue(phoneMissing.some(f => f.field === 'phoneNumber'), 'Phone number invalid');
}

// ============================================================================
// TEST 5: FORMAT MISSING FIELDS
// ============================================================================

function testFormatMissingFields() {
  console.log('\n' + '='.repeat(70));
  console.log('TEST 5: formatMissingFields');
  console.log('='.repeat(70) + '\n');

  // Test no missing fields
  const emptyResult = formatMissingFields([]);
  assertContains(emptyResult, 'כל הפרטים הנדרשים התקבלו', 'All fields present message');

  // Test with missing fields
  const missingFields = [
    { field: 'customerName', label: 'שם לקוח' },
    { field: 'phoneNumber', label: 'מספר טלפון' }
  ];
  const result = formatMissingFields(missingFields);
  assertContains(result, 'פרטים חסרים שיש לאסוף:', 'Header present');
  assertContains(result, '- שם לקוח', 'First missing field');
  assertContains(result, '- מספר טלפון', 'Second missing field');
  assertContains(result, 'שאל על פרט אחד בכל פעם', 'Instructions present');
}

// ============================================================================
// TEST 6: REPLACE VARIABLES
// ============================================================================

function testReplaceVariables() {
  console.log('\n' + '='.repeat(70));
  console.log('TEST 6: replaceVariables');
  console.log('='.repeat(70) + '\n');

  const template = `
שם: {{customerName}}
טלפון: {{phoneNumber}}
כתובת: {{deliveryAddress}}
סוג: {{deliveryType}}
{{#if deliveryType === 'delivery'}}
דמי משלוח: 15 שקלים
{{/if}}
`;

  // Test with full context
  const fullContext = {
    customerName: 'דוד',
    phoneNumber: '0501234567',
    deliveryAddress: 'רחוב הרצל 5',
    deliveryType: 'delivery'
  };
  const fullResult = replaceVariables(template, fullContext, '03-1234567');
  assertContains(fullResult, 'שם: דוד', 'Customer name replaced');
  assertContains(fullResult, 'טלפון: 0501234567', 'Phone replaced');
  assertContains(fullResult, 'כתובת: רחוב הרצל 5', 'Address replaced');
  assertContains(fullResult, 'דמי משלוח: 15 שקלים', 'Conditional section shown for delivery');

  // Test with pickup (conditional hidden)
  const pickupContext = {
    customerName: 'שרה',
    phoneNumber: '0521234567',
    deliveryAddress: null,
    deliveryType: 'pickup'
  };
  const pickupResult = replaceVariables(template, pickupContext, '03-1234567');
  assertContains(pickupResult, 'סוג: pickup', 'Delivery type replaced');
  assertNotContains(pickupResult, 'דמי משלוח', 'Conditional section hidden for pickup');

  // Test with missing fields
  const emptyContext = {};
  const emptyResult = replaceVariables(template, emptyContext, '');
  assertContains(emptyResult, 'שם: [לא צוין]', 'Missing name shows placeholder');
  assertContains(emptyResult, 'טלפון: [לא צוין]', 'Missing phone shows placeholder');
}

// ============================================================================
// TEST 7: BUILD PROMPT INTEGRATION
// ============================================================================

function testBuildPromptIntegration() {
  console.log('\n' + '='.repeat(70));
  console.log('TEST 7: buildPrompt Integration');
  console.log('='.repeat(70) + '\n');

  // Test GREETING state
  const greetingPrompt = buildPrompt({
    state: 'GREETING',
    intent: 'order_taking',
    context: {}
  });
  assertContains(greetingPrompt, 'עוזר AI עבור מסעדת הבוקרים', 'Has BASE_PROMPT');
  assertContains(greetingPrompt, 'קבלת פנים ראשונית', 'Has GREETING state prompt');

  // Test COLLECTING_ORDER with RAG results
  const ragResults = [
    { type: 'menu', name: 'שקשוקה', price: 42, inStock: true },
    { type: 'menu', name: 'קפה', price: 12, inStock: true }
  ];
  const orderingPrompt = buildPrompt({
    state: 'COLLECTING_ORDER',
    intent: 'order_taking',
    ragResults: ragResults,
    context: {}
  });
  assertContains(orderingPrompt, 'בניית הזמנה', 'Has COLLECTING_ORDER state prompt');
  assertContains(orderingPrompt, 'פריטים רלוונטיים מהתפריט:', 'Has RAG menu section');
  assertContains(orderingPrompt, 'שקשוקה: 42₪', 'Has menu items');

  // Test COLLECTING_ORDER with cart
  const withCart = buildPrompt({
    state: 'COLLECTING_ORDER',
    intent: 'cart_update',
    context: {
      cart: [{ name: 'שקשוקה', price: 42, quantity: 2 }]
    }
  });
  assertContains(withCart, 'תוכן העגלה הנוכחי:', 'Has cart section');
  assertContains(withCart, 'שקשוקה x2: 84₪', 'Has cart items');
  assertContains(withCart, 'סה״כ: 84 שקלים', 'Has cart total');

  // Test COLLECTING_DETAILS with missing fields
  const detailsPrompt = buildPrompt({
    state: 'COLLECTING_DETAILS',
    intent: 'provide_details',
    context: {
      cart: [{ name: 'פיצה', price: 50, quantity: 1 }]
    }
  });
  assertContains(detailsPrompt, 'איסוף פרטי לקוח', 'Has COLLECTING_DETAILS state prompt');
  assertContains(detailsPrompt, 'פרטים חסרים שיש לאסוף:', 'Has missing fields section');
  assertContains(detailsPrompt, '- שם לקוח', 'Shows missing customer name');
  assertContains(detailsPrompt, '- מספר טלפון', 'Shows missing phone');

  // Test CONFIRMING_ORDER with full context
  const confirmingPrompt = buildPrompt({
    state: 'CONFIRMING_ORDER',
    intent: 'confirm_order',
    context: {
      cart: [{ name: 'שקשוקה', price: 42, quantity: 2 }],
      customerName: 'דוד כהן',
      phoneNumber: '0501234567',
      deliveryType: 'delivery',
      deliveryAddress: 'רחוב הרצל 5 תל אביב'
    },
    caller_number: '03-1234567'
  });
  assertContains(confirmingPrompt, 'אישור הזמנה סופי', 'Has CONFIRMING_ORDER state prompt');
  assertContains(confirmingPrompt, 'שם: דוד כהן', 'Has customer name');
  assertContains(confirmingPrompt, 'טלפון: 0501234567', 'Has phone');
  assertContains(confirmingPrompt, 'סוג הזמנה: delivery', 'Has delivery type');
  assertContains(confirmingPrompt, 'כתובת משלוח: רחוב הרצל 5 תל אביב', 'Has delivery address');
  assertContains(confirmingPrompt, 'דמי משלוח: 15 שקלים', 'Shows delivery fee');

  // Test ORDER_PLACED state
  const placedPrompt = buildPrompt({
    state: 'ORDER_PLACED',
    intent: 'confirm_order',
    context: {}
  });
  assertContains(placedPrompt, 'הזמנה בוצעה', 'Has ORDER_PLACED state prompt');
  assertContains(placedPrompt, '30-45 דקות', 'Has delivery time estimate');

  // Test invalid state (should fallback to GREETING)
  const invalidPrompt = buildPrompt({
    state: 'INVALID_STATE',
    intent: 'order_taking',
    context: {}
  });
  assertContains(invalidPrompt, 'קבלת פנים ראשונית', 'Fallback to GREETING for invalid state');
}

// ============================================================================
// RUN ALL TESTS
// ============================================================================

function runAllTests() {
  console.log('\n' + '█'.repeat(70));
  console.log('PROMPT BUILDER TEST SUITE');
  console.log('█'.repeat(70));

  testFormatMenuResults();
  testFormatInfoResults();
  testFormatCartSummary();
  testDetectMissingFields();
  testFormatMissingFields();
  testReplaceVariables();
  testBuildPromptIntegration();

  printTestSummary();
}

// Run tests
runAllTests();
