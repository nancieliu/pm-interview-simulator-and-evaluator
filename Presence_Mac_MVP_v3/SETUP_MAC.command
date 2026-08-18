#!/bin/bash
set -e
cd "$(dirname "$0")"

echo "Presence — first-time setup"
echo

if ! command -v node >/dev/null 2>&1; then
  echo "Node.js is required. Install the current LTS version from https://nodejs.org, then run this file again."
  echo
  read -r -p "Press Return to close."
  exit 1
fi

read -r -s -p "Paste your OpenAI API key (it will stay on this Mac): " OPENAI_KEY_VALUE
echo
if [[ -z "$OPENAI_KEY_VALUE" ]]; then
  echo "No key entered. Setup stopped."
  read -r -p "Press Return to close."
  exit 1
fi

printf 'OPENAI_API_KEY=%s\n' "$OPENAI_KEY_VALUE" > .env.local
chmod 600 .env.local

echo "Installing the app…"
npm install
echo
echo "Setup complete. Opening Presence…"
exec bash "./START_PRESENCE.command"
