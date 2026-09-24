import { sql } from "drizzle-orm";

import { db } from "@/db";
import type { TeamRole } from "@/db/schema";
import { requireAdmin } from "@/lib/auth";
import {
  getSelectedTranslationProvider,
  isConfigured,
  TRANSLATION_PROVIDER_INFO,
  TRANSLATION_PROVIDERS,
} from "@/lib/translation-providers";

import { TeamHeader } from "@/components/team-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

import { changeTeamMember, setTranslationProvider } from "./actions";

export const metadata = { title: "Administração · R16 Meet" };

interface AccountRow extends Record<string, unknown> {
  id: string;
  email: string | null;
  last_sign_in_at: string | null;
  role: TeamRole | null;
}

const dateFormat = new Intl.DateTimeFormat("pt-BR", {
  dateStyle: "short",
  timeStyle: "short",
  timeZone: "America/Sao_Paulo",
});

export default async function AdminPage({
  searchParams,
}: {
  searchParams: Promise<{ erro?: string }>;
}) {
  const admin = await requireAdmin();
  const { erro } = await searchParams;

  const selectedProvider = await getSelectedTranslationProvider();

  // Every Supabase account, with its access level in the app (if any).
  // Accounts are created in the Supabase dashboard, access is granted here.
  const accounts = await db.execute<AccountRow>(sql`
    select u.id, u.email, u.last_sign_in_at, tm.role
    from auth.users u
    left join public.team_members tm on tm.user_id = u.id
    order by u.email
  `);

  return (
    <div className="min-h-screen bg-neutral-100">
      <TeamHeader member={admin} />

      <main className="max-w-3xl mx-auto px-4 py-10 space-y-12">
        <h1 className="text-3xl font-light tracking-tight text-black">
          Administração
        </h1>

        {/* Translation provider */}
        <section className="space-y-4">
          <div className="space-y-1">
            <h2 className="text-lg font-medium text-black">Tradução</h2>
            <p className="text-sm text-neutral-600">
              Serviço usado nas próximas chamadas. Quem já está numa chamada
              continua com o serviço que estava ativo quando entrou.
            </p>
          </div>

          {erro === "chaves-palabra" && (
            <p
              role="alert"
              className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700"
            >
              A Palabra recusou a chave configurada na Vercel (PALABRA_API_KEY).
              Ela não foi ativada: confira a chave no painel da Palabra e tente
              de novo.
            </p>
          )}

          {erro === "chave-elevenlabs" && (
            <p
              role="alert"
              className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700"
            >
              A ElevenLabs recusou a chave configurada na Vercel
              (ELEVENLABS_API_KEY). Ela não foi ativada: confira se a chave está
              certa e se tem permissão de &quot;Speech to Text&quot; no painel
              da ElevenLabs, e tente de novo.
            </p>
          )}

          <ul className="space-y-2">
            {TRANSLATION_PROVIDERS.map((provider) => {
              const info = TRANSLATION_PROVIDER_INFO[provider];
              const configured = isConfigured(provider);
              const isSelected = provider === selectedProvider;

              return (
                <li
                  key={provider}
                  className={`flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-white p-4 ${
                    isSelected ? "border-black" : "border-neutral-200"
                  }`}
                >
                  <div className="min-w-0 space-y-1">
                    <p className="font-medium text-black flex items-center gap-2">
                      {info.label}
                      {isSelected && <Badge>Em uso</Badge>}
                      {!configured && (
                        <Badge variant="outline">Chaves não configuradas</Badge>
                      )}
                    </p>
                    <p className="text-sm text-neutral-600">
                      {info.description}
                    </p>
                  </div>
                  {!isSelected && configured && (
                    <form action={setTranslationProvider}>
                      <input type="hidden" name="provider" value={provider} />
                      <Button
                        type="submit"
                        size="sm"
                        variant="outline"
                        className="cursor-pointer"
                      >
                        Usar este
                      </Button>
                    </form>
                  )}
                </li>
              );
            })}
          </ul>
        </section>

        {/* Team access */}
        <section className="space-y-4">
          <div className="space-y-1">
            <h2 className="text-lg font-medium text-black">Equipe</h2>
            <p className="text-sm text-neutral-600">
              Para incluir alguém, crie a conta no Supabase (Authentication →
              Users → Add user) e depois libere o acesso aqui.
            </p>
          </div>

          <ul className="divide-y divide-neutral-200 rounded-xl bg-white border border-neutral-200">
            {accounts.map((account) => {
              const isSelf = account.id === admin.userId;

              return (
                <li
                  key={account.id}
                  className="flex flex-wrap items-center justify-between gap-3 p-4"
                >
                  <div className="min-w-0 space-y-1">
                    <p className="text-sm text-black flex items-center gap-2">
                      <span className="truncate">{account.email}</span>
                      {account.role === "admin" && <Badge>Administrador</Badge>}
                      {account.role === "member" && (
                        <Badge variant="secondary">Equipe</Badge>
                      )}
                      {!account.role && (
                        <Badge variant="outline">Sem acesso</Badge>
                      )}
                    </p>
                    <p className="text-xs text-neutral-500">
                      {account.last_sign_in_at
                        ? `Último acesso: ${dateFormat.format(new Date(account.last_sign_in_at))}`
                        : "Nunca entrou"}
                    </p>
                  </div>

                  {isSelf ? (
                    <span className="text-xs text-neutral-400">Você</span>
                  ) : (
                    <div className="flex items-center gap-2">
                      {account.role ? (
                        <>
                          <MemberAction
                            userId={account.id}
                            change={
                              account.role === "admin"
                                ? "make-member"
                                : "make-admin"
                            }
                            label={
                              account.role === "admin"
                                ? "Tirar de administrador"
                                : "Tornar administrador"
                            }
                          />
                          <MemberAction
                            userId={account.id}
                            change="revoke"
                            label="Remover acesso"
                          />
                        </>
                      ) : (
                        <MemberAction
                          userId={account.id}
                          change="grant"
                          label="Liberar acesso"
                        />
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      </main>
    </div>
  );
}

function MemberAction({
  userId,
  change,
  label,
}: {
  userId: string;
  change: "grant" | "revoke" | "make-admin" | "make-member";
  label: string;
}) {
  return (
    <form action={changeTeamMember}>
      <input type="hidden" name="userId" value={userId} />
      <input type="hidden" name="change" value={change} />
      <Button
        type="submit"
        size="sm"
        variant={change === "revoke" ? "outline" : "secondary"}
        className="cursor-pointer"
      >
        {label}
      </Button>
    </form>
  );
}
