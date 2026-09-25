# AGENTS.md

Guidelines for AI agents working in this codebase.

## Project Overview

**R16 Meet**: private video-call tool used by R16 (Brazil) for meetings with
clients in Paraguay. R16 speaks Brazilian Portuguese; clients speak Paraguayan
Spanish (sometimes mixed with Guarani). Each person should follow the meeting
in their own language. Forked from crafter-station/i18n.

The owner is not a developer: explain changes in plain Portuguese and always
say how to test them.

## Tech Stack

- **Runtime**: Bun (use `bun` instead of `npm`/`yarn`/`pnpm`)
- **Framework**: Next.js 16 with App Router, hosted on **Vercel** (project
  `r16-meet` in the `r16bits` team, functions pinned to `gru1` São Paulo in
  `vercel.json` to sit next to the Supabase `sa-east-1` database)
- **Language**: TypeScript (strict mode)
- **Styling**: Tailwind CSS v4 with shadcn/ui (new-york style)
- **Database**: Drizzle ORM + **Supabase Postgres** via `postgres` (postgres-js)
  through the transaction pooler (port 6543, `prepare: false`)
- **Auth**: Supabase Auth, e-mail + password (`@supabase/ssr`). Accounts are
  created in the Supabase dashboard; access is granted in `/admin`
  (`team_members` table). Public sign-ups must stay disabled in Supabase
- **AI**: AI SDK v6 + `@ai-sdk/openai` called directly with `OPENAI_API_KEY`
  (no AI Gateway). Model from `OPENAI_MODEL`, see `src/lib/ai.ts`
- **Video**: Daily.co (`@daily-co/daily-js` + `@daily-co/daily-react`)
- **Translation**: pluggable providers, see "Translation providers" below
- **Email**: Resend (mock mode without a key). **Web search**: Exa (optional)
- **State**: TanStack Query + React state
- **Linting/Formatting**: Biome (NOT ESLint/Prettier)

## Commands

```bash
# Development
bun dev              # Start dev server (http://localhost:3000)
bun run build        # Production build
bun start            # Start production server
bun lint             # Biome check
bun format           # Biome format

# Database (Drizzle; reads .env.local)
bun db:generate      # Generate a migration from src/db/schema.ts
bun db:migrate       # Apply migrations in drizzle/ to the database
bun db:push          # Push schema directly (quick local sync, no migration file)
bun db:studio        # Open Drizzle Studio
```

`bun run build` is the reference check: it runs the TypeScript check too.
The codebase still has pre-existing Biome lint findings; don't mass-reformat
files unrelated to your change.

## Environment Variables

All documented in `.env.example` (copy to `.env.local`). Key rules:

- **No secret may ever reach the browser.** Never prefix a secret with
  `NEXT_PUBLIC_` and never return a secret from an API route. When the browser
  needs an external service, the server issues a short-lived token/session.
- `DATABASE_URL` = Supabase transaction pooler (6543). `DATABASE_MIGRATION_URL`
  (optional) = session pooler (5432), used only by drizzle-kit.
- `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` are public
  on purpose (Auth only). Never use the Supabase secret/service_role key here.

## Architecture

### Who can do what
- **Team member** = Supabase login + row in `team_members` (`admin`|`member`).
  `getTeamMember()` / `requireTeamMember()` / `requireAdmin()` in
  `src/lib/auth.ts`. `src/proxy.ts` only refreshes the session cookie; every
  page, route handler and server action checks access itself.
- **Guest** (client) = holder of a room's invite link
  `/{room}?convite={rooms.invite_token}`, valid until the room expires (2 h).
  `getRoomAccess()` in `src/lib/room-access.ts` is the single check for
  "may this request use this room".
- Guest screens are in Spanish, team screens in Portuguese
  (`src/lib/ui-text.ts` for screens both can see).

