import { openai } from "@ai-sdk/openai";
import type { LanguageModelUsage } from "ai";

import { recordUsage, type UsageRecord } from "@/lib/usage";
import { callCost, openAICost } from "@/lib/usage-pricing";

// Calls OpenAI directly (reads OPENAI_API_KEY). The model can be changed
// through OPENAI_MODEL without touching the code.
const chatModelId = process.env.OPENAI_MODEL || "gpt-5.1";
export const chatModel = openai(chatModelId);

// Saves what one answer of the meeting assistant cost (tokens, plus the web
// searches it made)
export async function recordAssistantUsage(
  roomName: string,
  usage: LanguageModelUsage,
  webSearches = 0,
) {
  const tokens = {
    inputTokens: usage.inputTokens ?? 0,
    cachedInputTokens: usage.inputTokenDetails?.cacheReadTokens ?? 0,
    outputTokens: usage.outputTokens ?? 0,
  };
  const records: UsageRecord[] = [
    {
      roomName,
      service: "assistant_openai",
      quantity: tokens.inputTokens + tokens.outputTokens,
      costUsd: openAICost(chatModelId, tokens),
      detail: { model: chatModelId, ...tokens },
    },
    {
      roomName,
      service: "web_search",
      quantity: webSearches,
      costUsd: callCost("web_search", webSearches),
    },
  ];
  await recordUsage(records);
}
