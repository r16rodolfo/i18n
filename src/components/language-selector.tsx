"use client";

import { ChevronDown } from "lucide-react";

import { type LanguageCode, SUPPORTED_LANGUAGES } from "@/lib/languages";
import { languageName, type UiLang, uiText } from "@/lib/ui-text";

import { LanguageFlag } from "@/components/flag";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface LanguageSelectorProps {
  value: LanguageCode;
  onChange: (value: LanguageCode) => void;
  disabled?: boolean;
  uiLang: UiLang;
}

export function LanguageSelector({
  value,
  onChange,
  disabled,
  uiLang,
}: LanguageSelectorProps) {
  const selectedLang = SUPPORTED_LANGUAGES.find((l) => l.code === value);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          className="w-full justify-between cursor-pointer"
          disabled={disabled}
        >
          <span className="flex items-center gap-2">
            {selectedLang && <LanguageFlag code={selectedLang.code} />}
            <span>
              {selectedLang
                ? languageName(selectedLang.code, uiLang)
                : uiText(uiLang).selectLanguage}
            </span>
          </span>
          <ChevronDown className="h-4 w-4 opacity-50" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-[200px]">
        {SUPPORTED_LANGUAGES.map((lang) => (
          <DropdownMenuItem
            key={lang.code}
            onClick={() => onChange(lang.code as LanguageCode)}
            className="flex items-center gap-2 cursor-pointer"
          >
            <LanguageFlag code={lang.code} />
            <span>{languageName(lang.code, uiLang)}</span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
