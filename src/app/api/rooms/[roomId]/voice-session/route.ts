import { z } from "zod";

import { isValidLanguageCode } from "@/lib/languages";
import { getRoomAccess } from "@/lib/room-access";
import { getActiveTranslationProvider } from "@/lib/translation-providers";
import { getActiveVoiceEngine } from "@/lib/voice-engines";

// OpenAI voice: a short-lived secret so the listener's browser can open a
// translation session (the speaker's audio in, speech in the listener's
// language out) without ever seeing the real key.

// Languages gpt-realtime-translate can speak
const OUTPUT_LANGUAGES = new Set([
  "es",
  "pt",
  "fr",
  "ja",
  "ru",
  "zh",
  "de",
  "ko",
  "hi",
  "id",
  "vi",
  "it",
  "en",
]);

const BodySchema = z.object({
  invite: z.string().max(100).nullish(),
  language: z.string().refine(isValidLanguageCode),
});

const noStore = { "Cache-Control": "no-store" };

export async function POST(
  req: Request,
  { params }: { params: Promise<{ roomId: string }> },
) {
  const { roomId } = await params;
  const parsed = BodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success || !OUTPUT_LANGUAGES.has(parsed.data.language)) {
    return Response.json(
      { error: "Dados inválidos" },
      { status: 400, headers: noStore },
    );
  }

  const [provider, access] = await Promise.all([
    getActiveTranslationProvider(),
    getRoomAccess(roomId, parsed.data.invite),
  ]);
  if (!access) {
    return Response.json(
      { error: "Não autorizado" },
      { status: 401, headers: noStore },
    );
  }
  if ((await getActiveVoiceEngine(provider)) !== "openai") {
    return Response.json(
      { error: "Voz da OpenAI desativada" },
      { status: 409, headers: noStore },
    );
  }

  const res = await fetch(
    "https://api.openai.com/v1/realtime/translations/client_secrets",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        session: {
          model: "gpt-realtime-translate",
          audio: {
            input: { noise_reduction: { type: "near_field" } },
            output: { language: parsed.data.language },
          },
        },
      }),
    },
  );
  if (!res.ok) {
    console.error(
      "[voice] OpenAI session failed:",
      res.status,
      await res.text().catch(() => ""),
    );
    return Response.json(
      { error: "Não foi possível falar com a OpenAI" },
      { status: 502, headers: noStore },
    );
  }
  const { value } = (await res.json()) as { value?: string };
  if (!value) {
    return Response.json(
      { error: "Não foi possível falar com a OpenAI" },
      { status: 502, headers: noStore },
    );
  }
  return Response.json({ clientSecret: value }, { headers: noStore });
}
