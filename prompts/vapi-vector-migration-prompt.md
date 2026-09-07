# Hebrew Vapi Restaurant Agent - Refactor Migration Guide

## Overview
We're refactoring the existing Hebrew Vapi restaurant phone ordering system to eliminate latency and improve real-time conversation quality. Currently, the agent calls blocking `get_restaurant_context()` and `get_menu()` on call start, loading massive amounts of data into the prompt mid-call, which breaks the real-time GPT model. 

We're switching to a static system prompt approach with vector-based menu search on-demand.

---

## Current Problem vs. Target Solution

### Current State (What's Breaking):
- On call start: agent calls `get_restaurant_context()` (blocking)
- Then: agent calls `get_menu()` (blocking, fetches ALL menu items)
- These block the real-time conversation flow
- Model struggles processing massive context mid-call
- Latency & conversation quality suffer

### Target State (What We're Fixing):
- System prompt has ALL restaurant static data baked in at dashboard setup time
- No blocking context fetches during the call
- Menu lives in vector DB, searched on-demand via `search_menu(query)` tool
- Agent only loads menu items relevant to what customer asks for
- Fast, clean conversations with real-time GPT performance

---

## What Needs to Change

### 1. Database Schema Changes

**Remove from Restaurant schema:**
- Delete the `menu` array field (menu items move to separate collection)

**Keep in Restaurant schema:**
- All fields stay: name, phoneNumber, vapiPhoneNumber, meshulamApiKey, meshulamTerminalNumber
- systemPrompt, firstMessage, businessInfo, businessHours, address, humanRedirectPhone, settings

**Create NEW MenuItems Collection:**
Menu items are now stored separately with vector embeddings:

```javascript
const menuItemSchema = new mongoose.Schema({
  restaurantId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Restaurant",
    required: true,
    index: true
  },
  name: {
    type: String,
    required: true
  },
  description: String,
  price: {
    type: Number,
    required: true,
    min: 0
  },
  category: {
    type: String,
    required: true
  },
  inStock: {
    type: Boolean,
    default: true,
    index: true
  },
  embedding: {
    type: [Number],  // Vector embedding (1536 dims for text-embedding-3-small)
    required: true,
    index: true
  },
  embeddingModel: {
    type: String,
    default: "text-embedding-3-small"
  }
}, {
  timestamps: true
});

menuItemSchema.index({ restaurantId: 1, inStock: 1 });
module.exports = mongoose.model("MenuItem", menuItemSchema);
```

### 2. Migration Script
Create a one-time migration to move existing menu data:

```javascript
// scripts/migrateMenuToVector.js
const Restaurant = require('../models/Restaurant');
const MenuItem = require('../models/MenuItem');
const { generateEmbedding } = require('../utils/embeddings');

async function migrateMenus() {
  const restaurants = await Restaurant.find();
  
  for (const restaurant of restaurants) {
    console.log(`Migrating menu for ${restaurant.name}...`);
    
    for (const menuItem of restaurant.menu) {
      // Generate embedding for each item
      const embedding = await generateEmbedding(
        `${menuItem.name} ${menuItem.description}`
      );
      
      // Create new MenuItem document
      await MenuItem.create({
        restaurantId: restaurant._id,
        name: menuItem.name,
        description: menuItem.description,
        price: menuItem.price,
        category: menuItem.category,
        inStock: menuItem.inStock,
        embedding: embedding,
        embeddingModel: "text-embedding-3-small"
      });
    }
    
    // Remove menu array from restaurant doc
    restaurant.menu = undefined;
    await restaurant.save();
  }
  
  console.log("Migration complete!");
}

migrateMenus().catch(console.error);
```

Run this once:
```bash
node scripts/migrateMenuToVector.js
```

---

## System Prompt Refactor

### Current System Prompt (Remove These Blocking Calls)
Your current prompt has:
```
[CRITICAL RULE - YOU MUST FOLLOW THIS EXACTLY]
1. When the call starts, immediately call get_restaurant_context()
2. WAIT for the response
3. After receiving context, call get_menu()
4. WAIT for menu response
...
```

