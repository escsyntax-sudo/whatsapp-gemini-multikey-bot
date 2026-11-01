import qrcode from 'qrcode-terminal';
import pkg from '@whiskeysockets/baileys';
const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, downloadMediaMessage, jidNormalizedUser } = pkg;
import { Boom } from '@hapi/boom';
import sharp from 'sharp';
import pino from 'pino';
import https from 'https';
import config from './config.js';

const { ownerNumber, groqApiKeys, groqModel, prefix } = config;

// Validate config
if (!ownerNumber || ownerNumber.trim() === '') {
  console.error('[ERROR] ownerNumber is not set in config.js');
  process.exit(1);
}

if (!Array.isArray(groqApiKeys) || groqApiKeys.length === 0) {
  console.error('[ERROR] groqApiKeys array is empty in config.js');
  process.exit(1);
}

const validKeys = groqApiKeys.filter(
  (key) => key && key.trim() !== '' && !key.includes('YOUR_FIRST_GROQ_API_KEY')
);

if (validKeys.length === 0) {
  console.error('[ERROR] No valid Groq API keys found in config.js');
  process.exit(1);
}

console.log(`[INFO] Loaded ${validKeys.length} Groq API key(s)`);

// Multi-key management
let currentKeyIndex = 0;

// Prevent keep-alive premature close on some Pterodactyl nodes
const httpsAgent = new https.Agent({
  keepAlive: false
});

// Pending confirmation state
let pendingKeySwitch = {
  active: false,
  requestedBy: null,
  timestamp: null,
  originalChatId: null
};

function formatOwnerJid(number) {
  const cleaned = String(number).replace(/[^0-9]/g, '');
  if (!cleaned) return null;
  return `${cleaned}@s.whatsapp.net`;
}

function getCurrentKeyMasked() {
  const key = validKeys[currentKeyIndex];
  if (!key) return 'N/A';
  if (key.length <= 8) return key;
  return key.substring(0, 4) + '...' + key.substring(key.length - 4);
}

function switchToNextKey() {
  if (currentKeyIndex >= validKeys.length - 1) {
    console.error('[ERROR] No more API keys available!');
    return false;
  }

  currentKeyIndex++;
  console.log(`[KEY SWITCH] Switched to API key #${currentKeyIndex + 1} (${getCurrentKeyMasked()})`);
  return true;
}

function isRateLimitError(error) {
  const errorStr = error?.toString().toLowerCase() || '';
  const message = error?.message?.toLowerCase() || '';
  const status = error?.status;

  return (
    status === 429 ||
    errorStr.includes('429') ||
    errorStr.includes('rate limit') ||
    errorStr.includes('quota') ||
    errorStr.includes('too many requests') ||
    errorStr.includes('rate_limit_exceeded') ||
    message.includes('429') ||
    message.includes('rate limit') ||
    message.includes('quota') ||
    message.includes('too many requests') ||
    message.includes('rate_limit_exceeded')
  );
}

let sock;

