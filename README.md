# WhatsApp Gemini Multi-Key Bot (Pterodactyl Compatible)

A Node.js v22 WhatsApp bot with Google Gemini AI, automatic API key rotation on rate limits, and sticker creation. Designed to run on Pterodactyl Panel.

## Features

- `.ai <question>` - Ask Gemini anything using your API keys
- `.s` or `.sticker` - Create a sticker from an image (send with command or reply to image)
- **Multi-key rotation** - Add multiple Gemini API keys, automatically rotate when rate limited
- **Owner confirmation** - When a key hits rate limits, bot asks owner (via bot's WhatsApp number) for confirmation before switching
- **Pterodactyl ready** - Uses `config.js` for configuration, no `.env` needed

## Prerequisites

- Node.js 22+
- WhatsApp account
- Multiple Google Gemini API keys ([Get them here](https://aistudio.google.com/apikey))
- Your WhatsApp number (as owner)

## Setup for Pterodactyl

1. Upload all files to your server (via SFTP or file manager)
2. Edit `config.js` with your details:
   - `ownerNumber`: Your WhatsApp number with country code (digits only, no + or spaces)
   - `geminiApiKeys`: Array of your Gemini API keys
   - `geminiModel`: Model to use (default: `gemini-1.5-flash`)
3. Install dependencies: `npm install` (or let Pterodactyl do it)
4. Start the bot: `npm start` or `node bot.js`
5. Scan the QR code in the console with your WhatsApp (Linked Devices)

## Setup Locally

```bash
npm install
# Edit config.js
npm start
```

## Usage

### For everyone:
- `.ai What is Node.js?` - Get AI response
- Send image with caption `.s` - Create sticker
- Reply to image with `.s` - Create sticker from replied image

### For owner only:
- `.keys` - Check status of all API keys (which one is active)
- `.switch` - Manually switch to next API key (no confirmation needed)

## How Key Rotation Works

1. Bot uses first API key by default
2. If a request gets rate limited (429/quota errors), bot notifies owner via DM
3. Owner must reply `yes` or `no` to confirm switching
4. If confirmed, bot switches to next key and notifies the user to retry
5. If denied, bot stays on current key and user is notified

Pending confirmations expire after 5 minutes.

## Pterodactyl Notes

- Make sure your startup command is `node bot.js`
- The bot creates `.wwebjs_auth/` folder to save session (keep this persistent)
- Ensure Puppeteer dependencies are available (Pterodactyl NodeJS eggs usually have them)
- If running in a container, the args in bot.js are already optimized for sandboxed environments

## Troubleshooting

- **QR not showing**: Delete `.wwebjs_auth/` and restart
- **Can't reach owner**: Make sure `ownerNumber` is correct (digits only)
- **All keys exhausted**: Add more keys to `geminiApiKeys` array
- **Puppeteer issues**: The bot uses `--no-sandbox` flags which are needed in containers

## Important Notes

- This uses `whatsapp-web.js` which automates WhatsApp Web. Follow WhatsApp's Terms of Service
- Keep your API keys secure - never share `config.js`
- The session is saved locally, so you only need to scan QR once
```

