import { NextResponse } from "next/server";

import { getActiveTranslationProvider } from "@/lib/translation-providers";

// TODO(phase 2): this still hands the Palabra secret to the browser. It will
// be replaced by a server-side proxy that only returns short-lived sessions.
export async function GET() {
  if ((await getActiveTranslationProvider()) !== "palabra") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json({
    clientId: process.env.PALABRA_CLIENT_ID,
    clientSecret: process.env.PALABRA_CLIENT_SECRET,
  });
}
