import { sql } from "drizzle-orm";

import { translateCaption } from "@/lib/caption-translation";
import { hasElevenLabsKey } from "@/lib/elevenlabs";
import { hasPalabraKeys, verifyPalabraKeys } from "@/lib/palabra";
import { createSonioxTempKey, hasSonioxKey } from "@/lib/soniox";

import { db } from "@/db";

// Checks that each outside service answers with our keys, for the status
// panel in /admin. Every check is free or close to it (temporary tokens
// that just expire, one translated word on OpenAI ~US$ 0.00001).

export type ServiceStatus = "ok" | "error" | "no-key";

export interface ServiceCheck {
  id: string;
  label: string;
  // What this service is used for in the app
  purpose: string;
  status: ServiceStatus;
  ms: number;
  detail?: string;
}

interface Probe {
  id: string;
  label: string;
  purpose: string;
  configured: () => boolean;
  run: () => Promise<string | undefined>;
}

// A failed request, with the service's own error message when it has one
async function failure(res: Response) {
  const body = await res.json().catch(() => null);
  const message =
    body?.detail?.message ??
    body?.error?.message ??
    body?.error_message ??
    body?.message ??
    (typeof body?.error === "string" ? body.error : undefined);
  return new Error(`HTTP ${res.status}${message ? `: ${message}` : ""}`);
}

async function expectOk(res: Response) {
  if (!res.ok) throw await failure(res);
  // Tokens and secrets are not kept: they just expire
  await res.body?.cancel().catch(() => {});
}

const key = (name: string) => process.env[name]?.trim() ?? "";

const PROBES: Probe[] = [
  {
    id: "database",
    label: "Banco de dados (Supabase)",
    purpose: "Salas, transcrições, custos",
    configured: () => Boolean(key("DATABASE_URL")),
    run: async () => {
      await db.execute(sql`select 1`);
      return undefined;
    },
  },
  {
    id: "daily",
    label: "Daily",
    purpose: "Vídeo e áudio das chamadas",
    configured: () => Boolean(key("DAILY_API_KEY")),
    run: async () => {
      await expectOk(
        await fetch("https://api.daily.co/v1/rooms?limit=1", {
          headers: { Authorization: `Bearer ${key("DAILY_API_KEY")}` },
          cache: "no-store",
        }),
      );
      return undefined;
    },
  },
  {
    id: "soniox-stt",
    label: "Soniox · legendas",
    purpose: "Ouve e traduz quem fala",
    configured: hasSonioxKey,
    run: async () => {
      if (!(await createSonioxTempKey("stt"))) {
        throw new Error("chave recusada (permissões ou saldo)");
      }
      return undefined;
    },
  },
  {
    id: "soniox-tts",
    label: "Soniox · voz traduzida",
    purpose: "Lê a tradução em voz alta",
    configured: hasSonioxKey,
    run: async () => {
      if (!(await createSonioxTempKey("tts"))) {
        throw new Error("chave recusada (permissões ou saldo)");
      }
      return undefined;
    },
  },
  {
    id: "openai-text",
    label: "OpenAI · tradução de texto",
    purpose: "Tradução com ElevenLabs + OpenAI",
    configured: () => Boolean(key("OPENAI_API_KEY")),
    run: async () => {
      const result = await translateCaption({
        text: "Hola",
        from: "es",
        to: "pt",
        context: [],
      });
      return `"Hola" → "${result.text}"`;
    },
  },
  {
    id: "openai-voice",
    label: "OpenAI · voz ao vivo",
    purpose: "Voz traduzida da OpenAI",
    configured: () => Boolean(key("OPENAI_API_KEY")),
    run: async () => {
      await expectOk(
        await fetch(
          "https://api.openai.com/v1/realtime/translations/client_secrets",
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${key("OPENAI_API_KEY")}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              session: {
                model: "gpt-realtime-translate",
                audio: { output: { language: "es" } },
              },
            }),
            cache: "no-store",
          },
        ),
      );
      return undefined;
    },
  },
  {
    id: "elevenlabs-stt",
    label: "ElevenLabs · legendas",
    purpose: "Ouve quem fala (com OpenAI)",
    configured: hasElevenLabsKey,
    run: async () => {
      await expectOk(
        await fetch(
          "https://api.elevenlabs.io/v1/single-use-token/realtime_scribe",
          {
            method: "POST",
            headers: { "xi-api-key": key("ELEVENLABS_API_KEY") },
            cache: "no-store",
          },
        ),
      );
      return undefined;
    },
  },
  {
    id: "elevenlabs-tts",
    label: "ElevenLabs · voz traduzida",
    purpose: "Lê a tradução em voz alta",
    configured: hasElevenLabsKey,
    run: async () => {
      await expectOk(
        await fetch(
          "https://api.elevenlabs.io/v1/single-use-token/tts_websocket",
          {
            method: "POST",
            headers: { "xi-api-key": key("ELEVENLABS_API_KEY") },
            cache: "no-store",
          },
        ),
      );
      return undefined;
    },
  },
  {
    id: "palabra",
    label: "Palabra.ai",
    purpose: "Tradução de voz (opção antiga)",
    configured: hasPalabraKeys,
    run: async () => {
      if (!(await verifyPalabraKeys())) throw new Error("chaves recusadas");
      return undefined;
    },
  },
  {
    id: "qwen",
    label: "Qwen (Alibaba)",
    purpose: "Voz com a voz da própria pessoa",
    configured: () => Boolean(key("QWEN_API_KEY")),
    run: async () => {
      await expectOk(
        await fetch(
          `${key("QWEN_API_BASE") || "https://maas.qwencloudapi.com"}/api/v1/tokens?expire_in_seconds=60`,
          {
            method: "POST",
            headers: { Authorization: `Bearer ${key("QWEN_API_KEY")}` },
            cache: "no-store",
          },
        ),
      );
      return undefined;
    },
  },
];

const TIMEOUT_MS = 15_000;

export async function checkServices(): Promise<ServiceCheck[]> {
  return Promise.all(
    PROBES.map(async (probe): Promise<ServiceCheck> => {
      const base = {
        id: probe.id,
        label: probe.label,
        purpose: probe.purpose,
      };
      if (!probe.configured()) return { ...base, status: "no-key", ms: 0 };
      const started = Date.now();
      try {
        const detail = await Promise.race([
          probe.run(),
          new Promise<never>((_, reject) =>
            setTimeout(
              () => reject(new Error("sem resposta em 15 s")),
              TIMEOUT_MS,
            ),
          ),
        ]);
        return { ...base, status: "ok", ms: Date.now() - started, detail };
      } catch (error) {
        return {
          ...base,
          status: "error",
          ms: Date.now() - started,
          detail: error instanceof Error ? error.message : String(error),
        };
      }
    }),
  );
}
