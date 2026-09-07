require('dotenv').config();
const intentClassifier = require('../src/services/intentClassifier');
const logger = require('../src/utils/logger');

/**
 * Test Intent Classification System
 *
 * Tests the 7 production intents with various scenarios
 */

async function testIntentClassifier() {
  console.log('\n🧪 Testing Intent Classification System\n');
  console.log('═'.repeat(70) + '\n');

  let passed = 0;
  let failed = 0;

  // Test 1: Order Taking
  console.log('Test 1: Order Taking Intent');
  try {
    const result1 = await intentClassifier.classify(
      'אני רוצה פיצה משפחתית',
      'menu_browsing',
      []
    );
    console.log('  Result:', JSON.stringify(result1, null, 2));

    if (result1.intent === 'order_taking' && Array.isArray(result1.keywords)) {
      console.log('  ✅ PASS: Correctly identified as order_taking\n');
      passed++;
    } else {
      console.log(`  ❌ FAIL: Expected order_taking, got ${result1.intent}\n`);
      failed++;
    }
  } catch (error) {
    console.log(`  ❌ ERROR: ${error.message}\n`);
    failed++;
  }

  // Test 2: General Info
  console.log('Test 2: General Info Intent');
  try {
    const result2 = await intentClassifier.classify(
      'מה שעות הפתיחה?',
      'greeting',
      []
    );
    console.log('  Result:', JSON.stringify(result2, null, 2));

    if (result2.intent === 'general_info' && Array.isArray(result2.keywords)) {
      console.log('  ✅ PASS: Correctly identified as general_info\n');
      passed++;
    } else {
      console.log(`  ❌ FAIL: Expected general_info, got ${result2.intent}\n`);
      failed++;
    }
  } catch (error) {
    console.log(`  ❌ ERROR: ${error.message}\n`);
    failed++;
  }

  // Test 3: Cart Update with Context
  console.log('Test 3: Cart Update Intent (with conversation context)');
  try {
    const result3 = await intentClassifier.classify(
      'תוסיף עוד אחד',
      'ordering',
      [
        { role: 'user', content: 'אני רוצה המבורגר' },
        { role: 'assistant', content: 'הוספתי המבורגר לסל' }
      ]
    );
    console.log('  Result:', JSON.stringify(result3, null, 2));

    if (result3.intent === 'cart_update' && Array.isArray(result3.keywords)) {
      console.log('  ✅ PASS: Correctly identified as cart_update with context\n');
      passed++;
    } else {
      console.log(`  ❌ FAIL: Expected cart_update, got ${result3.intent}\n`);
      failed++;
    }
  } catch (error) {
    console.log(`  ❌ ERROR: ${error.message}\n`);
    failed++;
  }

  // Test 4: Provide Details
  console.log('Test 4: Provide Details Intent');
  try {
    const result4 = await intentClassifier.classify(
      'השם דוד והכתובת רחוב הרצל 5',
      'checkout',
      []
    );
    console.log('  Result:', JSON.stringify(result4, null, 2));

    if (result4.intent === 'provide_details' && Array.isArray(result4.keywords)) {
      console.log('  ✅ PASS: Correctly identified as provide_details\n');
      passed++;
    } else {
      console.log(`  ❌ FAIL: Expected provide_details, got ${result4.intent}\n`);
      failed++;
    }
  } catch (error) {
    console.log(`  ❌ ERROR: ${error.message}\n`);
    failed++;
  }

  // Test 5: Confirm Order
  console.log('Test 5: Confirm Order Intent');
  try {
    const result5 = await intentClassifier.classify(
      'זה הכל, תשלח',
      'checkout',
      []
    );
    console.log('  Result:', JSON.stringify(result5, null, 2));

    if (result5.intent === 'confirm_order' && Array.isArray(result5.keywords)) {
      console.log('  ✅ PASS: Correctly identified as confirm_order\n');
      passed++;
    } else {
      console.log(`  ❌ FAIL: Expected confirm_order, got ${result5.intent}\n`);
      failed++;
    }
  } catch (error) {
    console.log(`  ❌ ERROR: ${error.message}\n`);
    failed++;
  }

  // Test 6: Cancel Order
  console.log('Test 6: Cancel Order Intent');
  try {
    const result6 = await intentClassifier.classify(
      'אני מבטל',
      'ordering',
      []
    );
    console.log('  Result:', JSON.stringify(result6, null, 2));

    if (result6.intent === 'cancel_order' && Array.isArray(result6.keywords)) {
      console.log('  ✅ PASS: Correctly identified as cancel_order\n');
      passed++;
    } else {
      console.log(`  ❌ FAIL: Expected cancel_order, got ${result6.intent}\n`);
      failed++;
    }
  } catch (error) {
    console.log(`  ❌ ERROR: ${error.message}\n`);
    failed++;
  }

  // Test 7: Transfer to Human
  console.log('Test 7: Transfer Intent');
  try {
    const result7 = await intentClassifier.classify(
      'תעביר לנציג אנושי',
      'menu_browsing',
      []
    );
    console.log('  Result:', JSON.stringify(result7, null, 2));

    if (result7.intent === 'transfer' && Array.isArray(result7.keywords)) {
      console.log('  ✅ PASS: Correctly identified as transfer\n');
      passed++;
    } else {
      console.log(`  ❌ FAIL: Expected transfer, got ${result7.intent}\n`);
      failed++;
    }
  } catch (error) {
    console.log(`  ❌ ERROR: ${error.message}\n`);
    failed++;
  }

  // Test 8: Error Handling (Empty Message)
  console.log('Test 8: Error Handling (Empty Message)');
  try {
    const result8 = await intentClassifier.classify(
      '',
      'greeting',
      []
    );
    console.log('  Result:', JSON.stringify(result8, null, 2));

    if (result8.intent === 'general_info' && Array.isArray(result8.keywords) && result8.keywords.length === 0) {
      console.log('  ✅ PASS: Fallback to general_info with empty keywords\n');
      passed++;
    } else {
      console.log(`  ❌ FAIL: Expected general_info fallback\n`);
      failed++;
    }
  } catch (error) {
    console.log(`  ❌ ERROR: ${error.message}\n`);
    failed++;
  }

  // Summary
  console.log('═'.repeat(70));
  console.log('\n📊 Test Results Summary\n');
  const total = passed + failed;
  console.log(`   Total tests: ${total}`);
  console.log(`   ✅ Passed: ${passed}`);
  console.log(`   ❌ Failed: ${failed}`);

  const successRate = ((passed / total) * 100).toFixed(1);
  console.log(`   📈 Success Rate: ${successRate}%`);

  if (successRate >= 80) {
    console.log(`\n   🎉 Excellent! Success rate is above 80%`);
  } else if (successRate >= 60) {
    console.log(`\n   ⚠️  Success rate is acceptable but could be better`);
  } else {
    console.log(`\n   ❌ Success rate is too low. Check implementation.`);
  }

  console.log('\n' + '═'.repeat(70) + '\n');

  // Exit with appropriate code
  if (failed === 0) {
    console.log('✅ All tests passed!\n');
    process.exit(0);
  } else {
    console.log(`⚠️  ${failed} test(s) failed\n`);
    process.exit(1);
  }
}

// Run tests
testIntentClassifier().catch(error => {
  console.error('\n❌ Test execution failed:', error.message);
  logger.error('Test execution failed:', {
    error: error.message,
    stack: error.stack
  });
  process.exit(1);
});
