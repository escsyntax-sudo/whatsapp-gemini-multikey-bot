# WhatsApp Groq Multi-Key Bot (Pterodactyl Compatible)

A Node.js v22 WhatsApp bot with Groq AI, automatic API key rotation on rate limits, and sticker creation. Designed to run on Pterodactyl Panel.

## Features

- `.ai <question>` - Ask Groq AI anything using your API keys (only works in groups)
- `.s` or `.sticker` - Create a sticker from an image (send with command or reply to image, only works in groups)
- **Multi-key rotation** - Add multiple Groq API keys, automatically rotate when rate limited
- **Owner confirmation** - When a key hits rate limits, bot asks owner (via bot's WhatsApp number) for confirmation before switching (only works in owner's private chat)
- **Pterodactyl ready** - Uses `config.js` for configuration

## Prerequisites

- Node.js 22+
- WhatsApp account
- Multiple Groq API keys ([Get them here](https://console.groq.com/keys), usually start with `gsk_`)
- Your WhatsApp number (as owner)

## Setup for Pterodactyl

1. Upload all files to your server (via SFTP or file manager)
2. Copy `config.example.js` to `config.js` and edit it:
   ```bash
   cp config.example.js config.js
   ```
   - `ownerNumber`: Your WhatsApp number with country code (digits only, no + or spaces)
   - `groqApiKeys`: Array of your Groq API keys
   - `groqModel`: Model to use (e.g. `llama-3.1-8b-instant`, `llama-3.2-90b-vision-preview`, etc.)
3. Install dependencies: `npm install` (or let Pterodactyl do it)
4. Start the bot: `npm start` or `node bot.js`
5. Scan the QR code in the console with your WhatsApp (Linked Devices)

## Setup Locally

```bash
npm install
cp config.example.js config.js
# Edit config.js
npm start
```

## Usage

### For everyone (in groups only):
- `.ai What is Node.js?` - Get AI response
- Send image with caption `.s` - Create sticker
- Reply to image with `.s` - Create sticker from replied image

### For owner only (in private chat with bot):
- `.keys` - Check status of all API keys (which one is active)
- `.switch` - Manually switch to next API key (no confirmation needed)

## How Key Rotation Works

1. Bot uses first API key by default
2. If a request gets rate limited (429/quota errors), bot notifies owner via DM
3. Owner must reply `yes` or `no` to confirm switching (only in owner's private chat)
4. If confirmed, bot switches to next key and notifies the user in the group to retry
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
- **All keys exhausted**: Add more keys to `groqApiKeys` array
- **Commands not working**: Commands only work in groups, not private chats
- **Puppeteer issues**: The bot uses `--no-sandbox` flags which are needed in containers

## Important Notes

- This uses `whatsapp-web.js` which automates WhatsApp Web. Follow WhatsApp's Terms of Service
- Keep your API keys secure - never share `config.js`
- The session is saved locally, so you only need to scan QR once
```
