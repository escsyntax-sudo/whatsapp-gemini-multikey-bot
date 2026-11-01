import qrcode from 'qrcode-terminal';
import { Client, LocalAuth, MessageMedia } from 'whatsapp-web.js';
import { GoogleGenerativeAI } from '@google/generative-ai';
import sharp from 'sharp';
import config from './config.js';

const { ownerNumber, geminiApiKeys, geminiModel, prefix } = config;

// Validate config
if (!ownerNumber || ownerNumber.trim() === "") {
  console.error('[ERROR] ownerNumber is not set in config.js');
  process.exit(1);
}

if (!Array.isArray(geminiApiKeys) || geminiApiKeys.length === 0) {
  console.error('[ERROR] geminiApiKeys array is empty in config.js');
  process.exit(1);
}

// Filter out empty keys
const validKeys = geminiApiKeys.filter(key => key && key.trim() !== "" && key !== "YOUR_FIRST_GEMINI_API_KEY");
if (validKeys.length === 0) {
  console.error('[ERROR] No valid Gemini API keys found in config.js');
  process.exit(1);
}

console.log(`[INFO] Loaded ${validKeys.length} API key(s)`);

// Multi-key management
let currentKeyIndex = 0;
let genAI = new GoogleGenerativeAI(validKeys[currentKeyIndex]);
let model = genAI.getGenerativeModel({ model: geminiModel });

// Pending confirmation state
let pendingKeySwitch = {
  active: false,
  requestedBy: null,
  timestamp: null
};

function formatOwnerJid(number) {
  const cleaned = number.replace(/[^0-9]/g, '');
  return `${cleaned}@c.us`;
}

function getCurrentKeyMasked() {
  const key = validKeys[currentKeyIndex];
  if (key.length <= 8) return key;
  return key.substring(0, 4) + '...' + key.substring(key.length - 4);
}

function switchToNextKey() {
  if (currentKeyIndex >= validKeys.length - 1) {
    console.error('[ERROR] No more API keys available!');
    return false;
  }
  
  currentKeyIndex++;
  genAI = new GoogleGenerativeAI(validKeys[currentKeyIndex]);
  model = genAI.getGenerativeModel({ model: geminiModel });
  console.log(`[KEY SWITCH] Switched to API key #${currentKeyIndex + 1} (${getCurrentKeyMasked()})`);
  return true;
}

function isRateLimitError(error) {
  const errorStr = error?.toString().toLowerCase() || '';
  const message = error?.message?.toLowerCase() || '';
  
  return (
    errorStr.includes('429') ||
    errorStr.includes('rate limit') ||
    errorStr.includes('quota') ||
    errorStr.includes('resource exhausted') ||
    errorStr.includes('too many requests') ||
    message.includes('429') ||
    message.includes('rate limit') ||
    message.includes('quota') ||
    message.includes('resource exhausted')
  );
}

const client = new Client({
  authStrategy: new LocalAuth({ dataPath: './.wwebjs_auth' }),
  puppeteer: {
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-accelerated-2d-canvas',
      '--no-first-run',
      '--no-zygote',
      '--disable-gpu'
    ]
  }
});

client.on('qr', (qr) => {
  console.log('[QR] Scan this QR code with your WhatsApp (Linked Devices):');
  qrcode.generate(qr, { small: true });
});

client.on('ready', () => {
  console.log('[READY] Bot is online!');
  console.log(`[INFO] Using Gemini model: ${geminiModel}`);
  console.log(`[INFO] Owner: ${ownerNumber}`);
  console.log(`[INFO] Active API key: #${currentKeyIndex + 1} (${getCurrentKeyMasked()})`);
  console.log(`[INFO] Commands: ${prefix}ai <question> | ${prefix}s (reply to/send image)`);
});

client.on('auth_failure', (msg) => {
  console.error('[AUTH FAILURE]', msg);
});

client.on('disconnected', (reason) => {
  console.log('[DISCONNECTED]', reason);
});

async function requestKeySwitchConfirmation(chatId, requestedBy) {
  const ownerJid = formatOwnerJid(ownerNumber);
  
  if (pendingKeySwitch.active) {
    console.log('[INFO] Key switch confirmation already pending');
    return;
  }
  
  pendingKeySwitch = {
    active: true,
    requestedBy: requestedBy,
    timestamp: Date.now(),
    originalChatId: chatId
  };
  
  const message = `⚠️ *API Key Rate Limit Detected*\n\n` +
    `Current API key (#${currentKeyIndex + 1}) appears to have hit its rate limit or quota.\n\n` +
    `Do you want to switch to the next available API key (#${currentKeyIndex + 2})?\n\n` +
    `Reply with *yes* or *no* to confirm.`;
  
  try {
    await client.sendMessage(ownerJid, message);
    console.log('[CONFIRMATION] Sent key switch request to owner');
  } catch (err) {
    console.error('[ERROR] Failed to send confirmation to owner:', err);
    pendingKeySwitch.active = false;
  }
}

async function handleAI(message, question) {
  if (!question || question.trim() === '') {
    await message.reply(`Usage: \`${prefix}ai <your question>\``);
    return;
  }

  try {
    await message.react('🤖');
    const result = await model.generateContent(question.trim());
    const response = result.response;
    const text = response.text();
    
    if (text.length > 4000) {
      const truncated = text.substring(0, 3997) + '...';
      await message.reply(truncated);
    } else {
      await message.reply(text);
    }
    await message.react('✅');
  } catch (err) {
    console.error('[AI ERROR]', err);
    
    if (isRateLimitError(err)) {
      await message.react('⚠️');
      await message.reply('Rate limit detected on current API key. Requesting confirmation from owner to switch keys...');
      await requestKeySwitchConfirmation(message.from, message.from);
      return;
    }
    
    await message.react('❌');
    await message.reply('Failed to get response from Gemini. Please try again later.');
  }
}

