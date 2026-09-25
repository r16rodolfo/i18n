"use client";

import { useState } from "react";

import { CircleDollarSign } from "lucide-react";

import {
  formatQuantity,
  formatUsd,
  USAGE_SERVICE_INFO,
} from "@/lib/usage-pricing";

import type { MeetingCost as MeetingCostData } from "./hooks/use-usage-meter";

// Team only: estimated cost of the meeting so far, top left of the call.
// Click to see it by service.
export function MeetingCost({ cost }: { cost: MeetingCostData | null }) {
  const [open, setOpen] = useState(false);
  if (!cost) return null;

  return (
    <div className="absolute left-6 top-6 z-40 max-w-[calc(100%-3rem)]">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        className="flex items-center gap-1.5 rounded-full bg-black/60 px-3 py-1 text-xs text-white/80 backdrop-blur hover:bg-black/80 hover:text-white cursor-pointer"
        title="Custo estimado desta reunião até agora (só a equipe vê)"
        aria-expanded={open}
      >
        <CircleDollarSign className="h-3.5 w-3.5" />
        {formatUsd(cost.totalUsd)}
      </button>
      {open && (
        <div className="mt-2 w-72 max-w-full rounded-xl border border-white/10 bg-neutral-950/95 p-3 text-xs text-white shadow-2xl">
          <p className="mb-2 text-white/60">
            Estimativa pelo preço de tabela, em dólar. Atualiza a cada minuto.
          </p>
          {cost.services.length === 0 ? (
            <p className="text-white/60">Nada medido ainda.</p>
          ) : (
            <ul className="space-y-1">
              {cost.services.map((item) => (
                <li key={item.service} className="flex justify-between gap-3">
                  <span className="min-w-0">
                    {USAGE_SERVICE_INFO[item.service]?.label ?? item.service}
                    <span className="block text-white/50">
                      {formatQuantity(item.service, item.quantity)}
                    </span>
                  </span>
                  <span className="shrink-0 tabular-nums">
                    {formatUsd(item.costUsd)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
