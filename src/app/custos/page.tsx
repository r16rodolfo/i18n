import Link from "next/link";

import { ChevronLeft, ChevronRight } from "lucide-react";

import { requireTeamMember } from "@/lib/auth";
import { currentMonth, getMonthRooms, getMonthUsage } from "@/lib/usage";
import {
  DAILY_FREE_MINUTES,
  formatQuantity,
  formatUsd,
  USAGE_SERVICE_INFO,
  USAGE_SERVICES,
} from "@/lib/usage-pricing";

import { TeamHeader } from "@/components/team-header";

export const metadata = { title: "Custos · R16 Meet" };

const dateTimeFormat = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "America/Sao_Paulo",
});

const monthFormat = new Intl.DateTimeFormat("pt-BR", {
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});

function shiftMonth(month: string, delta: number) {
  const [year, index] = month.split("-").map(Number);
  const date = new Date(Date.UTC(year, index - 1 + delta, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

function monthLabel(month: string) {
  const [year, index] = month.split("-").map(Number);
  return monthFormat.format(new Date(Date.UTC(year, index - 1, 1)));
}

export default async function CostsPage({
  searchParams,
}: {
  searchParams: Promise<{ mes?: string }>;
}) {
  const member = await requireTeamMember();
  const { mes } = await searchParams;
  const thisMonth = currentMonth();
  const month = mes && /^\d{4}-(0[1-9]|1[0-2])$/.test(mes) ? mes : thisMonth;

  const [usage, meetings] = await Promise.all([
    getMonthUsage(month),
    getMonthRooms(month),
  ]);
  const services = [...usage.services].sort(
    (a, b) =>
      USAGE_SERVICES.indexOf(a.service) - USAGE_SERVICES.indexOf(b.service),
  );
  const videoMinutes =
    (usage.services.find((s) => s.service === "video")?.quantity ?? 0) / 60;

  return (
    <div className="min-h-screen bg-neutral-100">
      <TeamHeader member={member} />

      <main className="max-w-3xl mx-auto px-4 py-10 space-y-10">
        <section className="space-y-4">
          <div className="space-y-1">
            <h1 className="text-3xl font-light tracking-tight text-black">
              Custos
            </h1>
            <p className="text-neutral-600">
              Quanto as reuniões gastaram de cada serviço. São estimativas pelo
              preço de tabela, em dólar: a fatura de cada serviço pode variar um
              pouco.
            </p>
          </div>

          <nav className="flex items-center gap-2">
            <Link
              href={`/custos?mes=${shiftMonth(month, -1)}`}
              className="rounded-lg p-1.5 text-neutral-600 hover:bg-white hover:text-black"
              aria-label="Mês anterior"
            >
              <ChevronLeft className="h-5 w-5" />
            </Link>
            <span className="min-w-40 text-center font-medium capitalize text-black">
              {monthLabel(month)}
            </span>
            {month < thisMonth ? (
              <Link
                href={`/custos?mes=${shiftMonth(month, 1)}`}
                className="rounded-lg p-1.5 text-neutral-600 hover:bg-white hover:text-black"
                aria-label="Próximo mês"
              >
                <ChevronRight className="h-5 w-5" />
              </Link>
            ) : (
              <span className="w-8" />
            )}
          </nav>
        </section>

        {/* Month total */}
        <section className="space-y-3">
          <h2 className="text-sm font-medium tracking-widest uppercase text-neutral-500">
            Total do mês
          </h2>
          <div className="rounded-xl bg-white border border-neutral-200">
            <p className="p-4 text-3xl font-light text-black tabular-nums">
              {formatUsd(usage.totalUsd)}
            </p>
            {services.length > 0 && (
              <ul className="divide-y divide-neutral-200 border-t border-neutral-200">
                {services.map((item) => (
                  <li
                    key={item.service}
                    className="flex items-center justify-between gap-3 px-4 py-3 text-sm"
                  >
                    <span className="min-w-0">
                      <span className="text-black">
                        {USAGE_SERVICE_INFO[item.service]?.label ??
                          item.service}
                      </span>
                      <span className="block text-xs text-neutral-500">
                        {formatQuantity(item.service, item.quantity)}
                      </span>
                    </span>
                    <span className="shrink-0 tabular-nums text-black">
                      {item.service === "palabra"
                        ? "sem preço cadastrado"
                        : formatUsd(item.costUsd)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <p className="text-xs text-neutral-500">
            Vídeo: o Daily só cobra depois de{" "}
            {DAILY_FREE_MINUTES.toLocaleString("pt-BR")} minutos no mês (somando
            todas as pessoas de cada chamada), e os valores acima já descontam
            isso. Neste mês foram{" "}
            {Math.round(videoMinutes).toLocaleString("pt-BR")} minutos
            {videoMinutes <= DAILY_FREE_MINUTES
              ? ", então o vídeo ainda está saindo de graça."
              : "."}
          </p>
        </section>

        {/* Meetings */}
        <section className="space-y-3">
          <h2 className="text-sm font-medium tracking-widest uppercase text-neutral-500">
            Reuniões
          </h2>
          {meetings.length === 0 ? (
            <p className="text-sm text-neutral-500">
              Nenhum uso medido neste mês.
            </p>
          ) : (
            <ul className="divide-y divide-neutral-200 rounded-xl bg-white border border-neutral-200">
              {meetings.map((meeting) => (
                <li
                  key={`${meeting.roomName}|${meeting.roomId ?? ""}`}
                  className="space-y-2 p-4"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-mono text-sm text-black">
                        {meeting.roomName}
                      </p>
                      <p className="text-xs text-neutral-500">
                        {dateTimeFormat.format(meeting.firstUse)}
                        {!meeting.roomId && " · sala apagada"}
                      </p>
                    </div>
                    <p className="shrink-0 font-medium tabular-nums text-black">
                      {formatUsd(meeting.totalUsd)}
                    </p>
                  </div>
                  <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-neutral-600">
                    {USAGE_SERVICES.map((service) => {
                      const item = meeting.services[service];
                      if (!item) return null;
                      return (
                        <li key={service}>
                          {USAGE_SERVICE_INFO[service].label}:{" "}
                          {formatQuantity(service, item.quantity)}
                          {service !== "palabra" &&
                            ` · ${formatUsd(item.costUsd)}`}
                        </li>
                      );
                    })}
                  </ul>
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>
    </div>
  );
}