async function handleSticker(message) {
  try {
    let mediaMessage = message;
    
    if (message.hasQuotedMsg) {
      const quoted = await message.getQuotedMessage();
      if (quoted.hasMedia) {
        mediaMessage = quoted;
      }
    }
    
    if (!mediaMessage.hasMedia) {
      await message.reply(`Send an image with \`${prefix}s\` or reply to an image with \`${prefix}s\` to make a sticker.`);
      return;
    }
    
    await message.react('🖼️');
    const media = await mediaMessage.downloadMedia();
    
    if (!media) {
      await message.reply('Failed to download media.');
      return;
    }
    
    const buffer = Buffer.from(media.data, 'base64');
    const stickerBuffer = await sharp(buffer)
      .resize(512, 512, {
        fit: 'contain',
        background: { r: 0, g: 0, b: 0, alpha: 0 }
      })
      .webp({ quality: 80 })
      .toBuffer();
    
    const stickerMedia = new MessageMedia('image/webp', stickerBuffer.toString('base64'), 'sticker.webp');
    
    await message.reply(stickerMedia, message.from, {
      sendMediaAsSticker: true
    });
    
    await message.react('✅');
  } catch (err) {
    console.error('[STICKER ERROR]', err);
    await message.react('❌');
    await message.reply('Failed to create sticker. Make sure the media is an image.');
  }
}

client.on('message', async (message) => {
  try {
    const body = message.body.trim();
    const chatId = message.from;
    const ownerJid = formatOwnerJid(ownerNumber);
    const isOwner = chatId === ownerJid;
    
    // Handle owner confirmation for key switch
    if (isOwner && pendingKeySwitch.active) {
      const lowerBody = body.toLowerCase();
      
      if (lowerBody === 'yes' || lowerBody === 'y') {
        if (switchToNextKey()) {
          await message.reply(`✅ Switched to API key #${currentKeyIndex + 1} (${getCurrentKeyMasked()}).\n\nThe bot will now use this key for future requests.`);
          console.log(`[CONFIRMATION] Owner approved key switch to #${currentKeyIndex + 1}`);
          
          if (pendingKeySwitch.originalChatId) {
            try {
              await client.sendMessage(pendingKeySwitch.originalChatId, `API key switched. You can try your request again.`);
            } catch (e) {
              // Ignore if can't notify
            }
          }
        } else {
          await message.reply('❌ No more API keys available. All keys have been exhausted.');
        }
        pendingKeySwitch.active = false;
        return;
      }
      
      if (lowerBody === 'no' || lowerBody === 'n') {
        await message.reply('❌ Key switch cancelled. Bot will continue using the current API key.');
        console.log('[CONFIRMATION] Owner denied key switch');
        
        if (pendingKeySwitch.originalChatId) {
          try {
            await client.sendMessage(pendingKeySwitch.originalChatId, 'Key switch was denied by owner. Please try again later or contact the owner.');
          } catch (e) {
            // Ignore if can't notify
          }
        }
        pendingKeySwitch.active = false;
        return;
      }
      
      await message.reply('Please reply with *yes* or *no* to confirm the API key switch.');
      return;
    }
    
    // Auto-expire pending confirmation after 5 minutes
    if (pendingKeySwitch.active && Date.now() - pendingKeySwitch.timestamp > 300000) {
      pendingKeySwitch.active = false;
      console.log('[INFO] Pending key switch confirmation expired');
    }
    
    // Handle commands
    if (body.toLowerCase().startsWith(prefix + 'ai ')) {
      const question = body.substring(prefix.length + 3);
      await handleAI(message, question);
      return;
    }
    
    if (body.toLowerCase() === prefix + 'ai') {
      await message.reply(`Usage: \`${prefix}ai <your question>\``);
      return;
    }
    
    if (body.toLowerCase() === prefix + 's' || body.toLowerCase() === prefix + 'sticker') {
      await handleSticker(message);
      return;
    }
    
    // Owner commands
    if (isOwner) {
      if (body.toLowerCase() === prefix + 'keys') {
        let status = `🔑 *API Key Status*\n\n`;
        validKeys.forEach((key, idx) => {
          const masked = key.length <= 8 ? key : key.substring(0, 4) + '...' + key.substring(key.length - 4);
          if (idx === currentKeyIndex) {
            status += `✅ Key #${idx + 1}: ${masked} (ACTIVE)\n`;
          } else {
            status += `⚪ Key #${idx + 1}: ${masked}\n`;
          }
        });
        status += `\nTotal: ${validKeys.length} keys`;
        await message.reply(status);
        return;
      }
      
      if (body.toLowerCase() === prefix + 'switch') {
        if (currentKeyIndex >= validKeys.length - 1) {
          await message.reply('❌ Already using the last API key. No more keys available.');
          return;
        }
        if (switchToNextKey()) {
          await message.reply(`✅ Manually switched to API key #${currentKeyIndex + 1} (${getCurrentKeyMasked()})`);
        }
        return;
      }
    }
  } catch (err) {
    console.error('[MESSAGE HANDLER ERROR]', err);
  }
});

client.initialize();
```

#undefine incoming error
