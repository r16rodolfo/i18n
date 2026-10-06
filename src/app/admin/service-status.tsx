"use client";

import { useCallback, useEffect, useState } from "react";

import { CheckCircle2, Loader2, MinusCircle, XCircle } from "lucide-react";

import type { ServiceCheck } from "@/lib/service-health";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

interface HealthResult {
  checks: ServiceCheck[];
  inUse: string[];
  checkedAt: string;
}

const timeFormat = new Intl.DateTimeFormat("pt-BR", {
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  timeZone: "America/Sao_Paulo",
});

// Status of every outside service, tested when the page opens and on demand
export function ServiceStatus() {
  const [result, setResult] = useState<HealthResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);

  const run = useCallback(async () => {
    setLoading(true);
    setFailed(false);
    try {
      const res = await fetch("/api/admin/health", { method: "POST" });
      if (!res.ok) throw new Error(String(res.status));
      setResult(await res.json());
    } catch {
      setFailed(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    run();
  }, [run]);

  const problems =
    result?.checks.filter(
      (check) => check.status === "error" && result.inUse.includes(check.id),
    ).length ?? 0;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-neutral-600">
          {loading
            ? "Testando os serviços..."
            : failed
              ? "Não foi possível testar agora."
              : result
                ? problems > 0
                  ? `${problems} serviço(s) em uso com problema.`
                  : `Tudo que as reuniões usam está funcionando (testado às ${timeFormat.format(new Date(result.checkedAt))}).`
                : null}
        </p>
        <Button
          size="sm"
          variant="outline"
          onClick={run}
          disabled={loading}
          className="cursor-pointer"
        >
          {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Testar agora
        </Button>
      </div>

      {result && (
        <ul className="divide-y divide-neutral-200 rounded-xl border border-neutral-200 bg-white">
          {result.checks.map((check) => {
            const inUse = result.inUse.includes(check.id);
            return (
              <li key={check.id} className="flex items-start gap-3 p-3">
                {check.status === "ok" ? (
                  <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
                ) : check.status === "error" ? (
                  <XCircle className="mt-0.5 h-5 w-5 shrink-0 text-red-600" />
                ) : (
                  <MinusCircle className="mt-0.5 h-5 w-5 shrink-0 text-neutral-400" />
                )}
                <div className="min-w-0 flex-1 space-y-0.5">
                  <p className="flex flex-wrap items-center gap-2 text-sm text-black">
                    {check.label}
                    {inUse && <Badge>Em uso</Badge>}
                  </p>
                  <p className="text-xs text-neutral-500">{check.purpose}</p>
                  {check.status === "no-key" && (
                    <p className="text-xs text-neutral-500">
                      Chave não configurada
                    </p>
                  )}
                  {check.detail && (
                    <p
                      className={`break-words text-xs ${
                        check.status === "error"
                          ? "text-red-700"
                          : "text-neutral-500"
                      }`}
                    >
                      {check.detail}
                    </p>
                  )}
                </div>
                {check.status !== "no-key" && (
                  <span className="shrink-0 text-xs tabular-nums text-neutral-400">
                    {check.ms} ms
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
