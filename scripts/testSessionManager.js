require('dotenv').config();
const sessionManager = require('../src/services/sessionManager');
const logger = require('../src/utils/logger');

/**
 * Test Session Management System
 *
 * Tests all CRUD operations and session lifecycle
 */

async function testSessionManager() {
  console.log('\n🧪 Testing Session Management System\n');
  console.log('═'.repeat(70) + '\n');

  let passed = 0;
  let failed = 0;

  // Test 1: Create new session
  console.log('Test 1: Create new session');
  try {
    const session = sessionManager.getSession('test-conversation-1');

    if (
      session.conversationId === 'test-conversation-1' &&
      session.state === 'GREETING' &&
      session.context.cart.length === 0 &&
      session.history.length === 0 &&
      session.context.customerName === null
    ) {
      console.log('  ✅ PASS: Session created with default values\n');
      passed++;
    } else {
      console.log('  ❌ FAIL: Session structure incorrect\n');
      failed++;
    }
  } catch (error) {
    console.log(`  ❌ ERROR: ${error.message}\n`);
    failed++;
  }

  // Test 2: Update session state
  console.log('Test 2: Update session state');
  try {
    const session = sessionManager.updateSession('test-conversation-1', {
      state: 'COLLECTING_ORDER'
    });

    if (session.state === 'COLLECTING_ORDER') {
      console.log('  ✅ PASS: State updated successfully\n');
      passed++;
    } else {
      console.log(`  ❌ FAIL: Expected COLLECTING_ORDER, got ${session.state}\n`);
      failed++;
    }
  } catch (error) {
    console.log(`  ❌ ERROR: ${error.message}\n`);
    failed++;
  }

  // Test 3: Update context
  console.log('Test 3: Update context (customer name)');
  try {
    const session = sessionManager.updateSession('test-conversation-1', {
      context: {
        customerName: 'דוד כהן'
      }
    });

    if (session.context.customerName === 'דוד כהן') {
      console.log('  ✅ PASS: Context updated successfully\n');
      passed++;
    } else {
      console.log(`  ❌ FAIL: Expected 'דוד כהן', got ${session.context.customerName}\n`);
      failed++;
    }
  } catch (error) {
    console.log(`  ❌ ERROR: ${error.message}\n`);
    failed++;
  }

  // Test 4: Add items to cart
  console.log('Test 4: Add items to cart');
  try {
    const cart = [
      { id: '1', name: 'המבורגר', price: 45, quantity: 2 },
      { id: '2', name: 'פיצה משפחתית', price: 60, quantity: 1 }
    ];

    const session = sessionManager.updateSession('test-conversation-1', {
      context: { cart }
    });

    if (session.context.cart.length === 2 && session.context.cart[0].name === 'המבורגר') {
      console.log('  ✅ PASS: Cart updated successfully\n');
      passed++;
    } else {
      console.log(`  ❌ FAIL: Cart not updated correctly\n`);
      failed++;
    }
  } catch (error) {
    console.log(`  ❌ ERROR: ${error.message}\n`);
    failed++;
  }

  // Test 5: Append to history
  console.log('Test 5: Append to history');
  try {
    const session = sessionManager.updateSession('test-conversation-1', {
      history: [
        { role: 'user', content: 'אני רוצה להזמין' },
        { role: 'assistant', content: 'בטח! מה תרצה להזמין?' }
      ]
    });

    if (session.history.length === 2 && session.history[0].role === 'user') {
      console.log('  ✅ PASS: History appended successfully\n');
      passed++;
    } else {
      console.log(`  ❌ FAIL: History not appended correctly\n`);
      failed++;
    }
  } catch (error) {
    console.log(`  ❌ ERROR: ${error.message}\n`);
    failed++;
  }

  // Test 6: Retrieve existing session
  console.log('Test 6: Retrieve existing session');
  try {
    const session = sessionManager.getSession('test-conversation-1');

    if (
      session.state === 'COLLECTING_ORDER' &&
      session.context.customerName === 'דוד כהן' &&
      session.context.cart.length === 2 &&
      session.history.length === 2
    ) {
      console.log('  ✅ PASS: Session retrieved with all updates\n');
      passed++;
    } else {
      console.log('  ❌ FAIL: Session data incomplete\n');
      failed++;
    }
  } catch (error) {
    console.log(`  ❌ ERROR: ${error.message}\n`);
    failed++;
  }

  // Test 7: Save complete session
  console.log('Test 7: Save complete session');
  try {
    const newSession = {
      conversationId: 'test-conversation-2',
      state: 'CONFIRMING_ORDER',
      context: {
        customerName: 'שרה לוי',
        phoneNumber: '052-1234567',
        deliveryAddress: 'רחוב הרצל 10, תל אביב',
        deliveryType: 'delivery',
        cart: [
          { id: '3', name: 'סלט ירוק', price: 25, quantity: 1 }
        ]
      },
      history: [
        { role: 'user', content: 'אני רוצה סלט' },
        { role: 'assistant', content: 'הוספתי סלט ירוק' }
      ],
      createdAt: new Date(),
      lastActivity: new Date()
    };

    const saved = sessionManager.saveSession('test-conversation-2', newSession);

    if (saved.context.customerName === 'שרה לוי') {
      console.log('  ✅ PASS: Complete session saved\n');
      passed++;
    } else {
      console.log('  ❌ FAIL: Session not saved correctly\n');
      failed++;
    }
  } catch (error) {
    console.log(`  ❌ ERROR: ${error.message}\n`);
    failed++;
  }

  // Test 8: Invalid state transition
  console.log('Test 8: Invalid state (error handling)');
  try {
    sessionManager.updateSession('test-conversation-1', {
      state: 'INVALID_STATE'
    });
    console.log('  ❌ FAIL: Should have thrown error for invalid state\n');
    failed++;
  } catch (error) {
    if (error.message.includes('Invalid state')) {
      console.log('  ✅ PASS: Invalid state rejected correctly\n');
      passed++;
    } else {
      console.log(`  ❌ FAIL: Wrong error: ${error.message}\n`);
      failed++;
    }
  }

  // Test 9: Session statistics
  console.log('Test 9: Session statistics');
  try {
    const stats = sessionManager.getStats();

    if (
      stats.totalSessions === 2 &&
      stats.totalCartItems === 3 &&
      stats.stateCounts['COLLECTING_ORDER'] === 1 &&
      stats.stateCounts['CONFIRMING_ORDER'] === 1
    ) {
      console.log('  ✅ PASS: Statistics calculated correctly\n');
      console.log(`    Total sessions: ${stats.totalSessions}`);
      console.log(`    Total cart items: ${stats.totalCartItems}`);
      console.log(`    Avg history size: ${stats.avgHistorySize}`);
      passed++;
    } else {
      console.log('  ❌ FAIL: Statistics incorrect\n');
      console.log(`    Got: ${JSON.stringify(stats, null, 2)}`);
      failed++;
    }
  } catch (error) {
    console.log(`  ❌ ERROR: ${error.message}\n`);
    failed++;
  }

  // Test 10: Delete session
  console.log('Test 10: Delete session');
  try {
    const deleted = sessionManager.deleteSession('test-conversation-1');
    const stats = sessionManager.getStats();

    if (deleted && stats.totalSessions === 1) {
      console.log('  ✅ PASS: Session deleted successfully\n');
      passed++;
    } else {
      console.log('  ❌ FAIL: Session not deleted\n');
      failed++;
    }
  } catch (error) {
    console.log(`  ❌ ERROR: ${error.message}\n`);
    failed++;
  }

  // Test 11: History limit (prevent memory bloat)
  console.log('Test 11: History limit (max 20 messages)');
  try {
    const session = sessionManager.getSession('test-conversation-3');

    // Add 25 messages
    for (let i = 0; i < 25; i++) {
      sessionManager.updateSession('test-conversation-3', {
        history: [
          { role: 'user', content: `Message ${i}` }
        ]
      });
    }

    const updatedSession = sessionManager.getSession('test-conversation-3');

    if (updatedSession.history.length === 20) {
      console.log('  ✅ PASS: History limited to 20 messages\n');
      passed++;
    } else {
      console.log(`  ❌ FAIL: Expected 20 messages, got ${updatedSession.history.length}\n`);
      failed++;
    }
  } catch (error) {
    console.log(`  ❌ ERROR: ${error.message}\n`);
    failed++;
  }

  // Test 12: Session expiration (manual test)
  console.log('Test 12: Session expiration check');
  try {
    const session = sessionManager.getSession('test-conversation-4');

    // Manually set lastActivity to 2 hours ago
    session.lastActivity = new Date(Date.now() - 2 * 60 * 60 * 1000);
    sessionManager.sessions.set('test-conversation-4', session);

    // Try to get session - should create new one
    const retrieved = sessionManager.getSession('test-conversation-4');

    if (retrieved.state === 'GREETING' && retrieved.history.length === 0) {
      console.log('  ✅ PASS: Expired session replaced with new one\n');
      passed++;
    } else {
      console.log('  ❌ FAIL: Expired session not replaced\n');
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

  if (successRate >= 90) {
    console.log(`\n   🎉 Excellent! Session manager working correctly`);
  } else if (successRate >= 70) {
    console.log(`\n   ⚠️  Session manager mostly working, some issues`);
  } else {
    console.log(`\n   ❌ Session manager has significant issues`);
  }

  console.log('\n' + '═'.repeat(70) + '\n');

  // Cleanup
  sessionManager.stopCleanupTimer();

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
testSessionManager().catch(error => {
  console.error('\n❌ Test execution failed:', error.message);
  logger.error('Test execution failed:', {
    error: error.message,
    stack: error.stack
  });
  process.exit(1);
});
