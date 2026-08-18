# Presence — Mac Setup

## First time

1. Install the current **Node.js LTS** version from <https://nodejs.org> if it is not already installed.
2. Double-click `SETUP_MAC.command`.
3. macOS may ask for confirmation because the file was downloaded. Choose **Open**.
4. Paste your OpenAI API key into the Terminal prompt. The key is written only to `.env.local` on your Mac and is excluded from the project history.
5. Your browser will open Presence automatically.

## Later sessions

Double-click `START_PRESENCE.command`. Keep the small Terminal window open while practicing. Close it when you finish.

## Privacy

- Webcam video is shown locally and is not recorded.
- Interview audio is recorded inside the current browser session for playback. It is not uploaded for the text evaluation.
- Live voice is sent to the OpenAI Realtime API.
- Transcript, typed notes, and delivery measurements are sent to the OpenAI Responses API after the interview to create the report.
- API requests set response storage to off where supported by the selected endpoint.
- Never commit or share `.env.local`.
