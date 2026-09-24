"use client";

import { useState } from "react";

import { Check, Copy } from "lucide-react";

import { Button } from "@/components/ui/button";

export function CopyInviteButton({ invitePath }: { invitePath: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(
      `${window.location.origin}${invitePath}`,
    );
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={handleCopy}
      className="cursor-pointer"
    >
      {copied ? (
        <Check className="w-4 h-4 mr-1 text-green-600" />
      ) : (
        <Copy className="w-4 h-4 mr-1" />
      )}
      {copied ? "Copiado" : "Copiar convite"}
    </Button>
  );
}
