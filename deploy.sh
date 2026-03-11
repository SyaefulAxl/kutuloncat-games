#!/bin/bash
# KutuLoncat Games — Safe Production Deploy Script
# Usage: ./deploy.sh (run from local machine)
#
# GOLDEN RULES:
# 1. Production data (data/, uploads/, .env) must NEVER be lost
# 2. New code must actually be live after deploy
#
# This script: git pull → npm install → build → kill stale → restart PM2 → verify

set -e

VPS_HOST="vps3"
NVM_INIT='export NVM_DIR="$HOME/.nvm"; [ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"'
APP_DIR='$HOME/kutuloncat-games'
PM2_NAME="kutuloncat"
PORT=3001

echo "🚀 Deploying KutuLoncat Games to production..."
echo ""

# Step 1: Pull latest code (preserves data/, uploads/, .env)
echo "📥 Step 1/6: Pulling latest code..."
ssh $VPS_HOST "$NVM_INIT; cd $APP_DIR && git pull origin main"
echo ""

# Step 2: Install dependencies
echo "📦 Step 2/6: Installing dependencies..."
ssh $VPS_HOST "$NVM_INIT; cd $APP_DIR && npm install 2>&1 | tail -3"
echo ""

# Step 3: Build frontend
echo "🔨 Step 3/6: Building frontend..."
ssh $VPS_HOST "$NVM_INIT; cd $APP_DIR && npm run build 2>&1 | tail -5"
echo ""

# Step 4: Kill stale processes on port (if wrong cwd)
echo "🔍 Step 4/6: Checking for stale processes on port $PORT..."
ssh $VPS_HOST "$NVM_INIT; "'
OLD_PID=$(lsof -t -i :'"$PORT"' 2>/dev/null)
if [ -n "$OLD_PID" ]; then
  OLD_CWD=$(readlink /proc/$OLD_PID/cwd 2>/dev/null)
  if [ "$OLD_CWD" != "'"$APP_DIR"'" ] && [ "$OLD_CWD" != "$HOME/kutuloncat-games" ]; then
    echo "⚠️  Killing stale process $OLD_PID (running from $OLD_CWD)"
    kill $OLD_PID
    sleep 2
    echo "✅ Stale process killed"
  else
    echo "✅ Correct process already on port"
  fi
else
  echo "✅ Port is free"
fi'
echo ""

# Step 5: Restart PM2
echo "♻️  Step 5/6: Restarting PM2..."
ssh $VPS_HOST "$NVM_INIT; cd $APP_DIR && pm2 restart $PM2_NAME 2>&1 | tail -5 && pm2 save 2>&1 | tail -1"
echo ""

# Step 6: Verify
echo "✅ Step 6/6: Verifying..."
sleep 3
HEALTH=$(ssh $VPS_HOST "curl -s http://localhost:$PORT/health 2>&1")
echo "Health: $HEALTH"

# Check if health response contains "ok":true
if echo "$HEALTH" | grep -q '"ok":true'; then
  echo ""
  echo "🎉 Deploy successful! Production is live."
  echo "🌐 https://kutuloncat.my.id"
else
  echo ""
  echo "❌ Deploy may have failed! Check logs:"
  echo "   ssh $VPS_HOST '$NVM_INIT; pm2 logs $PM2_NAME --lines 20 --nostream'"
fi
