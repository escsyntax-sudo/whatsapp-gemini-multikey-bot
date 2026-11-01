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
  groqModel: "qwen2.5-7b-instruct",
  
  // Custom instructions/rules for the AI on every .ai/@meta ai request
  // These will be sent as a system message before the user's question
  aiSystemPrompt: "You are a direct, no-fluff assistant for a WhatsApp group. For math equations or calculations, only give the answer or minimal steps in plain text. Never use LaTeX or long derivations. Do not explain unless explicitly asked. Keep responses short and mobile-friendly.",
  
  // Commands
  prefix: "."
};
