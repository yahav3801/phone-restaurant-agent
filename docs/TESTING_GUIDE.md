# Vapi Assistant Testing Guide

Manual testing scenarios and validation procedures for the restaurant phone agent.

## Table of Contents

1. [Test Environment Setup](#test-environment-setup)
2. [Testing Scenarios](#testing-scenarios)
3. [Validation Procedures](#validation-procedures)
4. [Performance Benchmarks](#performance-benchmarks)
5. [Common Issues](#common-issues)

---

## Test Environment Setup

Before running tests, ensure all services are running:

### 1. Start All Services

**Terminal 1: LiteLLM Proxy**
```bash
cd /path/to/restaurant_phone_agent
litellm --config litellm_config.yaml --port 4000
```

**Terminal 2: Node.js Application**
```bash
cd /path/to/restaurant_phone_agent
npm start
```

**Terminal 3: ngrok Tunnel**
```bash
ngrok http 3000
```

**Terminal 4: MongoDB (if not running as service)**
```bash
mongod --dbpath /path/to/data/db
```

### 2. Monitoring Setup

**Open these URLs in browser tabs:**

1. **ngrok Inspector:** http://localhost:4040
2. **Langfuse Dashboard:** https://cloud.langfuse.com
3. **MongoDB Compass:** mongodb://localhost:27017
4. **Vapi Dashboard:** https://dashboard.vapi.ai

### 3. Pre-Test Validation

Run these checks before starting tests:

```bash
# Health checks
curl http://localhost:3000/health  # Should return {"status": "ok"}
curl http://localhost:4000/health  # Should return {"status": "healthy"}
curl https://YOUR_NGROK_URL.ngrok-free.app/health  # Should return {"status": "ok"}

# Database check
mongosh restaurant_phone_agent --eval "db.runCommand({ping:1})"
```

---

## Testing Scenarios

### Test 1: Simple Order (Single Item)

**Objective:** Verify basic order taking functionality

**Test Steps:**
1. Call your Vapi phone number
2. Wait for greeting: "שלום! איך אפשר לעזור?"
3. Say: **"אני רוצה שקשוקה"** (I want shakshuka)
4. Wait for response
5. Say: **"כן"** (Yes) to confirm
6. End call or continue to next test

**Expected Bot Behavior:**
1. Greets caller immediately
2. Transcribes "שקשוקה" correctly
3. Searches menu for shakshuka
4. Responds: "מצוין! יש לנו שקשוקה ב-35 שקלים. רוצה להוסיף?" (Great! We have shakshuka for 35 shekels. Want to add it?)
5. Adds item to cart
6. Confirms addition

**Expected System Behavior:**

**Langfuse Trace:**
- Intent: `order_taking`
- Confidence: > 0.85
- RAG Search: 1 span, results for "שקשוקה"
- Function Execution: `add_to_cart`
- LLM Generation: Hebrew response
- Total latency: < 3 seconds

**MongoDB Session:**
```javascript
{
  state: "COLLECTING_ORDER",
  context: {
    cart: [
      { name: "שקשוקה", price: 35, quantity: 1 }
    ]
  },
  lastIntent: "order_taking",
  conversationHistory: [
    { role: "user", content: "אני רוצה שקשוקה", timestamp: ... },
    { role: "assistant", content: "מצוין! יש לנו...", timestamp: ... }
  ]
}
```

**ngrok Inspector:**
- POST to `/v1/chat/completions`
- Status: 200
- Request body includes `messages` array
- Response includes `choices[0].message.content` in Hebrew

**Application Logs:**
```
info: Chat completion request received {conversationId: ..., messageCount: 2}
info: Parallel processing complete {intent: 'order_taking', confidence: 0.92, ragResultCount: 5}
info: LLM response generated {model: 'gemini-3-flash', tokensUsed: 150, duration: 1200}
```

**✅ Pass Criteria:**
- Hebrew transcription accurate
- Menu item found via RAG
- Item added to cart
- Natural Hebrew response
- Latency < 3 seconds
- No errors in logs

---

### Test 2: Multi-Item Order

**Objective:** Verify handling multiple items in one order

**Test Steps:**
1. Call Vapi number
2. Wait for greeting
3. Say: **"אני רוצה שקשוקה וקפה"** (I want shakshuka and coffee)
4. Wait for response about shakshuka
5. Say: **"גם קפה"** (Also coffee)
6. Wait for confirmation
7. Say: **"זהו"** (That's it)

**Expected Bot Behavior:**
1. Acknowledges both items mentioned
2. Asks for confirmation or adds both
3. Responds naturally about each item
4. Confirms full order

**Expected System Behavior:**

**Langfuse Trace:**
- Multiple RAG searches (one per item)
- Multiple `add_to_cart` function calls
- Intent remains `order_taking` throughout

**MongoDB Session:**
```javascript
{
  state: "COLLECTING_ORDER",
  context: {
    cart: [
      { name: "שקשוקה", price: 35, quantity: 1 },
      { name: "קפה", price: 12, quantity: 1 }
    ]
  }
}
```

**✅ Pass Criteria:**
- Both items recognized
- Both items added to cart
- Correct prices retrieved
- State remains COLLECTING_ORDER
- No duplicate additions

---

### Test 3: General Information Query

**Objective:** Verify non-order information handling

**Test Steps:**
1. Call Vapi number
2. Say: **"אתם כשרים?"** (Are you kosher?)
3. Wait for response
4. Say: **"מה שעות הפתיחה?"** (What are the opening hours?)
5. Wait for response

**Expected Bot Behavior:**
1. Answers kashrut question from knowledge base
2. Answers hours question from knowledge base
3. Does NOT transition to order taking
4. Maintains friendly conversational tone

**Expected System Behavior:**

**Langfuse Trace:**
- Intent: `general_info` (global intent)
- RAG Search: Returns info items (not menu)
- Function: `get_restaurant_info` called
- No state change (global intent)

**MongoDB Session:**
```javascript
{
  state: "GREETING",  // State unchanged
  lastIntent: "general_info",
  conversationHistory: [
    { role: "user", content: "אתם כשרים?", ... },
    { role: "assistant", content: "כן, אנחנו...", ... }
  ]
}
```

**✅ Pass Criteria:**
- Correct answers from knowledge base
- No state transition
- Intent classified as `general_info`
- No function execution (except get_restaurant_info)

---

### Test 4: Cart Update (Modification)

**Objective:** Verify cart modification functionality

**Test Steps:**
1. Order shakshuka (see Test 1)
2. Say: **"תסיר את השקשוקה"** (Remove the shakshuka)
3. Wait for confirmation
4. Say: **"במקום תוסיף פיצה"** (Instead add pizza)
5. Verify cart updated

**Expected Bot Behavior:**
1. Confirms removal
2. Adds new item
3. Provides updated cart summary

**Expected System Behavior:**

**Langfuse Trace:**
- Intent: `cart_update`
- Function: `update_cart` called with removal
- Function: `add_to_cart` called with pizza
- State remains COLLECTING_ORDER

**MongoDB Session:**
```javascript
{
  context: {
    cart: [
      { name: "פיצה", price: 45, quantity: 1 }
      // shakshuka removed
    ]
  }
}
```

**✅ Pass Criteria:**
- Item successfully removed
- New item added
- Cart reflects changes
- Bot confirms modifications

---

### Test 5: Cart Summary Request

**Objective:** Verify cart summary functionality

**Test Steps:**
1. Order 2-3 items (use Test 2)
2. Say: **"מה יש לי בהזמנה?"** (What's in my order?)
3. Wait for summary
4. Verify accuracy

**Expected Bot Behavior:**
1. Lists all items in cart
2. Mentions quantities
3. Provides total price
4. Asks if customer wants to continue ordering

**Expected System Behavior:**

**Langfuse Trace:**
- Intent: Should be `cart_summary` or similar
- Function: `get_cart_summary` executed
- Response includes all items

**MongoDB Session:**
- Cart unchanged
- Function results logged

**✅ Pass Criteria:**
- All items mentioned
- Correct quantities
- Accurate total price
- Natural Hebrew summary

---

### Test 6: Complete End-to-End Flow

**Objective:** Verify full order lifecycle

**Test Steps:**

**Phase 1: Ordering**
1. Call Vapi number
2. Order: **"אני רוצה המבורגר וקולה"** (I want burger and cola)
3. Confirm additions

**Phase 2: Cart Verification**
4. Ask: **"מה יש לי בהזמנה?"** (What's in my order?)
5. Verify cart summary

**Phase 3: Checkout Initiation**
6. Say: **"כן, אני מאשר את ההזמנה"** (Yes, I confirm the order)

**Phase 4: Details Collection**
7. Bot asks for name → Provide: **"דוד כהן"** (David Cohen)
8. Bot asks for phone → Provide: **"050-1234567"**
9. Bot asks delivery/pickup → Say: **"משלוח"** (Delivery)
10. Bot asks for address → Provide: **"רחוב הרצל 123, תל אביב"**

**Phase 5: Final Confirmation**
11. Bot summarizes order + details
12. Say: **"כן, בטח"** (Yes, sure)

**Phase 6: Order Placement**
13. Bot confirms order placed
14. Provides order number/estimated time

**Expected State Transitions:**
```
GREETING
  ↓ (order_taking intent)
COLLECTING_ORDER
  ↓ (confirm_order intent)
COLLECTING_DETAILS
  ↓ (all details collected)
CONFIRMING_ORDER
  ↓ (final confirmation)
ORDER_PLACED
```

**Expected System Behavior:**

**Langfuse Trace:**
- Multiple intents across conversation
- State transitions logged
- All customer details extracted
- `place_order` function executed

**MongoDB Orders Collection:**
```javascript
{
  callId: "...",
  restaurantId: ObjectId("..."),
  items: [
    { name: "המבורגר", price: 50, quantity: 1 },
    { name: "קולה", price: 10, quantity: 1 }
  ],
  totalAmount: 60,
  customerName: "דוד כהן",
  phoneNumber: "050-1234567",
  deliveryType: "delivery",
  deliveryAddress: "רחוב הרצל 123, תל אביב",
  status: "placed",
  placedAt: ISODate("...")
}
```

**✅ Pass Criteria:**
- All state transitions correct
- Customer details captured accurately
- Order saved to MongoDB
- All required fields populated
- Bot provides order confirmation
- Total duration < 3 minutes

---

### Test 7: Order Cancellation

**Objective:** Verify cancellation handling

**Test Steps:**
1. Start ordering items
2. Say: **"בטל את ההזמנה"** (Cancel the order)
3. OR say: **"אני רוצה לבטל"** (I want to cancel)

**Expected Bot Behavior:**
1. Acknowledges cancellation request
2. Confirms cancellation
3. Apologizes/offers assistance
4. Asks if caller needs anything else

**Expected System Behavior:**

**Langfuse Trace:**
- Intent: `cancel_order` (global intent)
- State transition to ORDER_PLACED (terminal state)
- No order created in MongoDB

**MongoDB Session:**
```javascript
{
  state: "ORDER_PLACED",
  context: {
    cart: []  // Cart cleared
  },
  lastIntent: "cancel_order"
}
```

**✅ Pass Criteria:**
- Bot acknowledges cancellation
- State moves to ORDER_PLACED
- Cart cleared
- No order in database
- Polite apologetic response

---

### Test 8: Transfer to Human Request

**Objective:** Verify human agent transfer

**Test Steps:**
1. At any point, say: **"אני רוצה לדבר עם אדם"** (I want to speak to a person)
2. OR say: **"תעביר אותי למישהו"** (Transfer me to someone)

**Expected Bot Behavior:**
1. Acknowledges request
2. Explains transfer process
3. Provides restaurant phone number or transfers call
4. Thanks caller

**Expected System Behavior:**

**Langfuse Trace:**
- Intent: `transfer` (global intent)
- Function: `redirect_to_human` executed
- State transition to ORDER_PLACED

**MongoDB Session:**
```javascript
{
  state: "ORDER_PLACED",
  lastIntent: "transfer"
}
```

**Vapi Behavior:**
- May end call
- OR may transfer to configured number
- Depends on Vapi transfer configuration

**✅ Pass Criteria:**
- Bot acknowledges request
- Provides human contact info
- Polite handoff message
- Intent logged correctly

---

## Validation Procedures

### A. Langfuse Trace Validation

For each test scenario, validate the Langfuse trace:

**1. Access Trace:**
- Go to https://cloud.langfuse.com
- Find trace by conversationId or timestamp
- Open trace details

**2. Check Trace Components:**

✅ **Trace Metadata:**
- User ID: Phone number
- Model: `gemini-3-flash`
- Restaurant ID present

✅ **Intent Classification Span:**
- Name: `intent_classification`
- Metadata: `{ intent: "...", confidence: 0.XX }`
- Duration: < 500ms

✅ **RAG Search Span (if applicable):**
- Name: `rag_search`
- Metadata: `{ resultCount: N }`
- Duration: < 300ms

✅ **State Transition Span:**
- Name: `state_transition`
- Metadata: `{ previousState: "...", newState: "..." }`
- Duration: < 50ms

✅ **Function Execution Span (if applicable):**
- Name: `function_execution`
- Metadata: `{ functions: [...], results: [...] }`
- Duration: < 1000ms

✅ **LLM Generation:**
- Name: `llm_response`
- Model: `gemini-3-flash`
- Input: System prompt + user message
- Output: Hebrew response
- Usage: Token counts
- Duration: < 1500ms

**3. Validate Latency:**
- Total trace duration: < 3000ms
- No single span > 2000ms
- Majority of time in LLM generation (expected)

---

### B. MongoDB Validation

**1. Check Sessions Collection:**

```javascript
// Access MongoDB
use restaurant_phone_agent

// Find most recent session
db.sessions.find({}).sort({createdAt: -1}).limit(1).pretty()
```

**Validate Session Document:**

✅ **conversationId:**  UUID format
✅ **restaurantId:** Valid ObjectId
✅ **state:** Valid state (GREETING, COLLECTING_ORDER, etc.)
✅ **context:**
  - `cart`: Array of items (or empty)
  - `customerName`: String or null
  - `phoneNumber`: String or null
  - `deliveryType`: "delivery"/"pickup" or null
  - `deliveryAddress`: String or null
✅ **conversationHistory:** Array of messages with roles and timestamps
✅ **lastIntent:** Valid intent string
✅ **createdAt, updatedAt:** Proper timestamps

**2. Check Orders Collection (for complete flow test):**

```javascript
// Find most recent order
db.orders.find({}).sort({placedAt: -1}).limit(1).pretty()
```

**Validate Order Document:**

✅ **callId:** Matches session conversationId
✅ **restaurantId:** Matches session restaurantId
✅ **items:** Array with at least 1 item
  - Each item has: name, price, quantity
✅ **totalAmount:** Correct sum of (price × quantity)
✅ **status:** "placed"
✅ **customerName:** Not null, matches user input
✅ **phoneNumber:** Not null, valid format
✅ **deliveryType:** "delivery" or "pickup"
✅ **deliveryAddress:** Present if deliveryType = "delivery"
✅ **placedAt:** Recent timestamp

---

### C. ngrok Inspector Validation

**1. Access Inspector:**
- Open http://localhost:4040
- View recent requests

**2. Validate Requests:**

✅ **Request Method:** POST
✅ **Request Path:** `/v1/chat/completions`
✅ **Request Headers:**
  - Content-Type: application/json
  - User-Agent: Contains "Vapi"
✅ **Request Body:**
  ```json
  {
    "messages": [...],  // Array with conversation history
    "model": "gemini-3-flash",  // May be present
    "call": {  // May be present
      "id": "...",
      "customer": {"number": "..."}
    }
  }
  ```
✅ **Response Status:** 200
✅ **Response Headers:**
  - Content-Type: application/json
✅ **Response Body:**
  ```json
  {
    "id": "chatcmpl-...",
    "object": "chat.completion",
    "model": "gemini-3-flash",
    "choices": [{
      "message": {
        "role": "assistant",
        "content": "..."  // Hebrew text
      },
      "finish_reason": "stop"
    }],
    "usage": {
      "prompt_tokens": N,
      "completion_tokens": N,
      "total_tokens": N
    }
  }
  ```

**3. Validate Latency:**
- Request duration: < 2000ms (shown in ngrok)
- If > 2000ms, check which component is slow

---

### D. Application Logs Validation

**1. Review Terminal 2 (Node.js app):**

**Expected Log Sequence:**

```
info: Chat completion request received {
  conversationId: '...',
  messageCount: N,
  restaurantId: '...'
}

info: Parallel processing complete {
  intent: '...',
  confidence: 0.XX,
  ragResultCount: N,
  duration: XXXms
}

info: Function executed {
  functionName: '...',
  success: true,
  duration: XXXms
}

info: LLM response generated {
  model: 'gemini-3-flash',
  tokensUsed: XXX,
  duration: XXXXms
}

info: Chat completion request processed {
  conversationId: '...',
  intent: '...',
  state: '...',
  totalDuration: XXXXms,
  breakdown: {
    parallel: XXXms,
    stateTransition: XXms,
    functionExecution: XXXms,
    promptBuilding: XXms,
    llmCall: XXXms,
    sessionUpdate: XXms
  }
}
```

**2. Check for Errors:**

```bash
# Search for errors
cat logs/combined.log | grep ERROR

# Should return empty or only non-critical errors
```

---

## Performance Benchmarks

### Latency Targets

| Component | Target | Max Acceptable |
|-----------|--------|----------------|
| Intent Classification | < 300ms | < 500ms |
| RAG Search | < 200ms | < 400ms |
| State Transition | < 50ms | < 100ms |
| Function Execution | < 500ms | < 1000ms |
| Prompt Building | < 100ms | < 200ms |
| LLM Call (Gemini) | < 1000ms | < 2000ms |
| Session Update | < 100ms | < 300ms |
| **Total End-to-End** | **< 2000ms** | **< 3000ms** |

### Token Usage

| Scenario | Expected Prompt Tokens | Expected Completion Tokens | Total |
|----------|------------------------|---------------------------|-------|
| Simple order | 100-150 | 30-50 | ~150-200 |
| Multi-item order | 150-200 | 50-80 | ~200-280 |
| General info | 120-170 | 40-70 | ~160-240 |
| Cart summary | 130-180 | 60-100 | ~190-280 |
| Complete flow (avg) | 140-190 | 45-75 | ~185-265 |

### Cost Estimates (Gemini 3 Flash)

- Input: $0.075 per 1M tokens
- Output: $0.30 per 1M tokens

**Example Conversation (10 turns, ~2000 total tokens):**
- Cost: ~$0.0006 (less than a tenth of a cent)

**1000 conversations:**
- Estimated cost: ~$0.60

---

## Common Issues

### Issue: High Latency

**Diagnosis:**
- Check Langfuse breakdown
- Identify slowest component

**Solutions:**
- **RAG Search slow:** Reduce limit from 10 to 5
- **LLM slow:** Check Gemini API status
- **ngrok slow:** Consider paid plan or production deployment

---

### Issue: Incorrect Intent Classification

**Diagnosis:**
- Check Langfuse: what intent was detected?
- Compare with expected intent

**Solutions:**
- Review intent classifier training examples
- Add more examples for misclassified phrases
- Check confidence score (< 0.7 may indicate ambiguity)

---

### Issue: Cart Not Updating

**Diagnosis:**
- Check MongoDB: cart array in session
- Check Langfuse: was function executed?

**Solutions:**
- Verify function execution in logs
- Check state allows cart updates
- Test functions individually

---

### Issue: State Machine Stuck

**Diagnosis:**
- Check MongoDB: current state
- Check Langfuse: state transition history

**Solutions:**
- Review state machine rules in `stateMachine.js`
- Check missing context fields
- Manually reset session if needed:
  ```javascript
  db.sessions.updateOne(
    {conversationId: "..."},
    {$set: {state: "GREETING"}}
  )
  ```

---

## Test Completion Checklist

After running all 8 test scenarios, verify:

- [ ] All scenarios passed
- [ ] Latency within acceptable range
- [ ] No errors in application logs
- [ ] All Langfuse traces complete
- [ ] MongoDB data accurate
- [ ] Hebrew text handled correctly
- [ ] State transitions working
- [ ] Functions executing properly
- [ ] Order creation successful
- [ ] Bot responses natural and helpful

---

## Reporting Issues

When reporting test failures, include:

1. **Test Scenario Number** (e.g., "Test 5: Cart Summary Request")
2. **What you said** (exact Hebrew phrase)
3. **What bot said** (bot's response)
4. **Expected behavior**
5. **Langfuse Trace URL**
6. **ngrok Request ID** (from inspector)
7. **Application logs** (relevant ERROR lines)
8. **MongoDB Session ID**
9. **Screenshots** (if applicable)

---

## Next Steps

After successful testing:

1. **Document any issues found**
2. **Fix critical bugs**
3. **Re-run failed tests**
4. **Performance optimization** (if latency > 3s)
5. **Plan production deployment**
6. **Set up monitoring alerts**
