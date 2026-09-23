# R16 Meet

A private video-call tool from R16 for meetings with clients in Paraguay:
each person follows the meeting in their own language (Brazilian Portuguese ⇄
Spanish). Based on the open-source project
[crafter-station/i18n](https://github.com/crafter-station/i18n).

**Infrastructure:** Vercel (hosting) · Supabase (database and, soon, login) ·
Daily.co (video) · OpenAI (meeting agent) · translation provider configurable
(`none` or Palabra for now).

Architecture details for anyone (or any AI) working on the code: see
[AGENTS.md](AGENTS.md).

---

## Running on your computer

### 1. Install what you need (once)

- **Node.js** 20 or newer: <https://nodejs.org>
- **Bun** (runs the project):
  ```bash
  npm install -g bun
  ```
  Check with `bun --version`.

### 2. Get the keys

| Service | What to do | Variable in `.env.local` |
|---|---|---|
| **Supabase** | Create a project (region **South America (São Paulo)**). Click **Connect** → copy the *Transaction pooler* URL (port 6543) and the *Session pooler* URL (port 5432). Replace `[YOUR-PASSWORD]` with the database password. | `DATABASE_URL` (6543) and `DATABASE_MIGRATION_URL` (5432) |
| **Daily.co** | dashboard.daily.co → *Developers* → copy the API key. | `DAILY_API_KEY` |
| **OpenAI** | platform.openai.com → *API keys* → create a key. | `OPENAI_API_KEY` |
| Resend *(optional)* | Without it, emails are only simulated. | `RESEND_API_KEY`, `RESEND_FROM_EMAIL` |
| Palabra *(optional)* | Only if you want to test with `TRANSLATION_PROVIDER=palabra`. | `PALABRA_CLIENT_ID`, `PALABRA_CLIENT_SECRET` |

### 3. Configure

In the project folder:

```bash
bun install
```

Copy the example file and fill in the keys (in PowerShell: `Copy-Item .env.example .env.local`):

```bash
cp .env.example .env.local
```

Every variable is explained inside `.env.example`. The `.env.local` file
**never** goes to GitHub (it is in `.gitignore`).

### 4. Create the tables in the database (once, and whenever the schema changes)

```bash
bun db:migrate
```

In Supabase → *Table Editor* the tables `rooms`, `participants` and
`transcripts` should now appear, each with the "RLS enabled" label.

### 5. Start

```bash
bun dev
```

Open <http://localhost:3000>.

### How to test

1. On the home page, click **Start Call** (or **Create Room**). You will be taken to the room
   page.
2. Fill in your name and join. Allow camera and microphone.
3. Copy the room link and open it in **another browser** (or on your
   phone/another computer), with a different name.
4. Check that one person sees **and hears** the other. Use headphones to
   avoid echo if both are on the same computer.
5. In Supabase → *Table Editor* → `rooms` and `participants`, the room and
   the two participants should appear.

If something fails, the error shows up in the terminal where `bun dev` is
running.

---

## Useful commands

| Command | What it does |
|---|---|
| `bun dev` | Starts the app on your computer |
| `bun run build` | Checks that everything compiles (the same thing Vercel does) |
| `bun db:migrate` | Applies database changes |
| `bun db:studio` | Opens a visual editor for the database |
| `bun lint` | Checks code style (Biome) |

## License

MIT (original project by Crafter Station).