### Room lock and waiting room
- `rooms.locked_at`: a locked room takes no NEW guests (join route answers
  423, the invite page says so); people already in the call keep working
  (captions etc. still use `getRoomAccess`, which ignores the lock on
  purpose). Team members always get in.
- `rooms.entry_mode`: `approval` (default for new rooms) or `open`. In
  `approval`, the guest's join gets a waiting ticket (202 + `requestId`,
  row in `join_requests`) and the guest page asks again every 2 s; team
  members in the call poll `GET /api/rooms/[roomId]/join-requests` every
  3 s (requests not seen for 15 s are hidden) and decide with
  `POST .../join-requests/[requestId]`. Lock/mode are changed with
  `POST /api/rooms/[roomId]/settings` from the dashboard or the call
  (team only, `src/lib/team-room.ts`).

### Translated voice
- `src/lib/voice-engines.ts` (server) + `voice-options.ts` (client-safe
  constants): `none | soniox | elevenlabs | openai`, chosen in /admin
  (`app_settings` key `voice_engine`, checked with a free token call before
  saving; `DEV_VOICE_ENGINE` overrides locally). Only active with the
  Soniox or ElevenLabs captions providers (`getActiveVoiceEngine`).
- Soniox/ElevenLabs: each speaker picks female/male at join (sent as
  `voice` in the "final" caption message). The listener's
  `use-tts-voice.ts` gets pieces translated into its language from
  `use-captions` (`onVoicePiece`) and asks `POST /api/rooms/[roomId]/voice`
  (server calls the TTS with the real key, streams PCM s16le 24 kHz back,
  records cost). Pieces play in order; waiting pieces are read faster
  (1.12/1.25) and more than 4 waiting are dropped.
- OpenAI: `openai-voice.tsx` opens one gpt-realtime-translate WebRTC
  session per remote participant who reads another language, sending
  their Daily audio track; secret from `POST .../voice-session`. Session
  time is reported by the usage meter.
- While the voice is on, the original audio of other-language participants
  plays at 15 %, and "Falar" shows "Aguarde a tradução" while the voice
  is playing. Each person toggles the voice (Volume icon, remembered).

### Cost tracking (estimates)
- `usage_events` (one row per measured use; `room_id` is set null when a
  room is deleted, `room_name` stays) + prices in `src/lib/usage-pricing.ts`
  (list prices in USD; the cost is computed and saved when the row is
  written, so price changes don't rewrite history). `src/lib/usage.ts`
  saves (`recordUsage`, never throws) and sums (by room, by month in
  Brazil time).
- What is measured: each browser reports every 60 s and on leave
  (`use-usage-meter.ts` -> `POST /api/rooms/[roomId]/usage`, max 120 s per
  report) its call time (Daily participant-minutes) and how long the
  translation engine listened to it (Soniox/ElevenLabs while the mic is
  open, Palabra while active; Palabra has no price on file). The server
  records OpenAI tokens of caption translation (captions route, priority
  tier = 2x) and of the assistant (agent/intent/actions routes, plus Exa
  web searches at ~$0.01).
- Shown: team-only badge in the call (`GET .../usage`, every 30 s), "Custo
  até agora" per room on the dashboard, `/custos` (month totals + each
  meeting) and the month total in `/admin`. A new service needs a new
  value in `USAGE_SERVICES` AND a migration for the check constraint.

### Flow
1. Team member clicks "Nova reunião" on `/` → `POST /api/rooms` (team only)
   creates a **private** Daily room (no entry without a meeting token) and a
   `rooms` row with a random `invite_token`.
2. `/[roomId]` (server page) checks access, then the join form →
   `POST /api/rooms/[roomId]/join` (team or valid invite) upserts a
   `participants` row and returns a Daily meeting token (expires with the
   room), the active `translationProvider`, and for the team the invite link.
3. `CallUI` joins Daily. Remote audio is played by `ParticipantTile`
   unless the provider replaces it (Palabra).
