import { openai } from "@ai-sdk/openai";

// Calls OpenAI directly (reads OPENAI_API_KEY). The model can be changed
// through OPENAI_MODEL without touching the code.
export const chatModel = openai(process.env.OPENAI_MODEL || "gpt-5.1");
