#!/bin/bash

# Development Environment Startup Script for Vapi Integration
# This script provides instructions for starting all required services

echo ""
echo "╔══════════════════════════════════════════════════════════════╗"
echo "║   Restaurant Phone Agent - Development Environment Setup    ║"
echo "║                  Vapi + LiteLLM + Gemini                    ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""

# Colors for better readability
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Check if running on Windows (Git Bash / WSL)
if [[ "$OSTYPE" == "msys" || "$OSTYPE" == "win32" ]]; then
  IS_WINDOWS=true
else
  IS_WINDOWS=false
fi

echo -e "${BLUE}ℹ️  This script will guide you through starting all services.${NC}"
echo -e "${BLUE}   Each service should run in a separate terminal window.${NC}"
echo ""

# Function to check if a command exists
command_exists() {
  command -v "$1" >/dev/null 2>&1
}

# Pre-flight checks
echo -e "${YELLOW}═══════════════════════════════════════════════════════════${NC}"
echo -e "${YELLOW}1. PRE-FLIGHT CHECKS${NC}"
echo -e "${YELLOW}═══════════════════════════════════════════════════════════${NC}"
echo ""

# Check Node.js
if command_exists node; then
  NODE_VERSION=$(node --version)
  echo -e "${GREEN}✓${NC} Node.js installed: ${NODE_VERSION}"
else
  echo -e "${RED}✗${NC} Node.js NOT installed"
  echo -e "  Install from: https://nodejs.org"
  exit 1
fi

# Check Python
if command_exists python || command_exists python3; then
  PYTHON_CMD=$(command_exists python3 && echo "python3" || echo "python")
  PYTHON_VERSION=$($PYTHON_CMD --version)
  echo -e "${GREEN}✓${NC} Python installed: ${PYTHON_VERSION}"
else
  echo -e "${RED}✗${NC} Python NOT installed"
  echo -e "  Install from: https://python.org"
  exit 1
fi

# Check LiteLLM
if command_exists litellm; then
  echo -e "${GREEN}✓${NC} LiteLLM installed"
else
  echo -e "${RED}✗${NC} LiteLLM NOT installed"
  echo -e "  Install with: ${YELLOW}pip install 'litellm[proxy]'${NC}"
  exit 1
fi

# Check ngrok
if command_exists ngrok; then
  echo -e "${GREEN}✓${NC} ngrok installed"
else
  echo -e "${YELLOW}⚠${NC}  ngrok NOT installed"
  echo -e "  Install from: https://ngrok.com/download"
  echo -e "  or: ${YELLOW}brew install ngrok${NC} (Mac) / ${YELLOW}choco install ngrok${NC} (Windows)"
  echo ""
fi

# Check MongoDB
if command_exists mongod; then
  echo -e "${GREEN}✓${NC} MongoDB installed"
else
  echo -e "${YELLOW}⚠${NC}  MongoDB NOT detected (may be running as service)"
fi

echo ""

# Environment variables check
echo -e "${YELLOW}═══════════════════════════════════════════════════════════${NC}"
echo -e "${YELLOW}2. ENVIRONMENT VARIABLES CHECK${NC}"
echo -e "${YELLOW}═══════════════════════════════════════════════════════════${NC}"
echo ""

if [ -f ".env" ]; then
  echo -e "${GREEN}✓${NC} .env file found"

  # Check for required keys
  if grep -q "GEMINI_API_KEY=" .env && ! grep -q "GEMINI_API_KEY=$" .env && ! grep -q "GEMINI_API_KEY=your" .env; then
    echo -e "${GREEN}✓${NC} GEMINI_API_KEY configured"
  else
    echo -e "${RED}✗${NC} GEMINI_API_KEY missing or not set"
    echo -e "  Get key from: https://aistudio.google.com/app/apikey"
  fi

  if grep -q "MONGODB_URI=" .env; then
    echo -e "${GREEN}✓${NC} MONGODB_URI configured"
  else
    echo -e "${YELLOW}⚠${NC}  MONGODB_URI not set (will use default)"
  fi

  if grep -q "LANGFUSE_SECRET_KEY=" .env; then
    echo -e "${GREEN}✓${NC} LANGFUSE keys configured"
  else
    echo -e "${YELLOW}⚠${NC}  LANGFUSE keys not set (observability disabled)"
  fi
else
  echo -e "${RED}✗${NC} .env file NOT found"
  echo -e "  Copy .env.example to .env and configure"
  exit 1
fi

echo ""

# Service startup instructions
echo -e "${YELLOW}═══════════════════════════════════════════════════════════${NC}"
echo -e "${YELLOW}3. START SERVICES (in separate terminals)${NC}"
echo -e "${YELLOW}═══════════════════════════════════════════════════════════${NC}"
echo ""

echo -e "${GREEN}TERMINAL 1: LiteLLM Proxy${NC}"
echo -e "${BLUE}────────────────────────────────────────────────────────────${NC}"
echo -e "cd $(pwd)"
echo -e "litellm --config litellm_config.yaml --port 4000"
echo ""
echo -e "Expected output: ${GREEN}Uvicorn running on http://0.0.0.0:4000${NC}"
echo -e "Test: ${YELLOW}curl http://localhost:4000/health${NC}"
echo ""
read -p "Press Enter when Terminal 1 is running..."
echo ""

echo -e "${GREEN}TERMINAL 2: Node.js Application${NC}"
echo -e "${BLUE}────────────────────────────────────────────────────────────${NC}"
echo -e "cd $(pwd)"
echo -e "npm start"
echo ""
echo -e "Expected output: ${GREEN}Server running on port 3000${NC}"
echo -e "Test: ${YELLOW}curl http://localhost:3000/health${NC}"
echo ""
read -p "Press Enter when Terminal 2 is running..."
echo ""

