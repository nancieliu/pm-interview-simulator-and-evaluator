#!/bin/bash
set -e
cd "$(dirname "$0")"

if [[ ! -f .env.local ]]; then
  echo "Please run SETUP_MAC.command first."
  read -r -p "Press Return to close."
  exit 1
fi

npm run dev -- --host 127.0.0.1 --port 4173 &
SERVER_PID=$!
trap 'kill "$SERVER_PID" 2>/dev/null || true' EXIT INT TERM

for _ in {1..30}; do
  if curl -fsS http://127.0.0.1:4173 >/dev/null 2>&1; then
    open http://127.0.0.1:4173
    echo "Presence is running. Keep this window open during your interview."
    wait "$SERVER_PID"
    exit 0
  fi
  sleep 1
done

echo "Presence could not start. Close this window and try again."
exit 1
