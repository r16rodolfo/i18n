"use client";

import { useState } from "react";
import { Check, Copy, X } from "lucide-react";

interface ShareModalProps {
  // Guest link, e.g. /abc123?convite=... (team members only see this modal)
  invitePath: string;
  onClose: () => void;
}

export function ShareModal({ invitePath, onClose }: ShareModalProps) {
  const [copied, setCopied] = useState(false);
  const meetingUrl = `${typeof window !== "undefined" ? window.location.origin : ""}${invitePath}`;

  const handleCopy = async () => {
    await navigator.clipboard.writeText(meetingUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 p-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-semibold text-black">
            Sua reunião está pronta
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar"
            className="p-1 text-neutral-500 hover:text-black hover:bg-neutral-100 rounded-lg transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="space-y-4">
          <p className="text-sm text-neutral-600">
            Envie este link para o cliente entrar na reunião
          </p>

          {/* Link box */}
          <div className="flex items-center gap-2 p-3 bg-neutral-100 rounded-lg">
            <span className="flex-1 text-sm text-neutral-800 truncate font-mono">
              {meetingUrl}
            </span>
            <button
              type="button"
              onClick={handleCopy}
              className="p-2 hover:bg-neutral-200 rounded-lg transition-colors cursor-pointer shrink-0"
              title={copied ? "Copiado!" : "Copiar link"}
            >
              {copied ? (
                <Check className="w-5 h-5 text-green-600" />
              ) : (
                <Copy className="w-5 h-5 text-neutral-600" />
              )}
            </button>
          </div>

          {/* Info text */}
          <p className="text-xs text-neutral-500">
            Quem tiver este link consegue entrar até a reunião expirar (2 horas
            depois de criada). Envie só para os participantes.
          </p>
        </div>

        {/* Toast feedback */}
        {copied && (
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 px-4 py-2 bg-neutral-900 text-white text-sm rounded-lg">
            Link copiado
          </div>
        )}
      </div>
    </div>
  );
}