**DELETE everything related to `get_restaurant_context()` and `get_menu()` calls.**

### New System Prompt (What to Put in Vapi Dashboard)

For each restaurant, edit the Vapi Assistant in the dashboard and set the system prompt to something like this (customize with actual restaurant data):

```
[Identity]
You are a dedicated phone AI assistant for מסעדת הבוקרים.
You speak ONLY in Hebrew to customers at all times.
Your restaurantId is: 692b23ace32a5f99dd0bbc2f

[Restaurant Information]
- Name: מסעדת הבוקרים
- Phone: +972-50-526-7951
- Business Type: כשר בשרים - Kosher Meat Restaurant
- Address: [INSERT ACTUAL ADDRESS]
- Hours: Sunday-Thursday 11:00-23:00 | Friday 11:00-15:00 | Saturday Closed
- Policies:
  * No dogs allowed
  * Happy hour: 17:00-19:00 (20% off selected items)
  * Delivery available
  * Minimum order: 50₪
  * Dine-in reservations available
- Human Support Phone: +972-50-526-7951

[Custom Instructions from Restaurant Owner]
[INSERT CONTENT FROM systemPrompt FIELD IN DATABASE]

[Starting Greeting - USE THIS EXACT TEXT]
"שלום ובוקר טוב! מסעדת הבוקרים, איך אוכל לעזור לך?"

[Style & Tone]
- Friendly, professional, warm
- Use natural Hebrew conversational flow
- Be concise but helpful
- Never rush the customer
- Maintain respect and patience

[Core Guidelines - CRITICAL]
1. Greet customer with EXACT greeting above
2. Listen for what they want to order
3. When customer mentions ANY food/drink items, call search_menu() with their query
   Example: Customer says "אני רוצה בשר" → call search_menu("בשר")
   Example: Customer says "יש לכם סלטים?" → call search_menu("סלטים")
4. ONLY mention items returned from search_menu() results (name, price, description, category)
5. Never invent menu items not in search results
6. If search returns no items: "אנחנו כרגע לא יכולים להציע את זה, אבל אנחנו כן מציעים [alternatives from search]"
7. Track quantity and price for each item as customer orders

[Phone Number Collection - DO NOT SKIP THIS]
When collecting phone number:
1. Ask: "אנא תגיד את המספר ספרה אחרי ספרה, לאט"
2. Customer speaks digits slowly
3. Repeat back digit-by-digit for confirmation: "בואי אאשר - 050... נכון?"
4. Confirm: "תודה רבה"
Note: Israeli numbers are 10 digits starting with 05

[Order Collection Flow]
1. Greet with EXACT greeting
2. Listen for what customer wants
3. For each item mentioned: call search_menu(query)
4. Build running order with: item name, quantity, price, category
5. Ask delivery type: "ביקום או משלוח?" (pickup or delivery?)
6. If delivery: "מה כתובת המשלוח?"
7. Collect customer name: "מה השם שלך?"
8. Collect phone number (digit by digit, with confirmation)
9. DO NOT SKIP: Final confirmation recap
   "אז אתה רוצה: [ITEMS], סה״כ [TOTAL]₪, [PICKUP/DELIVERY to ADDRESS]. זה נכון?"
10. Once confirmed, call place_order() with:
    - restaurantId: 692b23ace32a5f99dd0bbc2f
    - customerName: [collected]
    - phoneNumber: [collected]
    - items: [{name, quantity, price, category}, ...]
    - total: [calculated total]
    - paymentType: "pickup" or "delivery"
    - deliveryAddress: [if delivery]
11. Call create_payment_link(orderId, total)
12. Provide payment link: "הנה הקישור להתשלום: [LINK]"
13. Close: "תודה רבה! ההזמנה שלך בעיצומה"

[Available Tools - Use These]
- search_menu(query: string) - Search menu by Hebrew query
  * Input: What customer asked for (e.g., "סלט", "בשר", "משקה")
  * Output: Array of matching items with price, description, category, inStock status
  * Use WHENEVER customer mentions food/drink
  
- place_order(restaurantId, customerName, phoneNumber, items[], total, paymentType, deliveryAddress?)
  * restaurantId: Always use 692b23ace32a5f99dd0bbc2f (from this prompt)
  * items: [{name, quantity, price, category}, ...]
  * paymentType: "pickup" or "delivery"
  * Returns: orderId
  * CRITICAL: Only call after final confirmation recap
  
- create_payment_link(orderId, total)
  * Returns: {paymentLink, paymentLinkId}
  
- redirect_to_human(reason)
  * Transfer to human support
  * Use when: complex requests, complaints, customer explicitly asks
  * Do NOT add extra dialogue - just transfer

[Error Handling]
- If search_menu returns no results: "אני לא מצאתי את זה, אבל יש לנו..." + suggest similar categories
- If customer asks about unavailable item: "זה לא זמין עכשיו, אבל אנחנו יכולים להציע..." + alternatives
- If unclear: Ask polite clarifying question in Hebrew
- If customer frustrated: Offer to transfer to human agent

[MUST DO]
✅ Always use EXACT greeting from this prompt
✅ ALWAYS recap order before calling place_order()
✅ Collect name, phone (digit by digit), delivery type
✅ Use restaurantId from this prompt in place_order()
✅ Speak ONLY Hebrew to customers
✅ Never skip phone number collection

[MUST NOT DO]
❌ Do NOT call get_restaurant_context() or get_menu()
❌ Do NOT invent menu items
❌ Do NOT skip the final recap
❌ Do NOT process payment without confirmation
❌ Do NOT speak English to customers
❌ Do NOT provide info you're not sure about
```

