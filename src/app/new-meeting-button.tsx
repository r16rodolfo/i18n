"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Loader2, Plus } from "lucide-react";

import { Button } from "@/components/ui/button";

export function NewMeetingButton() {
  const router = useRouter();
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleCreate = async () => {
    setIsCreating(true);
    setError(null);
    try {
      const res = await fetch("/api/rooms", { method: "POST" });
      const data = await res.json();
      if (!res.ok)
        throw new Error(data.error || "Não foi possível criar a sala");
      router.push(`/${data.roomId}`);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Não foi possível criar a sala",
      );
      setIsCreating(false);
    }
  };

  return (
    <div className="space-y-2">
      <Button
        onClick={handleCreate}
        disabled={isCreating}
        className="bg-black text-white hover:bg-neutral-800 cursor-pointer"
      >
        {isCreating ? (
          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
        ) : (
          <Plus className="w-4 h-4 mr-2" />
        )}
        Nova reunião
      </Button>
      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  );
}
