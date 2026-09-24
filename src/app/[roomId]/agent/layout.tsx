import { requireTeamMember } from "@/lib/auth";

// The meeting assistant is for the R16 team only
export default async function AgentLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireTeamMember();
  return children;
}
