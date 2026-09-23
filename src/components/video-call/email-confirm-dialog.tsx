"use client";

import { useEffect, useState } from "react";

import { Loader2, Mail, Send, X } from "lucide-react";

import type { EmailAction } from "@/lib/agent-schemas";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

interface EmailConfirmDialogProps {
  action: EmailAction | null;
  roomId: string;
  meetingSummary?: string;
  onConfirm: () => void;
  onDismiss: () => void;
}

export function EmailConfirmDialog({
  action,
  roomId,
  meetingSummary = "",
  onConfirm,
  onDismiss,
}: EmailConfirmDialogProps) {
  const [isExecuting, setIsExecuting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [recipientsInput, setRecipientsInput] = useState("");

  // Recipients are never filled in automatically: the user types or
  // confirms them for every email.
  useEffect(() => {
    setRecipientsInput(action?.metadata.recipients?.join(", ") ?? "");
    setError(null);
  }, [action]);

  if (!action) return null;

  const recipients = recipientsInput
    .split(/[,;\s]+/)
    .map((r) => r.trim())
    .filter(Boolean);

  const handleConfirm = async () => {
    setIsExecuting(true);
    setError(null);

    try {
      const response = await fetch(`/api/agent/${roomId}/actions/execute`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: {
            ...action,
            metadata: { ...action.metadata, recipients },
          },
          meetingSummary,
        }),
      });

      const result = await response.json();

      if (result.success) {
        onConfirm();
      } else {
        setError(result.error || "Failed to send email");
      }
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setIsExecuting(false);
    }
  };

  return (
    <Dialog open={!!action} onOpenChange={(open) => !open && onDismiss()}>
      <DialogContent
        className="bg-neutral-900 border-white/10 text-white sm:max-w-lg"
        showCloseButton={false}
      >
        <DialogHeader>
          <div className="flex items-center gap-2">
            <div className="p-2 bg-blue-500/20 rounded-lg">
              <Mail className="w-5 h-5 text-blue-400" />
            </div>
            <div>
              <DialogTitle className="text-white">
                Email Detected
              </DialogTitle>
              <DialogDescription className="text-white/60">
                Would you like to send this email?
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Recipients */}
          <div className="space-y-1">
            <span className="text-xs text-white/50 uppercase tracking-wide">
              To
            </span>
            <Input
              type="text"
              placeholder="email@exemplo.com, outro@exemplo.com"
              value={recipientsInput}
              onChange={(e) => setRecipientsInput(e.target.value)}
              disabled={isExecuting}
              className="bg-white/5 border-white/10 text-white placeholder:text-white/30"
            />
          </div>

          {/* Subject */}
          <div className="space-y-1">
            <span className="text-xs text-white/50 uppercase tracking-wide">
              Subject
            </span>
            <p className="text-sm font-medium text-white">
              {action.metadata.subject}
            </p>
          </div>

          {/* Email Body */}
          <div className="space-y-1">
            <span className="text-xs text-white/50 uppercase tracking-wide">
              Message
            </span>
            <div className="bg-white/5 border border-white/10 rounded-lg p-3 max-h-40 overflow-y-auto">
              <p className="text-sm text-white/80 whitespace-pre-wrap">
                {action.metadata.emailBody}
              </p>
            </div>
          </div>

          {/* Error message */}
          {error && (
            <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-3">
              <p className="text-sm text-red-400">{error}</p>
            </div>
          )}
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          <Button
            variant="ghost"
            onClick={onDismiss}
            disabled={isExecuting}
            className="text-white/70 hover:text-white hover:bg-white/10"
          >
            <X className="w-4 h-4 mr-1" />
            Dismiss
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={isExecuting || recipients.length === 0}
            className="bg-blue-500 hover:bg-blue-600 text-white"
          >
            {isExecuting ? (
              <>
                <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                Sending...
              </>
            ) : (
              <>
                <Send className="w-4 h-4 mr-1" />
                Send Email
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
