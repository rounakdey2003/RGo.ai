import { NextResponse } from "next/server";
import { getOpenRouterCompletion, type OpenRouterMessage } from "@/lib/openrouter";

type ChatHistoryMessage = {
  role: "user" | "assistant";
  content: string;
};

type ChatRequest = {
  message?: string;
  history?: ChatHistoryMessage[];
};

export async function POST(request: Request) {
  const body = (await request.json()) as ChatRequest;
  const message = body.message?.trim();
  if (!message) {
    return NextResponse.json({ error: "Message is required." }, { status: 400 });
  }

  const history = Array.isArray(body.history)
    ? body.history
        .filter((entry) => (entry.role === "user" || entry.role === "assistant") && !!entry.content?.trim())
        .slice(-8)
    : [];

  const messages: OpenRouterMessage[] = [
    {
      role: "system",
      content:
        "You are RGo.ai Agronomy Assistant, a realtime agriculture expert. Only answer agriculture topics such as crops, soil, seeds, irrigation, pests, tools, farm operations, and yield improvement. If a user asks non-agriculture questions, briefly state your scope and ask for agriculture details.",
    },
    ...history,
    { role: "user", content: message },
  ];

  try {
    const reply = await getOpenRouterCompletion({
      messages,
      temperature: 0.55,
      max_tokens: 420,
    });

    return NextResponse.json({ reply });
  } catch (error) {
    const messageText = error instanceof Error ? error.message : "Chat generation failed.";
    return NextResponse.json({ error: messageText }, { status: 500 });
  }
}