async function startSock() {
  const { state, saveCreds } = await useMultiFileAuthState('./baileys_auth');
  sock = makeWASocket({
    auth: state,
    logger: pino({ level: 'silent' }),
    printQRInTerminal: false,
    browser: ['Groq-MultiKey-Bot', 'Chrome', '1.0.0']
  });

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      console.log('[QR] Scan this QR code with your WhatsApp (Linked Devices):');
      qrcode.generate(qr, { small: true });
    }

    if (connection === 'close') {
      const shouldReconnect = (lastDisconnect?.error instanceof Boom)
        ? lastDisconnect.error.output.statusCode !== DisconnectReason.loggedOut
        : true;
      console.log('[CONNECTION] Closed. Reconnecting:', shouldReconnect);
      if (shouldReconnect) {
        startSock();
      } else {
        console.log('[CONNECTION] Logged out. Delete baileys_auth folder and restart to scan QR again.');
      }
    }

    if (connection === 'open') {
      console.log('[READY] Bot is online!');
      console.log(`[INFO] Using Groq model: ${groqModel}`);
      console.log(`[INFO] Owner: ${ownerNumber}`);
      console.log(`[INFO] Active API key: #${currentKeyIndex + 1} (${getCurrentKeyMasked()})`);
      console.log(`[INFO] Commands: ${prefix}ai <question> | ${prefix}s (reply to/send image)`);
    }
  });

  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type !== 'notify') return;
    const msg = messages[0];
    if (!msg.message) return;
    if (msg.key.fromMe) return;

    const from = msg.key.remoteJid;
    const isGroup = from.endsWith('@g.us');
    const ownerJid = formatOwnerJid(ownerNumber);
    const isOwner = ownerJid && jidNormalizedUser(msg.key.participant || from) === jidNormalizedUser(ownerJid);

    const body =
      msg.message.conversation ||
      msg.message.extendedTextMessage?.text ||
      msg.message.imageMessage?.caption ||
      msg.message.videoMessage?.caption ||
      '';

    if (!body) return;
    const trimmed = body.trim();

    // Owner confirmation for key switch (private only)
    if (isOwner && !isGroup && pendingKeySwitch.active) {
      const lowerBody = trimmed.toLowerCase();
      if (lowerBody === 'yes' || lowerBody === 'y') {
        if (switchToNextKey()) {
          await sock.sendMessage(from, { text: `✅ Switched to Groq API key #${currentKeyIndex + 1} (${getCurrentKeyMasked()}).\n\nThe bot will now use this key for future requests.` });
          console.log(`[CONFIRMATION] Owner approved key switch to #${currentKeyIndex + 1}`);
          if (pendingKeySwitch.originalChatId) {
            try {
              await sock.sendMessage(pendingKeySwitch.originalChatId, { text: `API key switched. You can try your request again.` });
            } catch {}
          }
        } else {
          await sock.sendMessage(from, { text: '❌ No more API keys available. All keys have been exhausted.' });
        }
        pendingKeySwitch.active = false;
        return;
      }
      if (lowerBody === 'no' || lowerBody === 'n') {
        await sock.sendMessage(from, { text: '❌ Key switch cancelled. Bot will continue using the current API key.' });
        console.log('[CONFIRMATION] Owner denied key switch');
        if (pendingKeySwitch.originalChatId) {
          try {
            await sock.sendMessage(pendingKeySwitch.originalChatId, { text: 'Key switch was denied by owner. Please try again later or contact the owner.' });
          } catch {}
        }
        pendingKeySwitch.active = false;
        return;
      }
      await sock.sendMessage(from, { text: 'Please reply with *yes* or *no* to confirm the API key switch.' });
      return;
    }

    if (pendingKeySwitch.active && Date.now() - pendingKeySwitch.timestamp > 300000) {
      pendingKeySwitch.active = false;
      console.log('[INFO] Pending key switch confirmation expired');
    }

    // Commands only in groups
    const lowerTrimmed = trimmed.toLowerCase();
    
    if (lowerTrimmed.startsWith(prefix + 'ai ')) {
      if (!isGroup) return;
      const question = trimmed.substring(prefix.length + 3);
      await handleAI(from, question);
      return;
    }

    if (lowerTrimmed === prefix + 'ai') {
      if (!isGroup) return;
      await sock.sendMessage(from, { text: `Usage: \`${prefix}ai <your question>\`` });
      return;
    }

    if (lowerTrimmed.startsWith('@meta ai ')) {
      if (!isGroup) return;
      const question = trimmed.substring('@meta ai '.length);
      await handleAI(from, question);
      return;
    }

    if (lowerTrimmed === '@meta ai') {
      if (!isGroup) return;
      await sock.sendMessage(from, { text: `Usage: \`@meta ai <your question>\`` });
      return;
    }

    if (trimmed.toLowerCase() === prefix + 's' || trimmed.toLowerCase() === prefix + 'sticker') {
      if (!isGroup) return;
      await handleSticker(msg, from);
      return;
    }

    // Owner commands only in private
    if (isOwner && !isGroup) {
      if (trimmed.toLowerCase() === prefix + 'keys') {
        let status = `🔑 *Groq API Key Status*\n\n`;
        validKeys.forEach((key, idx) => {
          const masked = key.length <= 8 ? key : key.substring(0, 4) + '...' + key.substring(key.length - 4);
          if (idx === currentKeyIndex) {
            status += `✅ Key #${idx + 1}: ${masked} (ACTIVE)\n`;
          } else {
            status += `⚪ Key #${idx + 1}: ${masked}\n`;
          }
        });
        status += `\nTotal: ${validKeys.length} keys`;
        await sock.sendMessage(from, { text: status });
        return;
      }

      if (trimmed.toLowerCase() === prefix + 'switch') {
        if (currentKeyIndex >= validKeys.length - 1) {
          await sock.sendMessage(from, { text: '❌ Already using the last API key. No more keys available.' });
          return;
        }
        if (switchToNextKey()) {
          await sock.sendMessage(from, { text: `✅ Manually switched to Groq API key #${currentKeyIndex + 1} (${getCurrentKeyMasked()})` });
        }
        return;
      }
    }
  });
}

