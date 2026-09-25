// What each paid service costs, to estimate how much a meeting cost.
// List prices in US dollars, checked on the vendors' pricing pages in
// September 2026. They are estimates: discounts, free allowances and
// currency conversion are not included. Update the numbers here when a
// vendor changes its price (costs already saved keep the old price).

export const USAGE_SERVICES = [
  "video",
  "stt_soniox",
  "stt_elevenlabs",
  "palabra",
  "translation_openai",
  "assistant_openai",
  "web_search",
] as const;
export type UsageService = (typeof USAGE_SERVICES)[number];

// How each service is measured
export type UsageUnit = "seconds" | "tokens" | "calls";

export const USAGE_SERVICE_INFO: Record<
  UsageService,
  { label: string; unit: UsageUnit }
> = {
  video: { label: "Vídeo (Daily)", unit: "seconds" },
  stt_soniox: { label: "Legendas (Soniox)", unit: "seconds" },
  stt_elevenlabs: { label: "Legendas (ElevenLabs)", unit: "seconds" },
  palabra: { label: "Tradução por voz (Palabra)", unit: "seconds" },
  translation_openai: { label: "Tradução do texto (OpenAI)", unit: "tokens" },
  assistant_openai: { label: "Assistente de IA (OpenAI)", unit: "tokens" },
  web_search: { label: "Busca na web do assistente (Exa)", unit: "calls" },
};

// Services charged by time, in dollars per second of use.
// null = no price on file (the time is still counted).
const PER_SECOND: Partial<Record<UsageService, number | null>> = {
  // $0.004 per participant-minute (the first 10,000 minutes of the month
  // are free, see DAILY_FREE_MINUTES)
  video: 0.004 / 60,
  // $0.12 per hour of audio, translation included
  stt_soniox: 0.12 / 3600,
  // Scribe v2 Realtime: $0.39 per hour
  stt_elevenlabs: 0.39 / 3600,
  palabra: null,
};

export const DAILY_FREE_MINUTES = 10_000;

// About $0.01 per search with page contents (Exa)
const PER_CALL: Partial<Record<UsageService, number>> = {
  web_search: 0.01,
};

// OpenAI text models, dollars per 1 million tokens (standard tier).
// The priority ("fast") tier costs twice as much.
const OPENAI_MODELS: Record<
  string,
  { input: number; cachedInput: number; output: number }
> = {
  "gpt-5.4-mini": { input: 0.75, cachedInput: 0.075, output: 4.5 },
  "gpt-5.1": { input: 1.25, cachedInput: 0.125, output: 10 },
};

export function timeCost(service: UsageService, seconds: number) {
  const price = PER_SECOND[service];
  return price == null ? null : seconds * price;
}

export function callCost(service: UsageService, calls: number) {
  const price = PER_CALL[service];
  return price == null ? null : calls * price;
}

export interface TokenUsage {
  inputTokens?: number;
  cachedInputTokens?: number;
  outputTokens?: number;
}

export function openAICost(
  model: string,
  usage: TokenUsage,
  { priority = false }: { priority?: boolean } = {},
) {
  // "gpt-5.4-mini-2026-03-17" is priced as "gpt-5.4-mini"
  const key = Object.keys(OPENAI_MODELS)
    .sort((a, b) => b.length - a.length)
    .find((name) => model === name || model.startsWith(`${name}-`));
  if (!key) return null;
  const price = OPENAI_MODELS[key];
  const cached = usage.cachedInputTokens ?? 0;
  const input = Math.max(0, (usage.inputTokens ?? 0) - cached);
  const dollars =
    (input * price.input +
      cached * price.cachedInput +
      (usage.outputTokens ?? 0) * price.output) /
    1_000_000;
  return priority ? dollars * 2 : dollars;
}

// "US$ 0,042" for small amounts, "US$ 12,30" otherwise
export function formatUsd(value: number) {
  const digits = value !== 0 && Math.abs(value) < 1 ? 3 : 2;
  return `US$ ${value.toLocaleString("pt-BR", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })}`;
}

// "1 h 05 min", "12 min", "40 s"
export function formatDuration(seconds: number) {
  const total = Math.round(seconds);
  if (total < 60) return `${total} s`;
  const minutes = Math.round(total / 60);
  if (minutes < 60) return `${minutes} min`;
  return `${Math.floor(minutes / 60)} h ${String(minutes % 60).padStart(2, "0")} min`;
}

export function formatQuantity(service: UsageService, quantity: number) {
  const { unit } = USAGE_SERVICE_INFO[service];
  if (unit === "seconds") return formatDuration(quantity);
  if (unit === "calls") {
    return `${quantity} ${quantity === 1 ? "busca" : "buscas"}`;
  }
  return `${Math.round(quantity).toLocaleString("pt-BR")} tokens`;
}
