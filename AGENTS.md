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
- **Framework**: Next.js 16 with App Router, hosted on **Vercel**
- **Language**: TypeScript (strict mode)
- **Styling**: Tailwind CSS v4 with shadcn/ui (new-york style)
- **Database**: Drizzle ORM + **Supabase Postgres** via `postgres` (postgres-js)
  through the transaction pooler (port 6543, `prepare: false`)
- **Auth**: Supabase Auth (planned, phase 2)
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

## Architecture

### Flow today
1. `POST /api/rooms` creates a Daily room + a `rooms` row, returns a nanoid slug.
2. `/[roomId]` join form → `POST /api/rooms/[roomId]/join` upserts a
   `participants` row, returns a Daily meeting token and the active
   `translationProvider`.
3. `CallUI` joins Daily. Remote audio is played by `ParticipantTile`
   unless the provider replaces it (Palabra).
4. Agent: `/api/agent/[roomId]` (chat), `/intent` (email intent detection),
   `/actions` (action items), `/actions/execute` (send email via Resend;
   recipients must be confirmed by the user, never hardcoded).

### Translation providers
`src/lib/translation-providers.ts` decides on the server which provider is
active (`getActiveTranslationProvider()`, async so it can later read the
admin panel settings from the DB). Currently:

- `none`: plain call, original audio
- `palabra`: Palabra.ai speech-to-speech (`use-transcription.ts`); remote
  original audio is not played, only Palabra's TTS

**Palabra is a permanent option; never remove it.** The owner wants to
choose among several providers (enable/disable them in the admin panel,
phase 2). Selected by `TRANSLATION_PROVIDER` for now; falls back to `none`
when keys are missing. To add a provider: extend `TRANSLATION_PROVIDERS`, add its
`isConfigured` check, and branch in `CallUI`.

### Database security
Every table is created with RLS enabled and **no policies**. The app only
accesses Postgres from the server as the table owner, so Supabase's public
Data API (anon key) cannot read or write app tables. Keep `.enableRLS()` on
every new table.

### Known gaps (planned)
- Phase 2: Supabase Auth, invite links for guests, private Daily rooms,
  replace `/api/palabra-auth` (still returns the Palabra secret when Palabra
  is active) with a server-side session proxy (Palabra itself stays), admin panel for providers,
  agent routes reading transcripts from the DB instead of the client.
- Phase 3: translated captions + original voice (streaming STT + LLM with a
  glossary), transcripts persisted in `transcripts`.
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
│   │   └── palabra-auth/       # insecure, becomes a server-side proxy in phase 2
│   ├── [roomId]/               # join form + call; agent/ (post-meeting page)
│   ├── layout.tsx
│   ├── page.tsx                # landing / create room
│   └── globals.css
├── components/
│   ├── ui/                     # shadcn/ui (DO NOT EDIT directly)
│   ├── providers/              # TanStack Query provider
│   ├── video-call/             # CallUI, tiles, controls, hooks
│   └── agent-panel.tsx         # in-call AI chat overlay
├── db/
│   ├── index.ts                # postgres-js + Drizzle client (lazy)
│   └── schema.ts               # tables (all with RLS enabled)
├── hooks/                      # use-fingerprint (replaced by auth in phase 2)
├── lib/                        # ai.ts, languages.ts, translation-providers.ts, ...
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
