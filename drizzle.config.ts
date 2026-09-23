import { defineConfig } from "drizzle-kit";

// drizzle-kit does not read .env.local on its own
try {
  process.loadEnvFile(".env.local");
} catch {
  // file is optional (e.g. on Vercel the variables come from the environment)
}

export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    // Migrations work best over the session pooler (port 5432); the app
    // itself uses the transaction pooler (port 6543) via DATABASE_URL.
    url: (process.env.DATABASE_MIGRATION_URL || process.env.DATABASE_URL)!,
  },
});