echo -e "${GREEN}TERMINAL 3: ngrok Tunnel${NC}"
echo -e "${BLUE}────────────────────────────────────────────────────────────${NC}"
echo -e "ngrok http 3000"
echo ""
echo -e "Expected output: ${GREEN}Forwarding https://xxxx.ngrok-free.app -> http://localhost:3000${NC}"
echo -e "Inspector: ${YELLOW}http://localhost:4040${NC}"
echo ""
echo -e "${YELLOW}⚠  IMPORTANT: Copy the HTTPS URL!${NC}"
echo -e "You'll need it for Vapi configuration"
echo ""
read -p "Press Enter when Terminal 3 is running..."
echo ""

# Verification
echo -e "${YELLOW}═══════════════════════════════════════════════════════════${NC}"
echo -e "${YELLOW}4. VERIFICATION${NC}"
echo -e "${YELLOW}═══════════════════════════════════════════════════════════${NC}"
echo ""

echo "Testing services..."
echo ""

# Test LiteLLM
echo -n "LiteLLM Proxy (port 4000)... "
if curl -s http://localhost:4000/health > /dev/null 2>&1; then
  echo -e "${GREEN}✓ Running${NC}"
else
  echo -e "${RED}✗ Not responding${NC}"
fi

# Test Node.js
echo -n "Node.js App (port 3000)...   "
if curl -s http://localhost:3000/health > /dev/null 2>&1; then
  echo -e "${GREEN}✓ Running${NC}"
else
  echo -e "${RED}✗ Not responding${NC}"
fi

# Test ngrok
echo -n "ngrok Inspector (port 4040)... "
if curl -s http://localhost:4040 > /dev/null 2>&1; then
  echo -e "${GREEN}✓ Running${NC}"
else
  echo -e "${YELLOW}⚠ Not responding (may be ok)${NC}"
fi

echo ""

# Next steps
echo -e "${YELLOW}═══════════════════════════════════════════════════════════${NC}"
echo -e "${YELLOW}5. NEXT STEPS${NC}"
echo -e "${YELLOW}═══════════════════════════════════════════════════════════${NC}"
echo ""

echo -e "${GREEN}1. Copy your ngrok HTTPS URL${NC}"
echo -e "   Visit: ${BLUE}http://localhost:4040${NC}"
echo -e "   Copy the URL that looks like: ${YELLOW}https://abc123.ngrok-free.app${NC}"
echo ""

echo -e "${GREEN}2. Configure Vapi Assistant${NC}"
echo -e "   a) Go to: ${BLUE}https://dashboard.vapi.ai${NC}"
echo -e "   b) Create new ${BLUE}Assistant${NC} (NOT Workflow)"
echo -e "   c) Set Model Provider: ${YELLOW}Custom LLM${NC}"
echo -e "   d) Set Model URL: ${YELLOW}https://YOUR_NGROK_URL/v1/chat/completions${NC}"
echo -e "   e) Set Model Name: ${YELLOW}gemini-3-flash${NC}"
echo -e "   f) Set Transcriber: ${YELLOW}Azure, Language: he-IL${NC}"
echo -e "   g) Set Voice: ${YELLOW}Cartesia Sonic 3, ID: 3e32f3c5-9ac0-4192-9994-87fdb277120f${NC}"
echo -e "   h) Set First Message: ${YELLOW}שלום! איך אפשר לעזור?${NC}"
echo ""

echo -e "${GREEN}3. Test the integration${NC}"
echo -e "   Call your Vapi phone number"
echo -e "   Say: ${YELLOW}אני רוצה שקשוקה${NC} (I want shakshuka)"
echo ""

echo -e "${GREEN}4. Monitor the system${NC}"
echo -e "   • ngrok Inspector: ${BLUE}http://localhost:4040${NC}"
echo -e "   • Langfuse: ${BLUE}https://cloud.langfuse.com${NC}"
echo -e "   • Application logs: ${YELLOW}tail -f logs/combined.log${NC}"
echo ""

echo -e "${GREEN}5. Read full documentation${NC}"
echo -e "   • Setup Guide: ${BLUE}docs/VAPI_ASSISTANT_SETUP.md${NC}"
echo -e "   • Testing Guide: ${BLUE}docs/TESTING_GUIDE.md${NC}"
echo ""

echo -e "${YELLOW}═══════════════════════════════════════════════════════════${NC}"
echo -e "${GREEN}✓ Development environment ready!${NC}"
echo -e "${YELLOW}═══════════════════════════════════════════════════════════${NC}"
echo ""

# Optional: Open browser tabs
read -p "Open monitoring dashboards in browser? (y/n): " -n 1 -r
echo ""
if [[ $REPLY =~ ^[Yy]$ ]]; then
  if [[ "$IS_WINDOWS" == true ]]; then
    start http://localhost:4040  # ngrok inspector
    start https://cloud.langfuse.com  # Langfuse
    start https://dashboard.vapi.ai  # Vapi
  elif [[ "$OSTYPE" == "darwin"* ]]; then
    open http://localhost:4040
    open https://cloud.langfuse.com
    open https://dashboard.vapi.ai
  else
    xdg-open http://localhost:4040 2>/dev/null
    xdg-open https://cloud.langfuse.com 2>/dev/null
    xdg-open https://dashboard.vapi.ai 2>/dev/null
  fi
fi

echo ""
echo -e "${BLUE}Happy testing! 🎉${NC}"
echo ""