async function requestKeySwitchConfirmation(chatId) {
  const ownerJid = formatOwnerJid(ownerNumber);
  if (!ownerJid) {
    console.error('[ERROR] Invalid ownerNumber in config.js');
    return;
  }
  if (pendingKeySwitch.active) {
    console.log('[INFO] Key switch confirmation already pending');
    return;
  }
  pendingKeySwitch = {
    active: true,
    requestedBy: chatId,
    timestamp: Date.now(),
    originalChatId: chatId
  };
  const message =
    `⚠️ *API Key Rate Limit Detected*\n\n` +
    `Current Groq API key (#${currentKeyIndex + 1}) appears to have hit its rate limit or quota.\n\n` +
    `Do you want to switch to the next available API key (#${currentKeyIndex + 2})?\n\n` +
    `Reply with *yes* or *no* to confirm.`;
  try {
    await sock.sendMessage(ownerJid, { text: message });
    console.log('[CONFIRMATION] Sent key switch request to owner');
  } catch (err) {
    console.error('[ERROR] Failed to send confirmation to owner:', err);
    pendingKeySwitch.active = false;
  }
}

async function handleAI(from, question) {
  if (!question || question.trim() === '') {
    await sock.sendMessage(from, { text: `Usage: \`${prefix}ai <your question>\`` });
    return;
  }

  try {
    await sock.sendPresenceUpdate('composing', from);

    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${validKeys[currentKeyIndex]}`,
        'Content-Type': 'application/json',
        'User-Agent': 'Groq-MultiKey-Baileys-Bot'
      },
      body: JSON.stringify({
        model: groqModel,
        messages: [
          {
            role: 'user',
            content: question.trim()
          }
        ],
        temperature: 0.7,
        max_tokens: 1024
      }),
      agent: httpsAgent
    });

    await sock.sendPresenceUpdate('paused', from);

    if (!response.ok) {
      const errText = await response.text();
      console.error('[GROQ RAW ERROR]', errText);

      if (response.status === 429) {
        await sock.sendMessage(from, { text: 'Rate limit detected on current Groq API key. Requesting confirmation from owner to switch keys...' });
        await requestKeySwitchConfirmation(from);
        return;
      }

      throw new Error(`HTTP ${response.status}`);
    }

    const data = await response.json();
    const text = data.choices?.[0]?.message?.content || 'No response.';

    if (text.length > 4000) {
      const truncated = text.substring(0, 3997) + '...';
      await sock.sendMessage(from, { text: truncated });
    } else {
      await sock.sendMessage(from, { text: text });
    }
  } catch (err) {
    console.error('[AI ERROR]', err);
    await sock.sendPresenceUpdate('paused', from);

    if (isRateLimitError(err)) {
      await sock.sendMessage(from, { text: 'Rate limit detected on current Groq API key. Requesting confirmation from owner to switch keys...' });
      await requestKeySwitchConfirmation(from);
      return;
    }

    await sock.sendMessage(from, { text: 'Failed to get response from Groq. Try again or switch model in config.js.' });
  }
}

async function handleSticker(msg, from) {
  try {
    let messageToDownload = msg;
    const quoted = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
    if (quoted && (quoted.imageMessage || quoted.stickerMessage)) {
      messageToDownload = {
        key: msg.key,
        message: quoted
      };
    }

    const imageMsg = messageToDownload.message?.imageMessage;
    if (!imageMsg) {
      await sock.sendMessage(from, { text: `Send an image with \`${prefix}s\` or reply to an image with \`${prefix}s\` to make a sticker.` });
      return;
    }

    const stream = await downloadMediaMessage(
      messageToDownload,
      'buffer',
      {},
      { logger: pino({ level: 'silent' }), reuploadRequest: sock.updateMediaMessage }
    );

    const buffer = Buffer.from(stream);
    const stickerBuffer = await sharp(buffer)
      .resize(512, 512, {
        fit: 'contain',
        background: { r: 0, g: 0, b: 0, alpha: 0 }
      })
      .webp({ quality: 80 })
      .toBuffer();

    await sock.sendMessage(from, { sticker: stickerBuffer });
  } catch (err) {
    console.error('[STICKER ERROR]', err);
    await sock.sendMessage(from, { text: 'Failed to create sticker. Make sure the media is an image.' });
  }
}

startSock();
