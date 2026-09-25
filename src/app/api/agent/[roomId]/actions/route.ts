import { after } from "next/server";

import { generateObject } from "ai";
import { z } from "zod";

import { ActionsRequestSchema } from "@/lib/agent-schemas";
import { chatModel, recordAssistantUsage } from "@/lib/ai";
import { getTeamMember, unauthorized } from "@/lib/auth";

const ActionItemSchema = z.object({
  actions: z.array(
    z.object({
      id: z.string(),
      type: z.enum(["email", "task", "followup"]),
      title: z.string(),
      description: z.string(),
      assignee: z.string(),
      dueDate: z.string(),
      priority: z.enum(["high", "medium", "low"]),
      metadata: z.object({
        recipients: z.array(z.string()),
        subject: z.string(),
        emailBody: z.string(),
      }),
    }),
  ),
  summary: z.string(),
});

export async function POST(
  req: Request,
  { params }: { params: Promise<{ roomId: string }> },
) {
  // Team only: these routes spend OpenAI credits and can send e-mail
  if (!(await getTeamMember())) return unauthorized();

  try {
    const { roomId } = await params;
    const body = await req.json();

    // Validate request body
    const validatedRequest = ActionsRequestSchema.parse(body);
    const { transcripts: clientTranscripts } = validatedRequest;

    // Build transcript context from client-provided transcripts
    const transcriptContext = clientTranscripts
      .map((t) => {
        const time = new Date(t.timestamp).toLocaleTimeString();
        return `[${time}] ${t.speaker}: ${t.original}`;
      })
      .join("\n");

    const result = await generateObject({
      model: chatModel,
      schema: ActionItemSchema,
      prompt: `Analyze this meeting transcript and extract action items.

TRANSCRIPT:
${transcriptContext || "No transcript available"}

Extract:
1. Tasks mentioned (who needs to do what, by when)
2. Follow-up meetings needed
3. Emails to be sent (summaries, updates to stakeholders)

For each action, generate a unique ID (use format: action_1, action_2, etc).
For email actions, only list recipient email addresses that were explicitly said in the transcript; otherwise leave recipients empty (the user fills them in before sending). Include suggested subject and brief body in metadata.
Provide a brief meeting summary (2-3 sentences).

Prioritize actions based on urgency mentioned in the conversation.`,
      temperature: 0.3,
    });

    after(() => recordAssistantUsage(roomId, result.usage));

    return Response.json(result.object);
  } catch (error) {
    console.error("Action extraction error:", error);
    return Response.json(
      { error: "Failed to extract actions" },
      { status: 500 },
    );
  }
}
