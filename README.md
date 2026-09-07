# Restaurant Phone Agent

A phone agent system built with Twilio, OpenAI Realtime API, Express.js, and MongoDB for handling restaurant orders via phone calls.

## Features

- Answer incoming phone calls via Twilio
- Process orders using OpenAI Realtime API
- Multi-language support (Hebrew, Russian, Arabic, English)
- Generate and send payment links via SMS
- Print orders to restaurant
- Store orders and restaurant data in MongoDB

## Project Structure

```
/
├── package.json
├── .env
├── src/
│   ├── index.js               # Express app + server start
│   ├── routes/
│   │   ├── calls.js          # Twilio webhook for incoming calls
│   │   ├── payments.js       # Webhook for payment provider
│   │   └── aiEvents.js       # (optional) AI → backend events (order JSON)
│   ├── services/
│   │   ├── aiStream.js       # WebSocket ↔ AI realtime logic
│   │   ├── payments.js       # generate payment links
│   │   ├── sms.js            # send SMS (payment link) / notifications
│   │   └── printer.js        # (optional) print ticket or send to printer
│   ├── models/
│   │   ├── Restaurant.js     # stores menu, config per restaurant
│   │   └── Order.js          # orders, status, customer info
│   └── utils/
│       └── promptBuilder.js  # build system prompt per restaurant
└── README.md
```

## Setup

1. Install dependencies:
```bash
npm install
```

2. Configure environment variables in `.env`:
   - Twilio credentials
   - OpenAI API key
   - MongoDB connection string
   - Payment provider credentials

3. Start the server:
```bash
npm start
```

For development with auto-reload:
```bash
npm run dev
```

## LiteLLM Setup (for Gemini 3 Flash)

This application uses LiteLLM as a proxy to route chat completion requests to Gemini 3 Flash. LiteLLM runs as a separate Python service.

### Installation

1. Install LiteLLM (requires Python 3.8+):
```bash
pip install 'litellm[proxy]'
```

2. Verify installation:
```bash
litellm --version
```

### Configuration

1. Get a Gemini API key:
   - Visit https://aistudio.google.com/app/apikey
   - Create a new API key
   - Copy the key

2. Add to your `.env` file:
```bash
LITELLM_URL=http://localhost:4000
GEMINI_API_KEY=your_actual_gemini_api_key_here
```

3. The LiteLLM configuration is already set up in `litellm_config.yaml` at the project root.

### Running the Application

**Development Workflow (3 terminals):**

**Terminal 1 - LiteLLM Proxy:**
```bash
litellm --config litellm_config.yaml --port 4000
```

Expected output:
```
INFO:     Started server process
INFO:     Uvicorn running on http://0.0.0.0:4000
```

**Terminal 2 - Node.js Application:**
```bash
npm start
```

**Terminal 3 - ngrok (for external access):**
```bash
ngrok http 3000
```

### Verify LiteLLM is Running

Test the health endpoint:
```bash
curl http://localhost:4000/health
```

Should return: `{"status": "healthy"}`

Test chat completion:
```bash
curl http://localhost:4000/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gemini-3-flash",
    "messages": [{"role": "user", "content": "שלום"}]
  }'
```

### Troubleshooting

**LiteLLM proxy won't start:**
- Check Python version: `python --version` (need 3.8+)
- Reinstall: `pip install --upgrade 'litellm[proxy]'`
- Check port 4000 is available: `netstat -ano | findstr :4000` (Windows) or `lsof -i :4000` (Mac/Linux)

**Connection refused to localhost:4000:**
- Ensure LiteLLM proxy is running in Terminal 1
- Check `LITELLM_URL` in `.env` matches the proxy port
- Verify firewall is not blocking port 4000

**Gemini API key invalid:**
- Verify key at https://aistudio.google.com/app/apikey
- Check `.env` has no extra spaces around the key
- Restart LiteLLM proxy after changing the key

## Vapi Assistant Setup

This application integrates with Vapi AI using a custom LLM endpoint. The Assistant routes all chat completions through our LiteLLM + Gemini 3 Flash setup.

### Quick Start (3 terminals)

Ensure all services are running:

```bash
# Terminal 1: LiteLLM Proxy
litellm --config litellm_config.yaml --port 4000

# Terminal 2: Node.js App
npm start

# Terminal 3: ngrok
ngrok http 3000
```

### Vapi Configuration

1. **Get ngrok URL:**
   - Copy the HTTPS URL from Terminal 3 (e.g., `https://abc123.ngrok-free.app`)
   - Or visit: http://localhost:4040

2. **Create Vapi Assistant:**
   - Go to https://dashboard.vapi.ai
   - Click "Create Assistant"
   - Select "Assistant" (NOT "Workflow")

3. **Configure Settings:**
   - **Model Provider:** Custom LLM
   - **Model URL:** `https://YOUR_NGROK_URL.ngrok-free.app/v1/chat/completions`
   - **Model Name:** `gemini-3-flash`
   - **Transcriber:** Azure, Language: `he-IL`
   - **Voice:** Cartesia Sonic 3, Voice ID: `3e32f3c5-9ac0-4192-9994-87fdb277120f`, Language: `he`
   - **First Message:** `שלום! איך אפשר לעזור?`
   - **Tools/Functions:** Leave EMPTY (all handled by custom endpoint)

4. **Test:**
   - Call your Vapi phone number
   - Say: "אני רוצה שקשוקה" (I want shakshuka)
   - Verify bot responds in Hebrew with menu info

### Monitoring

While testing, monitor:

- **ngrok Inspector:** http://localhost:4040 (request/response inspection)
- **Langfuse:** https://cloud.langfuse.com (traces, latency, token usage)
- **Application Logs:** Terminal 2 (real-time logging)
- **MongoDB:** Check sessions and orders collections

### Documentation

- **Detailed Setup Guide:** [docs/VAPI_ASSISTANT_SETUP.md](docs/VAPI_ASSISTANT_SETUP.md)
- **Testing Scenarios:** [docs/TESTING_GUIDE.md](docs/TESTING_GUIDE.md)
- **Quick Start Script:** `bash scripts/startDev.sh`

### Troubleshooting

**Bot not responding:**
- Check all 3 terminals are running
- Verify ngrok URL in Vapi matches current tunnel
- Test endpoint: `curl https://YOUR_NGROK_URL.ngrok-free.app/health`

**Hebrew text issues:**
- Verify Vapi transcriber language: `he-IL`
- Verify Vapi voice language: `he`

**High latency:**
- Check Langfuse trace for slow components
- Monitor ngrok dashboard for network latency

For more issues, see [docs/VAPI_ASSISTANT_SETUP.md](docs/VAPI_ASSISTANT_SETUP.md#troubleshooting)

## Environment Variables

See `.env` file for required configuration variables.

## License

ISC

