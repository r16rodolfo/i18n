import { openai } from "@ai-sdk/openai";
import { generateText } from "ai";

import type { LanguageCode } from "@/lib/languages";
import { getLanguageName } from "@/lib/languages";
import { openAICost } from "@/lib/usage-pricing";

// Translates live captions (ElevenLabs provider) with OpenAI. A small model
// with no extra reasoning, on OpenAI's priority tier (steadier and faster:
// about 0.8 s per piece, at a higher price per word), keeps the captions
// close to the speech. Both can be changed through the environment:
// OPENAI_TRANSLATION_MODEL, and OPENAI_TRANSLATION_PRIORITY=false.
const modelId = process.env.OPENAI_TRANSLATION_MODEL || "gpt-5.4-mini";
const translationModel = openai(modelId);
const serviceTier =
  process.env.OPENAI_TRANSLATION_PRIORITY === "false" ? "auto" : "priority";

// How each language should sound for this audience
const LANGUAGE_STYLE: Partial<Record<LanguageCode, string>> = {
  pt: "Brazilian Portuguese",
  es: "Spanish as spoken in Paraguay (use Paraguayan vocabulary where it is natural, e.g. 'turno' for an appointment)",
};

function describe(code: LanguageCode): string {
  return LANGUAGE_STYLE[code] ?? getLanguageName(code);
}

interface TranslateCaptionInput {
  text: string;
  from: LanguageCode;
  to: LanguageCode;
  // A few earlier pieces of the meeting, oldest first (context only)
  context: string[];
}

export interface CaptionTranslation {
  text: string;
  inputTokens: number;
  outputTokens: number;
  // Estimated, in dollars (null when the model has no price on file)
  costUsd: number | null;
}

export async function translateCaption({
  text,
  from,
  to,
  context,
}: TranslateCaptionInput): Promise<CaptionTranslation> {
  const earlier = context.length
    ? `Earlier in the meeting (context only, do not translate):\n${context
        .map((line) => `- ${line}`)
        .join("\n")}\n\n`
    : "";

  const { text: translated, usage } = await generateText({
    model: translationModel,
    system: [
      "You translate live captions of video meetings between R16, a Brazilian company, and its clients in Paraguay.",
      `Translate the speaker's phrase from ${describe(from)} to ${describe(to)}.`,
      "Keep names of people, companies and products exactly as they are.",
      "Keep the meaning and the tone, in a natural spoken style. If the speaker mixes in Guarani words, translate what they mean.",
      "The phrase is a piece of continuous speech and may start or stop mid-sentence: use the earlier pieces to understand it, translate only this piece, and never complete it.",
      "If the phrase is already in the target language, return it unchanged.",
      "Answer with the translation only: no quotes, notes or explanations.",
    ].join("\n"),
    prompt: `${earlier}Phrase to translate:\n${text}`,
    maxOutputTokens: 800,
    providerOptions: { openai: { reasoningEffort: "none", serviceTier } },
  });

  const tokens = {
    inputTokens: usage.inputTokens ?? 0,
    cachedInputTokens: usage.inputTokenDetails?.cacheReadTokens ?? 0,
    outputTokens: usage.outputTokens ?? 0,
  };
  return {
    text: translated.trim(),
    inputTokens: tokens.inputTokens,
    outputTokens: tokens.outputTokens,
    costUsd: openAICost(modelId, tokens, {
      priority: serviceTier === "priority",
    }),
  };
}
