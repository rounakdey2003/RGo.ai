import { NextResponse } from "next/server";
import { getOpenRouterCompletion, parseJsonFromModel } from "@/lib/openrouter";

type ConditionRequest = {
  condition?: string;
  imageContext?: string;
};

type ConditionRecommendation = {
  title: string;
  steps: string[];
  expectedOutcome: string;
};

type ConditionResponse = {
  recommendations: ConditionRecommendation[];
};

export async function POST(request: Request) {
  const body = (await request.json()) as ConditionRequest;
  const condition = body.condition?.trim();
  if (!condition) {
    return NextResponse.json({ error: "Condition is required." }, { status: 400 });
  }

  try {
    const modelResponse = await getOpenRouterCompletion({
      messages: [
        {
          role: "system",
          content:
            "You are a realtime agriculture recommendation engine. Return strictly valid JSON for agriculture condition recommendations only.",
        },
        {
          role: "user",
          content: `Generate exactly 3 agriculture recommendations for this farm condition: "${condition}".
${
  body.imageContext?.trim()
    ? `Use this image analysis context: "${body.imageContext.trim()}".`
    : "No image context provided."
}
Respond as strict JSON object:
{
  "recommendations": [
    {
      "title": "string",
      "steps": ["string", "string", "string"],
      "expectedOutcome": "string"
    }
  ]
}
Rules:
- Agriculture-only advice.
- Steps must be practical and measurable.
- No markdown.`,
        },
      ],
      response_format: {
        type: "json_object",
      },
      temperature: 0.4,
      max_tokens: 520,
    });

    const parsed = parseJsonFromModel<ConditionResponse>(modelResponse);
    const recommendations = Array.isArray(parsed.recommendations)
      ? parsed.recommendations
          .filter(
            (item) =>
              !!item &&
              typeof item.title === "string" &&
              Array.isArray(item.steps) &&
              item.steps.length > 0 &&
              item.steps.every((step) => typeof step === "string" && step.trim().length > 0) &&
              typeof item.expectedOutcome === "string"
          )
          .slice(0, 3)
      : [];

    if (recommendations.length === 0) {
      throw new Error("Condition recommendations were empty.");
    }

    return NextResponse.json({ recommendations });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Condition generation failed.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
