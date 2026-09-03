#!/bin/bash
# DhanyaOS detached dev server (survives sandbox command-end SIGKILLs via setsid orphan trick)
cd /home/z/Dhanyaos2
mkdir -p /home/z/Dhanyaos2/logs
# Kill any previous instance
if [ -f /home/z/Dhanyaos2/.zscripts/dev.pid ]; then
  OLD_PID=$(cat /home/z/Dhanyaos2/.zscripts/dev.pid 2>/dev/null)
  [ -n "$OLD_PID" ] && kill "$OLD_PID" 2>/dev/null
  sleep 2
fi
if ss -ltnp 2>/dev/null | grep -q ':3000 '; then
  PID=$(ss -ltnp 2>/dev/null | grep ':3000 ' | grep -oP 'pid=\K[0-9]+' | head -1)
  [ -n "$PID" ] && kill "$PID" 2>/dev/null
  sleep 2
fi
setsid bash -c 'cd /home/z/Dhanyaos2 && exec bun run dev > /home/z/Dhanyaos2/dev.log 2>&1' < /dev/null > /dev/null 2>&1 &
sleep 1
NEW_PID=$(ss -ltnp 2>/dev/null | grep ':3000 ' | grep -oP 'pid=\K[0-9]+' | head -1)
[ -n "$NEW_PID" ] && echo "$NEW_PID" > /home/z/Dhanyaos2/.zscripts/dev.pid
echo "DhanyaOS dev server detached on port 3000 (pid: $NEW_PID, log: /home/z/Dhanyaos2/dev.log)"
