#!/bin/bash
# Robust server startup script
cd /home/z/my-project

# ── ENSURE SUPABASE CREDENTIALS ──
# This prevents the recurring issue where .env gets overwritten
# and loses Supabase connection. Run before starting server.
bash ensure-env.sh

# Kill any existing servers
pkill -f "next-server" 2>/dev/null
pkill -f "next dev" 2>/dev/null
sleep 2

# Clear log
> dev.log

# Start server with full detachment
export NODE_OPTIONS="--max-old-space-size=2048"
nohup node node_modules/next/dist/bin/next dev -p 3000 > dev.log 2>&1 &
SERVER_PID=$!
echo $SERVER_PID > .zscripts/dev.pid
echo "Server started with PID: $SERVER_PID"

# Wait for server to be ready
for i in $(seq 1 60); do
  if curl -s --connect-timeout 2 --max-time 5 http://localhost:3000/ > /dev/null 2>&1; then
    echo "Server is ready after $i attempts"
    break
  fi
  sleep 1
done

# Final check
if kill -0 $SERVER_PID 2>/dev/null; then
  echo "Server is running"
else
  echo "Server failed to start"
  cat dev.log
fi