### How to Set This Up in Vapi Dashboard

1. Go to your Vapi Assistant (in the Vapi dashboard)
2. Click "Edit" or "System Prompt"
3. Delete the old prompt with `get_restaurant_context()` and `get_menu()` calls
4. Paste the new prompt above (customized with actual restaurant data)
5. Add restaurantId to the prompt (copy from your Restaurant DB document _id field)
6. Make sure these tools are configured:
   - `search_menu`
   - `place_order`
   - `create_payment_link`
   - `redirect_to_human`
7. Save and test with a call

---

## Tool Changes

### Remove:
- ❌ `get_restaurant_context()` - No longer needed (context is in system prompt)
- ❌ `get_menu()` - No longer needed (replaced by vector search tool)

### Replace With:
- ✅ `search_menu(query)` - Vector similarity search for menu items

**Vapi Tool Definition for search_menu:**
```json
{
  "name": "search_menu",
  "description": "Search restaurant menu items based on what customer is asking for. Returns matching items with prices and availability.",
  "parameters": {
    "type": "object",
    "properties": {
      "query": {
        "type": "string",
        "description": "What customer is looking for (e.g., 'בשר', 'סלט', 'משקה', 'אוכל צמחוני'). Can be item name, category, or description in Hebrew."
      },
      "limit": {
        "type": "integer",
        "description": "Max number of results (default: 5)",
        "default": 5
      },
      "inStockOnly": {
        "type": "boolean",
        "description": "Only return items in stock (default: true)",
        "default": true
      }
    },
    "required": ["query"]
  },
  "returns": {
    "type": "array",
    "description": "Array of matching menu items",
    "items": {
      "type": "object",
      "properties": {
        "name": { "type": "string", "description": "Item name" },
        "description": { "type": "string", "description": "Item description" },
        "price": { "type": "number", "description": "Price in ILS" },
        "category": { "type": "string", "description": "Food category (e.g., Main, Appetizer)" },
        "inStock": { "type": "boolean", "description": "Is item available?" }
      }
    }
  }
}
```

