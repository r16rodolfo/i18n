"use server";

import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { z } from "zod";

import { db } from "@/db";
import { teamMembers } from "@/db/schema";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export interface SignInState {
  error: string | null;
}

const SignInSchema = z.object({
  email: z.email(),
  password: z.string().min(1),
});

export async function signIn(
  _prev: SignInState,
  formData: FormData,
): Promise<SignInState> {
  const parsed = SignInSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) {
    return { error: "Informe o e-mail e a senha." };
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error || !data.user) {
    return { error: "E-mail ou senha incorretos." };
  }

  // A Supabase account alone is not enough: it must be on the team list
  const member = await db.query.teamMembers.findFirst({
    where: eq(teamMembers.userId, data.user.id),
  });
  if (!member) {
    await supabase.auth.signOut();
    return {
      error:
        "Sua conta ainda não tem acesso ao R16 Meet. Peça para um administrador liberar.",
    };
  }

  redirect("/");
}

export async function signOut() {
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();
  redirect("/entrar");
}
