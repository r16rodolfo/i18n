import {
  BR,
  CN,
  DE,
  ES,
  FR,
  IT,
  JP,
  KR,
  SA,
  US,
} from "country-flag-icons/react/3x2";

import { cn } from "@/lib/utils";

// The flag of each language, drawn (flag emojis show up as letters, like
// "BR", on Windows).
const FLAGS = {
  pt: BR,
  es: ES,
  en: US,
  fr: FR,
  de: DE,
  it: IT,
  ja: JP,
  ko: KR,
  zh: CN,
  ar: SA,
} as const;

export function LanguageFlag({
  code,
  className,
}: {
  code: string;
  className?: string;
}) {
  const Flag = FLAGS[code as keyof typeof FLAGS];
  if (!Flag) return null;
  return (
    <Flag
      aria-hidden
      className={cn(
        "inline-block h-3.5 w-auto shrink-0 rounded-[2px] shadow-[0_0_0_1px_rgba(0,0,0,0.08)]",
        className,
      )}
    />
  );
}