### Keep (No Changes Needed):
- ✅ `place_order()` - But update to expect restaurantId in the prompt
- ✅ `create_payment_link()` 
- ✅ `redirect_to_human()`

### Backend Endpoint for search_menu

Create this new Express endpoint:

```javascript
// routes/vapi.js
router.post('/search-menu', async (req, res) => {
  const { restaurantId, query, limit = 5, inStockOnly = true } = req.body;

  try {
    // 1. Generate vector embedding for the user's query
    const queryEmbedding = await generateEmbedding(query);

    // 2. Build search filter
    let filter = { restaurantId: new ObjectId(restaurantId) };
    if (inStockOnly) {
      filter.inStock = true;
    }

    // 3. Find similar menu items using vector similarity
    const MenuItem = require('../models/MenuItem');
    const results = await MenuItem.find(filter)
      .select('name description price category inStock')
      .limit(limit)
      .lean();

    // 4. Calculate similarity scores (dot product of embeddings)
    const withScores = results.map(item => ({
      ...item,
      score: dotProduct(item.embedding, queryEmbedding)
    }));

    // 5. Sort by similarity score and return top results
    const sorted = withScores
      .sort((a, b) => b.score - a.score)
      .map(({ score, embedding, ...item }) => item) // Remove embedding & score from response
      .slice(0, limit);

    res.json(sorted);
  } catch (error) {
    console.error('Menu search error:', error);
    res.status(500).json({ error: 'Failed to search menu' });
  }
});
```

### Helper Function - Generate Embeddings

Create `utils/embeddings.js`:

```javascript
const OpenAI = require('openai');

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

// Cache embeddings to avoid repeated API calls
const embeddingCache = new Map();

async function generateEmbedding(text) {
  // Check cache first
  if (embeddingCache.has(text)) {
    return embeddingCache.get(text);
  }

  try {
    const response = await openai.embeddings.create({
      model: 'text-embedding-3-small',
      input: text
    });

    const embedding = response.data[0].embedding;
    
    // Cache for future use
    embeddingCache.set(text, embedding);
    
    return embedding;
  } catch (error) {
    console.error('Embedding generation error:', error);
    throw new Error('Failed to generate embedding');
  }
}

// Cosine similarity (dot product)
function dotProduct(a, b) {
  return a.reduce((sum, val, i) => sum + val * b[i], 0);
}

module.exports = { generateEmbedding, dotProduct };
```

---

## Implementation Steps (Refactor Existing App)

### Phase 1: Setup Embeddings Infrastructure
1. ✅ Install OpenAI library: `npm install openai`
2. ✅ Create `utils/embeddings.js` with `generateEmbedding()` and `dotProduct()` functions
3. ✅ Add `OPENAI_API_KEY` to `.env`
4. ✅ Test embedding generation with sample text

### Phase 2: Database Migration
1. ✅ Create `models/MenuItem.js` schema (see schema section above)
2. ✅ Create one-time migration script `scripts/migrateMenuToVector.js` (see migration script above)
3. ✅ Run migration: `node scripts/migrateMenuToVector.js`
   - This extracts menu from each Restaurant document
   - Generates embeddings for each item
   - Creates MenuItem documents
   - Removes menu array from Restaurant documents
4. ✅ Verify in MongoDB that MenuItems collection is populated

### Phase 3: Create search_menu Backend Endpoint
1. ✅ Create `routes/vapi.js` with POST `/search-menu` endpoint
2. ✅ Implement vector similarity search logic
3. ✅ Test endpoint with sample queries:
   ```bash
   curl -X POST http://localhost:3000/api/vapi/search-menu \
     -H "Content-Type: application/json" \
     -d '{"restaurantId": "692b23ace32a5f99dd0bbc2f", "query": "בשר"}'
   ```
4. ✅ Verify results are relevant and sorted by similarity

### Phase 4: Update Vapi Assistants in Dashboard
For **each restaurant** in the Vapi dashboard:

