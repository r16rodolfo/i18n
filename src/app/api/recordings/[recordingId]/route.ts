import { getTeamMember } from "@/lib/auth";
import { recordingDownloadLink } from "@/lib/daily-recordings";

// Team only: download a cloud recording (redirects to a short-lived link
// from Daily)
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ recordingId: string }> },
) {
  if (!(await getTeamMember())) {
    return Response.json({ error: "Não autorizado" }, { status: 401 });
  }
  const { recordingId } = await params;
  try {
    const link = await recordingDownloadLink(recordingId);
    if (!link) {
      return Response.json(
        { error: "Gravação ainda não está pronta" },
        { status: 404 },
      );
    }
    return Response.redirect(link, 302);
  } catch (error) {
    console.error("[recording] download link failed:", error);
    return Response.json({ error: "Gravação não encontrada" }, { status: 404 });
  }
}
