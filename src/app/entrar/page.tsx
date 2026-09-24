import { redirect } from "next/navigation";

import { getTeamMember } from "@/lib/auth";

import { SignInForm } from "./sign-in-form";

export const metadata = { title: "Entrar · R16 Meet" };

export default async function SignInPage() {
  if (await getTeamMember()) redirect("/");

  return (
    <div className="min-h-screen bg-neutral-100 flex items-center justify-center">
      <div className="w-full max-w-sm p-8 space-y-6">
        <div className="space-y-2 text-center">
          <p className="text-xs font-medium tracking-widest uppercase text-neutral-500">
            [ R16 MEET ]
          </p>
          <h1 className="text-3xl font-light tracking-tight text-black">
            Entrar
          </h1>
          <p className="text-neutral-600">Acesso restrito à equipe R16</p>
        </div>

        <SignInForm />

        <p className="text-xs text-center text-neutral-500">
          Cliente convidado? Use o link que você recebeu por mensagem.
        </p>
      </div>
    </div>
  );
}
