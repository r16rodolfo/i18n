import {
  convertToModelMessages,
  streamText,
  stepCountIs,
  type UIMessage,
} from "ai";

import { ChatRequestSchema } from "@/lib/agent-schemas";
import { chatModel, recordAssistantUsage } from "@/lib/ai";
import { webSearchTool } from "@/tools/web-search";
import { getTeamMember, unauthorized } from "@/lib/auth";

export const maxDuration = 30;

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
    let validatedRequest;
    try {
      validatedRequest = ChatRequestSchema.parse(body);
    } catch (validationError) {
      console.error("Validation error:", validationError);
      return Response.json(
        { error: "Invalid request format" },
        { status: 400 },
      );
    }

    const { transcripts: clientTranscripts, messages } = validatedRequest;

    if (!messages || !Array.isArray(messages)) {
      console.error("Messages not found or not an array:", messages);
      return Response.json(
        { error: "Messages array is required" },
        { status: 400 },
      );
    }

    // Convert simple messages to UIMessage format for convertToModelMessages
    const formattedMessages = messages.map((msg: any, idx: number) => ({
      id: `msg-${idx}`,
      role: msg.role,
      content: msg.content,
      parts: [{ type: "text" as const, text: msg.content }],
    }));

    // Build transcript context from client-provided transcripts
    const transcriptContext = clientTranscripts
      .map((t) => {
        const time = new Date(t.timestamp).toLocaleTimeString();
        return `[${time}] ${t.speaker}: ${t.original}`;
      })
      .join("\n");

    const systemPrompt = `You are a helpful meeting assistant for an internationalized video call platform.
You have access to the complete transcript of a meeting room and a web search tool. Your job is to:
- Answer questions about what was discussed in the meeting
- Tell what specific participants said
- Extract action items and tasks mentioned
- Summarize decisions that were made
- Search the web for additional context when needed

Here is the complete meeting transcript:
---
${transcriptContext || "No transcript available yet for this meeting."}
---

Guidelines:
- For questions about the meeting, use ONLY the transcript above
- If the user asks about external topics, current events, or needs additional information not in the transcript, use the webSearch tool
- If something wasn't discussed in the meeting, say so and offer to search the web if relevant
- Be concise and helpful
- Respond in the same language the user asks the question`;

    const result = streamText({
      model: chatModel,
      system: systemPrompt,
      messages: await convertToModelMessages(formattedMessages),
      tools: {
        webSearch: webSearchTool,
      },
      stopWhen: stepCountIs(5),
      temperature: 0.3,
      onFinish: ({ totalUsage, steps }) =>
        recordAssistantUsage(
          roomId,
          totalUsage,
          steps
            .flatMap((step) => step.toolCalls)
            .filter((call) => call.toolName === "webSearch").length,
        ),
    });

    return result.toUIMessageStreamResponse();
  } catch (error) {
    console.error("Agent error:", error);
    return Response.json({ error: "Agent failed" }, { status: 500 });
  }
}