4. Transcript column on the right (`transcript-sidebar.tsx`, docked on
   wide screens, full-screen on phones, toggled from the controls): the
   meeting transcript for everyone, in each reader's language. Agent (team
   only, inside that column): `/api/agent/[roomId]` (chat),
   `/intent` (email intent detection), `/actions` (action items),
   `/actions/execute` (send email via Resend; recipients must be confirmed by
   the user, never hardcoded).
5. `/admin` (admins): pick the translation provider, grant/revoke team access.

### Translation providers
`src/lib/translation-providers.ts` decides on the server which provider is
active (`getActiveTranslationProvider()`): the admin's choice in
`app_settings` (key `translation_provider`), else the `TRANSLATION_PROVIDER`
env var, and `none` if the chosen provider has no keys. Currently:

- `none`: plain call, original audio
- `palabra`: Palabra.ai speech-to-speech (`use-transcription.ts`); remote
  original audio is not played, only Palabra's TTS. The browser SDK uses
  `apiBaseUrl: "/api/palabra"`: that route proxies session create/delete with
  the Palabra keys, after checking room access (bearer = `{room}.{invite}`).
  The Palabra secret never reaches the browser. Keys: `PALABRA_API_KEY`
  (current single key, sent as Bearer) or the legacy `PALABRA_CLIENT_ID` +
  `PALABRA_CLIENT_SECRET` pair (`src/lib/palabra.ts`). The admin panel checks
  the keys with a real session before enabling Palabra, and the call UI only
  mutes the original voice while Palabra's voice is actually playing.
- `elevenlabs`: translated captions, original voice kept (phase 3, in
  progress). Each browser transcribes **only its own mic** with ElevenLabs
  Scribe Realtime (WebSocket straight to ElevenLabs), authenticated with a
  single-use token from `POST /api/elevenlabs/token` (checks room access,
  body `{ room, invite }`). OpenAI translates the text. Keys:
  `ELEVENLABS_API_KEY` (restricted to Speech to Text) + `OPENAI_API_KEY`
  (`src/lib/elevenlabs.ts`). The admin panel checks the key by creating a
  token before enabling it.
  - `use-scribe.ts`: mic → AudioWorklet → PCM at the context's own rate →
    Scribe (`commit_strategy=vad`, 0.6 s pause ends a phrase). Audio is only
    sent while the mic is open; `stop()` sends a final commit so the last
    phrase comes out right away. One unused token is kept ready.
  - `use-floor.ts`: floor control ("trava de fala"), on by default. "Falar"
    takes the floor and closes everyone else's mic; "Terminei" or 8 s of
    silence releases it. No server: state is synced with Daily app messages
    (`kind: "r16-floor"`), sender taken from Daily's `fromId`, earliest
    claim wins. Team members can turn it off for everyone (hand icon).
  - `use-captions.ts` (`kind: "r16-caption"`): everyone announces the
    language they want (`lang`). The speaker broadcasts partial/final text,
    then `POST /api/rooms/[roomId]/captions` translates the phrase into the
    listeners' languages (`src/lib/caption-translation.ts`, OpenAI
    `OPENAI_TRANSLATION_MODEL`, default `gpt-5.4-mini`, reasoning off,
    priority service tier unless `OPENAI_TRANSLATION_PRIORITY=false`, the
    browser sends the last 6 pieces as context), saves it in `transcripts`
    after answering (`after()`), and returns the translations, which the speaker broadcasts. `CaptionsBar` works like
    TV subtitles: the last two finished pieces, each shown once translated
    and never rewritten. Listeners only ever see text in their own
    language (a "translating" hint meanwhile).
  - Pieces: `caption-pieces.ts` cuts the live transcript **text** (never
    the audio, so no word is cut in half): right after punctuation Scribe
    added, once 2 more words followed; without punctuation, every ~14 words,
    never ending on a linking word. What's left goes out when Scribe ends
    the phrase (0.6 s pause) or on "Terminei".
  - Planned next: translated voice (ElevenLabs TTS, per-speaker
    female/male voice), glossary in `/admin`, agent reading `transcripts`.
  - Local testing: the local app shares the production DB, so don't pick
    ElevenLabs/Soniox in the local `/admin`; set `DEV_TRANSLATION_PROVIDER`
    in `.env.local` instead (ignored outside `bun dev`).
