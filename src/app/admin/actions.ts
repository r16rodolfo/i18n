"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { db } from "@/db";
import { appSettings, teamMembers } from "@/db/schema";
import { getTeamMember } from "@/lib/auth";
import { verifyElevenLabsKey } from "@/lib/elevenlabs";
import { verifyPalabraKeys } from "@/lib/palabra";
import {
  isConfigured,
  isTranslationProvider,
  TRANSLATION_PROVIDER_SETTING,
} from "@/lib/translation-providers";

// Server actions are reachable by anyone who can send a POST, so every
// action checks for an admin itself instead of trusting the page.
async function assertAdmin() {
  const member = await getTeamMember();
  if (!member || member.role !== "admin") {
    throw new Error("Apenas administradores podem fazer isso.");
  }
  return member;
}

export async function setTranslationProvider(formData: FormData) {
  const admin = await assertAdmin();

  const provider = formData.get("provider");
  if (!isTranslationProvider(provider)) throw new Error("Provedor inválido");
  if (!isConfigured(provider)) {
    throw new Error("As chaves deste provedor não estão configuradas");
  }
  // Keys present is not enough: make sure the service accepts them, or
  // every call would go silent (the original voice is replaced).
  if (provider === "palabra" && !(await verifyPalabraKeys())) {
    redirect("/admin?erro=chaves-palabra");
  }
  if (provider === "elevenlabs" && !(await verifyElevenLabsKey())) {
    redirect("/admin?erro=chave-elevenlabs");
  }

  await db
    .insert(appSettings)
    .values({
      key: TRANSLATION_PROVIDER_SETTING,
      value: provider,
      updatedBy: admin.userId,
    })
    .onConflictDoUpdate({
      target: appSettings.key,
      set: { value: provider, updatedBy: admin.userId, updatedAt: new Date() },
    });

  revalidatePath("/admin");
  redirect("/admin");
}

const MemberChangeSchema = z.object({
  userId: z.uuid(),
  change: z.enum(["grant", "revoke", "make-admin", "make-member"]),
});

export async function changeTeamMember(formData: FormData) {
  const admin = await assertAdmin();

  const { userId, change } = MemberChangeSchema.parse({
    userId: formData.get("userId"),
    change: formData.get("change"),
  });

  // An admin can't lock themselves out
  if (userId === admin.userId) {
    throw new Error("Você não pode alterar o seu próprio acesso");
  }

  switch (change) {
    case "grant":
      await db
        .insert(teamMembers)
        .values({ userId, role: "member" })
        .onConflictDoNothing();
      break;
    case "revoke":
      await db.delete(teamMembers).where(eq(teamMembers.userId, userId));
      break;
    case "make-admin":
    case "make-member":
      await db
        .update(teamMembers)
        .set({ role: change === "make-admin" ? "admin" : "member" })
        .where(eq(teamMembers.userId, userId));
      break;
  }

  revalidatePath("/admin");
}
