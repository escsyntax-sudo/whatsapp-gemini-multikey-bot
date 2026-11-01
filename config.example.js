export default {
  // Your WhatsApp number as owner (with country code, no + or spaces, just digits)
  // This number will receive confirmation requests when switching API keys
  ownerNumber: "1234567890",
  
  // Array of Gemini API keys - will rotate when one hits rate limits
  geminiApiKeys: [
    "YOUR_FIRST_GEMINI_API_KEY",
    "YOUR_SECOND_GEMINI_API_KEY",
    "YOUR_THIRD_GEMINI_API_KEY"
  ],
  
  // Default model to use
  geminiModel: "gemini-1.5-flash",
  
  // Commands
  prefix: "."
};