- `soniox`: same UI and flow as `elevenlabs` (floor control, captions,
  transcript panel, `transcripts`), but `use-soniox.ts` sends each person's
  own mic to Soniox (`stt-rt-v5`, WebSocket straight from the browser,
  temporary single-use key from `POST /api/soniox/token`), which transcribes
  AND translates (one_way into the language most listeners read, from
  `useCaptions().getTargetLanguage()`). Soniox returns finished pieces with
  their translation; they are broadcast in the `final` message and the
  captions route only saves them (no OpenAI). Measured ~2–4 s sooner than
  ElevenLabs + OpenAI. Key: `SONIOX_API_KEY` (`src/lib/soniox.ts`, needs
  "Speech-to-text, real-time" + "Temporary API keys", prepaid balance).
  Mic capture shared with ElevenLabs in `hooks/mic-tap.ts`.

**Palabra is a permanent option; never remove it.** The owner wants to
choose among several providers in the admin panel. To add a provider:
extend `TRANSLATION_PROVIDERS` and `TRANSLATION_PROVIDER_INFO`, add its
`isConfigured` check, and branch in `CallUI`.

### Database security
Every table is created with RLS enabled and **no policies**. The app only
accesses Postgres from the server as the table owner, so Supabase's public
Data API (anon key) cannot read or write app tables. Keep `.enableRLS()` on
every new table.

### Known gaps (planned)
- Agent routes still receive the transcript from the client instead of
  reading it from the DB. Transcripts are now stored (ElevenLabs provider);
  switching the agent to read them is the last step of phase 3.
- The in-call agent panel and e-mail dialog are still partly in English
  (team-only screens).
- `/[roomId]/agent` page is currently broken (calls `/actions` with GET and
  the chat without transcripts); fixed once transcripts live in the DB.

## Testing

**No test infrastructure is currently set up.** When adding tests:
- Recommend Vitest for unit/integration tests
- Recommend Playwright for E2E tests
- Add scripts to package.json: `"test": "vitest"`, `"test:e2e": "playwright test"`

## Project Structure

```
src/
├── app/
│   ├── api/
│   │   ├── rooms/              # create room, join room (Daily token)
│   │   ├── agent/[roomId]/     # AI agent: chat, intent, actions, execute
│   │   ├── palabra/[...path]/  # Palabra session proxy (keeps the secret server-side)
│   │   └── elevenlabs/token/   # single-use ElevenLabs token for the browser
│   ├── [roomId]/               # access check + join form + call; agent/ (team only)
│   ├── admin/                  # translation provider + team access (admins)
│   ├── entrar/                 # login page + sign-in/sign-out server actions
│   ├── saiu/                   # where guests land after leaving a call
│   ├── layout.tsx
│   ├── page.tsx                # team dashboard: new meeting, open rooms
│   └── globals.css
├── components/
│   ├── ui/                     # shadcn/ui (DO NOT EDIT directly)
│   ├── providers/              # TanStack Query provider
│   ├── video-call/             # CallUI, tiles, controls, hooks
│   (video-call/transcript-sidebar.tsx: transcript column + team AI agent)
├── db/
│   ├── index.ts                # postgres-js + Drizzle client (lazy)
│   └── schema.ts               # tables (all with RLS enabled)
├── hooks/                      # use-fingerprint (anonymous participant id)
├── lib/                        # auth.ts, room-access.ts, supabase/, ui-text.ts,
│                               # translation-providers.ts, languages.ts, ai.ts
├── proxy.ts                    # refreshes the Supabase session cookie
└── tools/                      # send-email (Resend), web-search (Exa)
drizzle/                        # generated SQL migrations
```

