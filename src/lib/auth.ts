import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { cache } from "react";

import { db } from "@/db";
import { teamMembers, type TeamRole } from "@/db/schema";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export interface CurrentMember {
  userId: string;
  email: string;
  role: TeamRole;
}

// The signed-in R16 team member, or null. Having a Supabase account is not
// enough: the account also needs a row in team_members (granted in /admin).
// Cached per request, so pages and helpers can call it freely.
export const getTeamMember = cache(async (): Promise<CurrentMember | null> => {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.getClaims();
  const claims = data?.claims;
  if (error || !claims?.sub) return null;

  const member = await db.query.teamMembers.findFirst({
    where: eq(teamMembers.userId, claims.sub),
  });
  if (!member) return null;

  return {
    userId: claims.sub,
    email: typeof claims.email === "string" ? claims.email : "",
    role: member.role,
  };
});

// For pages: send visitors who are not on the team to the login page
export async function requireTeamMember(): Promise<CurrentMember> {
  const member = await getTeamMember();
  if (!member) redirect("/entrar");
  return member;
}

// For pages: only admins get through
export async function requireAdmin(): Promise<CurrentMember> {
  const member = await requireTeamMember();
  if (member.role !== "admin") redirect("/");
  return member;
}

// For route handlers: a JSON 401 instead of a redirect
export function unauthorized() {
  return Response.json({ error: "Não autorizado" }, { status: 401 });
}
