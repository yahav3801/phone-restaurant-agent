# Vapi Assistant Setup Guide

Complete guide for configuring Vapi AI to use your custom LLM endpoint with Gemini 3 Flash.

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [System Architecture](#system-architecture)
3. [Ngrok Setup](#ngrok-setup)
4. [Vapi Assistant Configuration](#vapi-assistant-configuration)
5. [Testing the Integration](#testing-the-integration)
6. [Troubleshooting](#troubleshooting)

---

## Prerequisites

Before starting, ensure you have:

### ✅ Required Services Running

**Terminal 1: LiteLLM Proxy**
```bash
cd /path/to/restaurant_phone_agent
litellm --config litellm_config.yaml --port 4000
```
- Should show: `Uvicorn running on http://0.0.0.0:4000`
- Test: `curl http://localhost:4000/health`

**Terminal 2: Node.js Application**
```bash
cd /path/to/restaurant_phone_agent
npm start
```
- Should show: `Server running on port 3000`
- Test: `curl http://localhost:3000/health`

**Terminal 3: ngrok Tunnel**
```bash
ngrok http 3000
```
- Will provide HTTPS URL (needed for Vapi)
- Dashboard at: http://localhost:4040

### ✅ Required Accounts

- Vapi account: https://dashboard.vapi.ai
- ngrok account: https://dashboard.ngrok.com
- Gemini API key configured in `.env`

### ✅ Environment Variables

Ensure `.env` contains:
```bash
GEMINI_API_KEY=your_gemini_api_key
LITELLM_URL=http://localhost:4000
MONGODB_URI=mongodb://localhost:27017/restaurant_phone_agent
LANGFUSE_SECRET_KEY=your_langfuse_key
LANGFUSE_PUBLIC_KEY=your_langfuse_public_key
```

---

## System Architecture

### Request Flow

```
📞 Phone Call
    ↓
🎙️  Vapi Assistant (Azure Transcriber: he-IL)
    ↓
    Transcribes Hebrew speech to text
    ↓
🌐 HTTPS POST to Custom LLM Endpoint
    https://your-ngrok-url.ngrok-free.app/v1/chat/completions
    ↓
🔒 ngrok Tunnel (localhost proxy)
    ↓
💻 Node.js App (localhost:3000)
    /v1/chat/completions → chat.js handler
    ↓
    ┌─────────────────────────────────────┐
    │ 12-Step Orchestration Pipeline:     │
    │ 1. Extract conversation ID          │
    │ 2. Load/create session              │
    │ 3. Parallel: Intent + RAG search    │
    │ 4. State transition                 │
    │ 5. Execute functions (if needed)    │
    │ 6. Build dynamic prompt             │
    │ 7. Call LiteLLM                     │
    │ 8. Update session                   │
    │ 9. Log to Langfuse                  │
    └─────────────────────────────────────┘
    ↓
🔄 LiteLLM Proxy (localhost:4000)
    ↓
🤖 Gemini 3 Flash API
    ↓
📝 Hebrew Response (JSON)
    ↓
🌐 Back through ngrok to Vapi
    ↓
🔊 Vapi TTS (Cartesia Sonic 3: Hebrew)
    ↓
📞 Phone (Audio response)
```

### Why This Architecture?

1. **Custom LLM Control:**
   - Full control over prompting (promptBuilder.js)
   - State machine orchestration (stateMachine.js)
   - RAG integration (ragSearch.js)
   - Function execution (functions.js)

2. **Cost Optimization:**
   - Gemini 3 Flash: 97% cheaper than GPT-4o
   - Pay-per-use model

3. **Observability:**
   - All requests logged to Langfuse
   - Full conversation history in MongoDB
   - Request inspection via ngrok dashboard

---

## Ngrok Setup

### 1. Installation

**Mac/Linux:**
```bash
brew install ngrok
```

**Windows (PowerShell as Admin):**
```bash
choco install ngrok
```

**Manual Download:**
- Visit: https://ngrok.com/download
- Extract to a folder in your PATH

**Verify Installation:**
```bash
ngrok version
```

### 2. Account Setup

1. **Sign up** (free tier is sufficient):
   https://dashboard.ngrok.com/signup

2. **Get your auth token:**
   https://dashboard.ngrok.com/get-started/your-authtoken

3. **Configure ngrok:**
   ```bash
   ngrok config add-authtoken YOUR_AUTH_TOKEN_HERE
   ```

### 3. Start ngrok Tunnel

```bash
ngrok http 3000
```

**Expected Output:**
```
ngrok

Session Status                online
Account                       Your Name (Plan: Free)
Version                       3.x.x
Region                        United States (us)
Latency                       50ms
Web Interface                 http://127.0.0.1:4040
Forwarding                    https://abc123def456.ngrok-free.app -> http://localhost:3000

Connections                   ttl     opn     rt1     rt5     p50     p90
                              0       0       0.00    0.00    0.00    0.00
```

**Important:**
- **Copy the HTTPS URL:** `https://abc123def456.ngrok-free.app`
- This URL changes every time you restart ngrok (free tier)
- Keep this terminal running while testing

### 4. ngrok Web Interface

Access the ngrok inspector at: **http://localhost:4040**

**Features:**
- Real-time request logs
- Request/response inspection
- Replay functionality
- Latency metrics

**Use this to debug:**
- Vapi request format
- Response validation
- Error diagnosis

### 5. Optional: Static Domain (Paid)

**Free Tier Limitation:**
- URL changes on every restart
- Must update Vapi configuration each time

**Paid ngrok ($8/month):**
- Static domain (e.g., `myrestaurant.ngrok.app`)
- No need to update Vapi after restarts
- Better for production testing

---

## Vapi Assistant Configuration

### 1. Create New Assistant

1. Go to: https://dashboard.vapi.ai
2. Click: **"Create Assistant"**
3. Select: **"Assistant"** (NOT "Workflow")

### 2. Basic Settings

**Name:**
```
מסעדת הבוקרים - AI Agent
```

**Description:**
```
Hebrew restaurant phone agent using custom LLM (Gemini 3 Flash) with state machine orchestration
```

### 3. Model Configuration

**Provider:**
- Select: **"Custom LLM"**

**Model URL:**
```
https://YOUR_NGROK_URL_HERE.ngrok-free.app/v1/chat/completions
```
⚠️  **Replace with your actual ngrok HTTPS URL**

**Model Name:**
```
gemini-3-flash
```

**Temperature:**
```
0.7
```

**Max Tokens:**
```
250
```

**API Key:**
- Leave **EMPTY**
- Our endpoint doesn't require authentication (for now)

**Why Custom LLM?**
- Routes all requests through our chat.js handler
- Enables full conversation orchestration
- Maintains state machine across turns
- Integrates RAG search for menu items
- Executes functions (cart, orders, etc.)

### 4. Transcriber Settings

**Provider:**
```
Azure
```

**Language:**
```
he-IL
```
*(Hebrew - Israel)*

**Model:**
```
(Use default)
```

**Why Azure?**
- Best Hebrew speech recognition
- Low latency
- High accuracy for restaurant vocabulary

### 5. Voice Settings

**Provider:**
```
Cartesia
```

**Model:**
```
Sonic 3
```

**Voice ID:**
```
3e32f3c5-9ac0-4192-9994-87fdb277120f
```
*(Hebrew female voice)*

**Language:**
```
he
```
*(Hebrew)*

**Speed:**
```
1.0
```
*(Normal)*

**Pitch:**
```
1.0
```
*(Normal)*

### 6. First Message

**Configuration:**
```
שלום! איך אפשר לעזור?
```

**Translation:** *"Hello! How can I help?"*

**Note:** Keep it short - Vapi plays this immediately when call connects

### 7. Tools/Functions

**IMPORTANT:** **DO NOT** configure any tools in Vapi

**Why No Tools?**
- All function calling handled by our custom endpoint
- Our chat.js determines when to execute functions
- State machine controls function execution flow
- Vapi only routes messages to/from our endpoint

**If you see a "Tools" section:**
- Leave it **EMPTY**
- Do not add search_menu, add_to_cart, etc.

### 8. Advanced Settings

**End Call Phrases:**
```
להתראות
תודה רבה
ביי
סיימנו
```
*(Goodbye phrases in Hebrew)*

**Max Call Duration:**
```
600
```
*(10 minutes)*

**Silence Timeout:**
```
30
```
*(30 seconds)*

**Background Sound:**
```
office
```
*(Optional - adds ambient sound)*

**Recording:**
```
Enabled
```
*(Recommended for debugging)*

### 9. Save Assistant

1. Click: **"Save Assistant"**
2. Note the **Assistant ID** (you'll see it in the URL)
3. Go to **"Phone Numbers"** tab
4. **Buy a phone number** or assign existing one to this assistant

---

## Testing the Integration

### Pre-Flight Checklist

Before making your first call, verify:

**✅ Terminal 1: LiteLLM Running**
```bash
# Check if running
curl http://localhost:4000/health

# Expected: {"status": "healthy"}
```

**✅ Terminal 2: Node.js Running**
```bash
# Check if running
curl http://localhost:3000/health

# Expected: {"status": "ok"}
```

**✅ Terminal 3: ngrok Running**
```bash
# Visit ngrok dashboard
open http://localhost:4040
```

**✅ MongoDB Running**
```bash
# Check connection
mongosh restaurant_phone_agent --eval "db.runCommand({ping:1})"

# Expected: { ok: 1 }
```

**✅ Vapi Assistant Saved**
- Model URL set correctly with ngrok HTTPS URL
- Phone number assigned to assistant

### Test Flow

#### 1. Test Custom Endpoint Locally

**Test with curl:**
```bash
curl -X POST http://localhost:3000/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "messages": [
      {"role": "user", "content": "שלום"}
    ],
    "call": {
      "id": "test-call-local",
      "customer": {"number": "+972501234567"}
    }
  }'
```

**Expected Response:**
```json
{
  "id": "chatcmpl-test-cal",
  "object": "chat.completion",
  "created": 1234567890,
  "model": "gemini-3-flash",
  "choices": [{
    "index": 0,
    "message": {
      "role": "assistant",
      "content": "שלום! איך אני יכול לעזור לך היום?"
    },
    "finish_reason": "stop"
  }],
  "usage": {
    "prompt_tokens": 10,
    "completion_tokens": 15,
    "total_tokens": 25
  }
}
```

#### 2. Test via ngrok

**Test through ngrok tunnel:**
```bash
curl -X POST https://YOUR_NGROK_URL.ngrok-free.app/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "messages": [
      {"role": "user", "content": "אני רוצה פיצה"}
    ],
    "call": {
      "id": "test-call-ngrok",
      "customer": {"number": "+972501234567"}
    }
  }'
```

**Check ngrok dashboard** (http://localhost:4040):
- Should see POST request
- Status: 200
- Response body should match OpenAI format

#### 3. Make Test Call

**Call your Vapi phone number:**
1. Dial the number assigned to your assistant
2. Wait for first message: "שלום! איך אפשר לעזור?"
3. Speak in Hebrew: **"אני רוצה שקשוקה"**
4. Listen for response

**Expected Behavior:**
- Bot transcribes your Hebrew correctly
- Searches menu for "שקשוקה"
- Responds: "מצוין! יש לנו שקשוקה ב-35 שקלים. רוצה להוסיף?"

#### 4. Monitor All Systems

**While on call, check:**

**ngrok Dashboard (http://localhost:4040):**
- See POST requests to `/v1/chat/completions`
- Inspect request/response bodies

**Application Logs (Terminal 2):**
```
info: Chat completion request received
info: Parallel processing complete {intent: 'order_taking', confidence: 0.92}
info: LLM response generated {model: 'gemini-3-flash', tokensUsed: 150, duration: 1200}
```

**Langfuse (https://cloud.langfuse.com):**
- New trace appears in real-time
- Shows intent classification, RAG search, LLM generation
- Token usage and latency metrics

**MongoDB:**
```javascript
// Check session created
use restaurant_phone_agent
db.sessions.find({}).sort({createdAt: -1}).limit(1)
```

### Validation Checklist

After your test call, verify:

**✅ Transcription Accurate**
- Hebrew speech recognized correctly
- Check ngrok inspector for actual transcribed text

**✅ Intent Classified**
- Check Langfuse trace
- Should show correct intent (e.g., "order_taking")

**✅ State Transition**
- MongoDB session should show state change
- GREETING → COLLECTING_ORDER

**✅ RAG Search Executed**
- Langfuse shows RAG search span
- Relevant menu items retrieved

**✅ Response Generated**
- Bot responds in natural Hebrew
- Mentions specific menu items/prices

**✅ Latency Acceptable**
- Total response time < 3 seconds
- Check Langfuse for breakdown

**✅ No Errors**
- Application logs show no errors
- ngrok shows all 200 status codes

---

## Troubleshooting

### Issue 1: "Cannot reach custom LLM endpoint"

**Symptom:**
- Call connects but bot doesn't respond
- Vapi dashboard shows "endpoint unreachable"

**Diagnosis:**
```bash
# Test ngrok URL from external source
curl https://YOUR_NGROK_URL.ngrok-free.app/health

# Should return: {"status": "ok"}
```

**Solutions:**

**A. ngrok not running:**
```bash
# Terminal 3 should show ngrok running
ngrok http 3000
```

**B. Wrong URL in Vapi:**
- Go to Vapi Assistant settings
- Verify Model URL matches your current ngrok HTTPS URL
- Remember: free ngrok URLs change on restart

**C. Node.js app not running:**
```bash
# Terminal 2
cd /path/to/restaurant_phone_agent
npm start
```

**D. Firewall blocking ngrok:**
- Check system firewall settings
- Allow ngrok in firewall
- Test with: `curl https://YOUR_NGROK_URL.ngrok-free.app/health`

---

### Issue 2: 500 Internal Server Error

**Symptom:**
- ngrok shows requests arriving
- Status code: 500
- No response from bot

**Diagnosis:**
```bash
# Check application logs (Terminal 2)
# Look for error stack traces
```

**Common Causes:**

**A. LiteLLM not running:**
```bash
# Terminal 1 should show:
# Uvicorn running on http://0.0.0.0:4000

# Test:
curl http://localhost:4000/health
```

**B. Gemini API key missing/invalid:**
```bash
# Check .env file
cat .env | grep GEMINI_API_KEY

# Should show your API key (not empty)
```

**C. MongoDB not running:**
```bash
# Test MongoDB
mongosh restaurant_phone_agent --eval "db.runCommand({ping:1})"

# Should return: { ok: 1 }
```

**D. Missing dependencies:**
```bash
# Reinstall dependencies
npm install
```

---

### Issue 3: Hebrew Text Corrupted/Garbled

**Symptom:**
- Bot responds with question marks or garbled text
- Hebrew characters not displayed correctly

**Solutions:**

**A. Wrong transcriber language:**
- Vapi Assistant settings → Transcriber
- Verify: Language = `he-IL` (NOT `en`)

**B. Wrong voice language:**
- Vapi Assistant settings → Voice
- Verify: Language = `he` (Hebrew)

**C. Test with simple Hebrew:**
- Call and say only: "שלום"
- Should respond correctly

**D. Check encoding in logs:**
```bash
# Windows: Set terminal to UTF-8
chcp 65001

# Mac/Linux: Should work by default
```

---

### Issue 4: High Latency (> 5 seconds)

**Symptom:**
- Long pauses during conversation
- Bot feels slow/unresponsive

**Diagnosis:**
- Check Langfuse trace for slowest component
- Check ngrok dashboard for network latency

**Solutions:**

**A. ngrok latency (free tier):**
- Free ngrok routes through US servers
- Can add 200-500ms latency
- **Solution:** Paid ngrok with regional endpoint

**B. RAG search slow:**
```javascript
// Reduce RAG result limit
// In src/routes/chat.js, line ~125
ragSearch.search(userText, { restaurantId: restaurant._id, limit: 5 })
// Changed from limit: 10 to limit: 5
```

**C. Gemini API slow:**
- Check Gemini API status
- Consider caching common responses

**D. MongoDB slow:**
- Create indexes (should already exist)
- Check MongoDB Atlas vs local performance

---

### Issue 5: State Not Persisting

**Symptom:**
- Bot doesn't remember previous messages
- Asks for same information repeatedly
- Order items forgotten

**Diagnosis:**
```javascript
// Check if session exists in MongoDB
use restaurant_phone_agent
db.sessions.find({}).sort({createdAt: -1}).limit(1)

// Should show recent session with conversation history
```

**Solutions:**

**A. Conversation ID not extracted:**
- Check application logs for "conversationId"
- Should be consistent across requests

**B. Session not being saved:**
- Check MongoDB write permissions
- Verify sessionManager.updateSession is called

**C. Vapi not sending conversation history:**
- Vapi should include previous messages in each request
- Check ngrok inspector: `messages` array should grow

---

### Issue 6: Functions Not Executing

**Symptom:**
- Bot acknowledges orders but cart is empty
- Items not added to MongoDB
- Order not placed

**Diagnosis:**
```javascript
// Check if functions are being called
// In Langfuse, look for function execution spans

// Check MongoDB for cart updates
db.sessions.findOne({conversationId: "..."}).context.cart
```

**Solutions:**

**A. Intent not classified correctly:**
- Check Langfuse: what intent was detected?
- Should be "order_taking" for adding items

**B. State machine not triggering functions:**
- Check stateMachine.js function mapping
- Verify current state allows function execution

**C. Function execution failed:**
- Check application logs for function errors
- Test functions individually: `node scripts/testFunctions.js`

---

### Issue 7: Call Quality Issues

**Symptom:**
- Static/noise on line
- Voice cuts out
- Choppy audio

**Solutions:**

**A. Check Vapi status:**
- https://status.vapi.ai
- Verify no ongoing incidents

**B. Network connection:**
- Test internet speed
- Check for packet loss
- Close bandwidth-heavy applications

**C. Try different voice:**
- Vapi dashboard → Voice settings
- Test with different Cartesia voice ID
- Some voices have better quality

---

## Getting Help

**If issues persist:**

1. **Check ngrok dashboard** (http://localhost:4040)
   - Look at request/response bodies
   - Identify where failure occurs

2. **Review Langfuse traces** (https://cloud.langfuse.com)
   - See which component is failing
   - Check latency breakdown

3. **Check application logs**
   - Terminal 2: Node.js app logs
   - Look for ERROR level messages

4. **Test components individually:**
   ```bash
   # Test intent classifier
   node scripts/testIntentClassifier.js

   # Test RAG search
   node scripts/testVectorSearch.js

   # Test state machine
   node scripts/testStateMachine.js
   ```

5. **GitHub Issues:**
   - Create issue with detailed logs
   - Include ngrok request/response
   - Include Langfuse trace URL

---

## Next Steps

Once your Vapi Assistant is working:

1. **Run Full Test Suite** - See [TESTING_GUIDE.md](TESTING_GUIDE.md)
2. **Monitor Performance** - Set up Langfuse alerts
3. **Plan Production Deployment** - Replace ngrok with proper domain
4. **Scale Infrastructure** - Consider load balancing, Redis caching
5. **Implement Analytics** - Track conversation success rates

---

## Appendix: Quick Reference

### ngrok Commands

```bash
# Start tunnel
ngrok http 3000

# Start with specific region
ngrok http 3000 --region eu

# Start with custom subdomain (paid plan)
ngrok http 3000 --subdomain myrestaurant

# View running tunnels
ngrok status

# Stop all tunnels
killall ngrok
```

### Health Check URLs

```bash
# Node.js app
curl http://localhost:3000/health

# LiteLLM proxy
curl http://localhost:4000/health

# Via ngrok (from outside)
curl https://YOUR_NGROK_URL.ngrok-free.app/health

# MongoDB
mongosh --eval "db.runCommand({ping:1})"
```

### Key File Locations

```
src/routes/chat.js          # Main LLM endpoint handler
src/services/stateMachine.js  # State transitions
src/services/intentClassifier.js  # Intent detection
src/services/ragSearch.js    # Menu/info search
src/services/functions.js    # Cart/order functions
litellm_config.yaml          # LiteLLM model routing
.env                         # Environment variables
```

### Important URLs

- Vapi Dashboard: https://dashboard.vapi.ai
- ngrok Dashboard: https://dashboard.ngrok.com
- ngrok Inspector: http://localhost:4040
- Langfuse: https://cloud.langfuse.com
- Gemini API Console: https://aistudio.google.com
