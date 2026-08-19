# Presence — Mac Setup

## First time

1. Install the current **Node.js LTS** version from <https://nodejs.org> if it is not already installed.
2. Double-click `SETUP_MAC.command`.
3. macOS may ask for confirmation because the file was downloaded. Choose **Open**.
4. Paste your OpenAI API key into the Terminal prompt. The key is written only to `.env.local` on your Mac and is excluded from the project history.
5. Your browser will open Presence automatically.
6. Setup also creates `Presence.app` in your personal Applications folder.

## Later sessions

Open **Presence** from Applications, Spotlight, or your Dock. Keep the small Terminal window open while practicing. Close it when you finish.

## Add or refresh the shortcut

If Presence was installed before the shortcut was added, double-click `INSTALL_PRESENCE_APP.command` once. The script creates or refreshes `~/Applications/Presence.app` and reveals it in Finder so you can drag it to the Dock.

## Privacy

- Webcam video is shown locally and is not recorded.
- Interview audio is recorded inside the browser for playback and is sent to the OpenAI transcription API after the interview so delivery, fillers, grammar, and conservative intelligibility patterns can be evaluated.
- Live voice is sent to the OpenAI Realtime API.
- Transcript, typed notes, delivery measurements, and recent weakness tags are sent to the OpenAI Responses API after the interview to create the report.
- Recent scores and weakness tags are stored only in this browser's local storage on your Mac and help identify recurring patterns across sessions.
- API requests set response storage to off where supported by the selected endpoint.
- Never commit or share `.env.local`.
