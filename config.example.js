export default {
  // Your WhatsApp number as owner (with country code, no + or spaces, just digits)
  // This number will receive confirmation requests when switching API keys
  ownerNumber: "1234567890",
  
  // Array of Groq API keys - will rotate when one hits rate limits
  // Get keys from https://console.groq.com/keys (usually start with gsk_)
  groqApiKeys: [
    "YOUR_FIRST_GROQ_API_KEY",
    "YOUR_SECOND_GROQ_API_KEY",
    "YOUR_THIRD_GROQ_API_KEY"
  ],
  
  // Default model to use (see https://console.groq.com/docs/models)
  groqModel: "llama-3.1-8b-instant",
  
  // Commands
  prefix: "."
};
