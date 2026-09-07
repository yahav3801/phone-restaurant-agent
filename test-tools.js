const http = require('http');

async function testTool(toolName, args, callId = 'test-call-' + Date.now()) {
  return new Promise((resolve, reject) => {
    // Double-encode to ensure Hebrew characters are properly escaped
    const argsStr = JSON.stringify(args);
    const data = JSON.stringify({
      message: {
        type: 'tool-calls',
        call: { id: callId },
        toolCalls: [{
          id: `test-${toolName}-${Date.now()}`,
          function: {
            name: toolName,
            arguments: argsStr  // Already stringified
          }
        }]
      }
    });

    const req = http.request({
      hostname: 'localhost',
      port: 3000,
      path: '/webhooks/vapi',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': data.length
      },
      timeout: 30000 // 30 second timeout
    }, res => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          const result = JSON.parse(body);
          resolve({ status: res.statusCode, result });
        } catch (e) {
          resolve({ status: res.statusCode, error: 'Invalid JSON', body });
        }
      });
    });

    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });

    req.write(data);
    req.end();
  });
}

async function runTests() {
  console.log('\n🧪 Testing All Tools\n' + '='.repeat(50) + '\n');

  // Test 1: search_menu for אורז (rice)
  console.log('1️⃣  Testing search_menu for "אורז"...');
  try {
    const result = await testTool('search_menu', { query: 'אורז', limit: 5, inStockOnly: true });
    console.log('✅ Status:', result.status);
    console.log('📦 Result:', JSON.stringify(result.result, null, 2));
  } catch (e) {
    console.log('❌ Error:', e.message);
  }

  console.log('\n' + '-'.repeat(50) + '\n');

  // Test 2: search_menu for hamburger
  console.log('2️⃣  Testing search_menu for "המבורגר"...');
  try {
    const result = await testTool('search_menu', { query: 'המבורגר', limit: 3 });
    console.log('✅ Status:', result.status);
    console.log('📦 Result:', JSON.stringify(result.result, null, 2));
  } catch (e) {
    console.log('❌ Error:', e.message);
  }

  console.log('\n' + '-'.repeat(50) + '\n');

  // Test 3: get_restaurant_info (address)
  console.log('3️⃣  Testing get_restaurant_info (address)...');
  try {
    const result = await testTool('get_restaurant_info', { query: 'address' });
    console.log('✅ Status:', result.status);
    console.log('📦 Result:', JSON.stringify(result.result, null, 2));
  } catch (e) {
    console.log('❌ Error:', e.message);
  }

  console.log('\n' + '-'.repeat(50) + '\n');

  // Test 4: get_restaurant_info (all)
  console.log('4️⃣  Testing get_restaurant_info (all info)...');
  try {
    const result = await testTool('get_restaurant_info', {});
    console.log('✅ Status:', result.status);
    console.log('📦 Result:', JSON.stringify(result.result, null, 2));
  } catch (e) {
    console.log('❌ Error:', e.message);
  }

  console.log('\n' + '-'.repeat(50) + '\n');

  // Use same call ID for cart operations
  const cartCallId = 'test-cart-' + Date.now();

  // Test 5: add_to_cart
  console.log('5️⃣  Testing add_to_cart (אורז x2)...');
  try {
    const result = await testTool('add_to_cart', { itemName: 'אורז', quantity: 2 }, cartCallId);
    console.log('✅ Status:', result.status);
    console.log('📦 Result:', JSON.stringify(result.result, null, 2));
  } catch (e) {
    console.log('❌ Error:', e.message);
  }

  console.log('\n' + '-'.repeat(50) + '\n');

  // Test 6: get_cart_summary
  console.log('6️⃣  Testing get_cart_summary...');
  try {
    const result = await testTool('get_cart_summary', {}, cartCallId);
    console.log('✅ Status:', result.status);
    console.log('📦 Result:', JSON.stringify(result.result, null, 2));
  } catch (e) {
    console.log('❌ Error:', e.message);
  }

  console.log('\n' + '-'.repeat(50) + '\n');

  // Test 7: update_cart
  console.log('7️⃣  Testing update_cart (change to 5)...');
  try {
    const result = await testTool('update_cart', { items: [{ name: 'אורז', quantity: 5 }] }, cartCallId);
    console.log('✅ Status:', result.status);
    console.log('📦 Result:', JSON.stringify(result.result, null, 2));
  } catch (e) {
    console.log('❌ Error:', e.message);
  }

  console.log('\n' + '-'.repeat(50) + '\n');

  // Test 8: get_cart_summary again
  console.log('8️⃣  Testing get_cart_summary (after update)...');
  try {
    const result = await testTool('get_cart_summary', {}, cartCallId);
    console.log('✅ Status:', result.status);
    console.log('📦 Result:', JSON.stringify(result.result, null, 2));
  } catch (e) {
    console.log('❌ Error:', e.message);
  }

  console.log('\n' + '='.repeat(50));
  console.log('✅ All tests complete!\n');
}

runTests().catch(console.error);