1. ✅ Click to edit the assistant
2. ✅ Go to System Prompt section
3. ✅ **DELETE** everything with `get_restaurant_context()` and `get_menu()` calls
4. ✅ **PASTE** the new system prompt template (see System Prompt section above)
5. ✅ **Customize** for that restaurant:
   - Replace `[INSERT ACTUAL ADDRESS]` with real address
   - Replace `[INSERT CONTENT FROM systemPrompt FIELD]` with custom owner instructions
   - Add correct restaurantId from DB
   - Verify firstMessage, hours, policies are correct
6. ✅ **Configure tools:**
   - Add tool: `search_menu` (use JSON definition above)
   - Verify `place_order` exists
   - Verify `create_payment_link` exists
   - Verify `redirect_to_human` exists
7. ✅ **Save** the assistant
8. ✅ Test with a phone call to verify it works

### Phase 5: Test End-to-End Flow
1. ✅ Make a test call to the restaurant's Vapi number
2. ✅ Verify greeting matches firstMessage
3. ✅ Ask for a menu item: "יש לכם בשר?"
4. ✅ Agent should call search_menu("בשר") and return results
5. ✅ Place a test order and verify:
   - Agent collects items correctly
   - Agent asks for delivery type
   - Agent collects name (correctly in Hebrew)
   - Agent collects phone (digit by digit)
   - Agent recaps order
   - Agent calls place_order() with restaurantId
   - Order appears in DB
6. ✅ Verify conversation latency is improved
7. ✅ Verify no model breakdowns or stuttering

### Phase 6: Monitor & Optimize
1. ✅ Log all search_menu queries (for analytics)
2. ✅ If search results are irrelevant, tune similarity threshold
3. ✅ If search returns empty, implement fallback suggestions
4. ✅ Collect feedback from restaurant owners
5. ✅ Adjust system prompt based on real conversations

---

## Quick Reference: What to Change in Your Existing Code

### In Vapi Dashboard:
- ❌ Remove: `get_restaurant_context()` tool from assistant config
- ❌ Remove: `get_menu()` tool from assistant config
- ✅ Update system prompt: Remove blocking context fetches, add static data
- ✅ Add: `search_menu` tool definition

### In Express Backend:
- ✅ Add: `POST /api/vapi/search-menu` endpoint
- ✅ Add: `utils/embeddings.js` with embedding generation
- ✅ Keep: Existing `place_order` endpoint (no changes needed)
- ✅ Keep: Existing `create_payment_link` endpoint (no changes needed)
- ✅ Keep: Existing `redirect_to_human` endpoint (no changes needed)

### In MongoDB:
- ✅ Create: `MenuItems` collection
- ✅ Update: `Restaurant` schema (remove menu array)
- ✅ Migrate: Existing menu data via migration script

### In .env:
- ✅ Add: `OPENAI_API_KEY` for embedding generation

---

## Key Technical Details

### Vector Embeddings
- **Model**: OpenAI `text-embedding-3-small` (1536 dimensions)
- **Why**: Fast, cheap, supports Hebrew well
- **Caching**: Cache embeddings in memory to avoid repeated API calls
- **Similarity metric**: Dot product (cosine similarity)

### How Vector Search Works
1. User query comes in: "אני רוצה בשר"
2. Generate embedding for query via OpenAI
3. Compare query embedding to all MenuItem embeddings in DB
4. Sort by dot product similarity score
5. Return top 5 matching items
6. Agent reads and mentions them to customer

### Why This Fixes Latency
- **Before**: Load 50 menu items → parse entire menu → add to context → model processes → respond (SLOW)
- **After**: Query comes in → search DB for 5 relevant items → agent mentions them → respond (FAST)

### restaurantId in System Prompt
Add this to the prompt for each restaurant:
```
Your restaurantId is: 692b23ace32a5f99dd0bbc2f
```

When agent calls `place_order()`, it references this ID from the prompt. Your backend receives the tool call, extracts restaurantId from the parameters, and creates the order.