## Path Alias

Use `@/*` for imports from `src/`:
```typescript
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { useRoom } from "@/hooks/use-room";
```

## Code Style

### Import Organization (Biome-enforced)

Imports must be organized with blank lines between groups:

```typescript
// 1. React/Next.js
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";

// 2. External packages
import { useMutation } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";

// 3. Internal lib
import { cn } from "@/lib/utils";
import { db } from "@/db";

// 4. Components
import { Button } from "@/components/ui/button";
import { CallUI } from "@/components/video-call/call-ui";

// 5. Hooks
import { useRoom } from "@/hooks/use-room";
```

### Naming Conventions

| Type | Convention | Example |
|------|------------|---------|
| Files | kebab-case | `use-room.ts`, `video-grid.tsx` |
| Components | PascalCase | `VideoRoom`, `CreateRoomForm` |
| Hooks | camelCase with `use` prefix | `useRoom`, `useCreateRoom` |
| Functions | camelCase | `handleSubmit`, `toggleAudio` |
| Constants | UPPER_SNAKE_CASE | `DAILY_API_KEY`, `MOBILE_BREAKPOINT` |
| Types/Interfaces | PascalCase | `Room`, `VideoRoomProps` |
| Database tables | snake_case | `daily_room_name`, `created_at` |

### Component Pattern

```typescript
"use client";  // Required for client components

import { cn } from "@/lib/utils";

interface ComponentProps {
  className?: string;
  children: React.ReactNode;
}

export function Component({ className, children }: ComponentProps) {
  return (
    <div className={cn("base-classes", className)}>
      {children}
    </div>
  );
}
```

### API Route Pattern

```typescript
import { NextResponse } from "next/server";
import { db } from "@/db";

export async function POST(request: Request) {
  try {
    const body = await request.json();

    // Validation
    if (!body.requiredField) {
      return NextResponse.json(
        { error: "Field is required" },
        { status: 400 }
      );
    }

    // Logic here...
    const result = await db.insert(table).values(data).returning();

    return NextResponse.json(result);
  } catch (error) {
    console.error("Error description:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
```

### Custom Hook Pattern (with TanStack Query)

```typescript
"use client";

import { useMutation, useQuery } from "@tanstack/react-query";

export function useCreateThing() {
  return useMutation({
    mutationFn: async (data: CreateData): Promise<Thing> => {
      const response = await fetch("/api/things", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to create thing");
      }

      return response.json();
    },
  });
}
```

### Database Schema Pattern (Drizzle)

```typescript
import { pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import type { z } from "zod";

export const things = pgTable("things", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertThingSchema = createInsertSchema(things);
export const selectThingSchema = createSelectSchema(things);
export type Thing = z.infer<typeof selectThingSchema>;
export type NewThing = z.infer<typeof insertThingSchema>;
```

## Formatting Rules (Biome)

- **Indentation**: 2 spaces
- **Semicolons**: Required (default)
- **Quotes**: Double quotes for strings
- **Trailing commas**: ES5 style

Run `bunx biome check --write .` before committing.

## Important Notes

1. **shadcn/ui components**: Located in `src/components/ui/`. These are generated - prefer not editing directly. Add new ones via `bunx shadcn@latest add <component>`.

2. **"use client" directive**: Required at the top of any component using hooks, event handlers, or browser APIs.

3. **cn() utility**: Always use for conditional Tailwind classes:
   ```typescript
   className={cn("base-class", isActive && "active-class", className)}
   ```

4. **Environment variables**: Server-only vars go in `.env.local`. Client vars need `NEXT_PUBLIC_` prefix.

5. **Daily.co integration**: Video rooms use `@daily-co/daily-react` hooks. The `DailyProvider` must wrap video components.

6. **No tests yet**: Be extra careful with changes. Consider adding tests when implementing critical features.
