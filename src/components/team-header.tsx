import Link from "next/link";

import type { CurrentMember } from "@/lib/auth";

import { signOut } from "@/app/entrar/actions";

// Top bar for the team-only screens (dashboard and admin panel)
export function TeamHeader({ member }: { member: CurrentMember }) {
  return (
    <header className="border-b border-neutral-200 bg-white">
      <div className="max-w-3xl mx-auto px-4 h-14 flex items-center justify-between gap-4">
        <Link href="/" className="font-medium text-black">
          R16 Meet
        </Link>
        <nav className="flex items-center gap-4 text-sm">
          {member.role === "admin" && (
            <Link href="/admin" className="text-neutral-600 hover:text-black">
              Administração
            </Link>
          )}
          <span className="hidden sm:inline text-neutral-400 truncate max-w-48">
            {member.email}
          </span>
          <form action={signOut}>
            <button
              type="submit"
              className="text-neutral-600 hover:text-black cursor-pointer"
            >
              Sair
            </button>
          </form>
        </nav>
      </div>
    </header>
  );
}