---

## Debugging & Troubleshooting

**If search_menu returns irrelevant results:**
- Check if embeddings are generated correctly
- Verify similarity threshold is reasonable
- Try more specific queries in the test
- Adjust prompt to guide agent to be more specific

**If search_menu returns empty:**
- Check restaurantId is correct in system prompt
- Verify MenuItems collection is populated
- Check inStockOnly filter is set correctly
- Fallback: Agent should suggest popular categories

**If conversation is still slow:**
- Verify no calls to old `get_restaurant_context()` or `get_menu()`
- Check system prompt size (should be <5KB)
- Test embedding generation speed
- Monitor OpenAI API latency

**If agent forgets restaurantId:**
- Verify restaurantId is in system prompt
- Check it's spelled correctly in prompt
- Test with simple phrase to ensure agent reads it

---

## File Structure After Refactor

```
project/
├── models/
│   ├── Restaurant.js       (UPDATED: remove menu array)
│   ├── MenuItem.js         (NEW: menu items with embeddings)
│   └── Order.js
├── routes/
│   └── vapi.js             (NEW: search_menu endpoint)
├── utils/
│   └── embeddings.js       (NEW: embedding generation)
├── scripts/
│   └── migrateMenuToVector.js  (NEW: one-time migration)
├── .env                    (UPDATED: add OPENAI_API_KEY)
└── server.js
```

---

## Migration Checklist

- [ ] Install OpenAI library
- [ ] Create embeddings.js utility
- [ ] Create MenuItem.js schema
- [ ] Create migration script
- [ ] Add OPENAI_API_KEY to .env
- [ ] Run migration script (one-time)
- [ ] Verify MenuItems collection is populated
- [ ] Create search_menu backend endpoint
- [ ] Test search_menu with sample queries
- [ ] For EACH restaurant in Vapi dashboard:
  - [ ] Edit system prompt (remove blocking calls)
  - [ ] Paste new system prompt template
  - [ ] Customize with restaurant data
  - [ ] Add restaurantId to prompt
  - [ ] Configure search_menu tool
  - [ ] Save and test with a call
- [ ] Test full order flow end-to-end
- [ ] Verify latency improvements
- [ ] Monitor for issues in production

---

## How Vapi Tools Work (Context for This Project)

When agent calls a tool during a call, Vapi:
1. Pauses the conversation
2. Sends HTTP POST to your backend with tool parameters
3. Waits for response
4. Resumes conversation with the response

**Example: search_menu flow**
```
Agent: "בואי אחפש לך בשר" 
→ Agent calls: search_menu("בשר", limit=5)
→ Vapi sends POST to your backend
→ Backend queries MenuItems collection with embeddings
→ Backend returns: [{name: "סטייק", price: 89}, ...]
→ Agent continues: "יש לנו סטייק ב-89 שקל..."
```

Make sure your backend responds quickly (< 2 seconds ideal).

---

## Expected Results After Refactor

✅ No blocking context fetches on call start  
✅ Conversation starts immediately with greeting  
✅ Real-time responses when agent mentions items  
✅ No model breakdown from massive context  
✅ Smooth, natural Hebrew conversation flow  
✅ Agent only loads relevant menu items when needed  
✅ Restaurant owner can manage menu easily (just add/remove/edit MenuItem docs)  

---

## Questions & Notes for When You Implement

1. **Similarity threshold tuning**: After first few calls, check if search results are relevant. Adjust if needed.
2. **FAQ vector DB**: You mentioned wanting this for random questions. Can add separate `FAQItems` collection later with same vector approach.
3. **Menu updates**: When restaurant updates menu, just update MenuItem docs. Embeddings will be regenerated on next search (or use a webhook to regenerate immediately).
4. **Analytics**: Log every search_menu call to track what customers ask for.
5. **Fallbacks**: If no search results, have agent suggest menu categories instead of silence.

