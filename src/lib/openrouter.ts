const OPENROUTER_API_URL = "https://openrouter.ai/api/v1/chat/completions";

type OpenRouterRole = "system" | "user" | "assistant";

type TextContentPart = {
  type: "text";
  text: string;
};

type ImageContentPart = {
  type: "image_url";
  image_url: {
    url: string;
  };
};

export type OpenRouterMessage = {
  role: OpenRouterRole;
  content: string | Array<TextContentPart | ImageContentPart>;
};

type OpenRouterRequest = {
  messages: OpenRouterMessage[];
  model?: string;
  temperature?: number;
  max_tokens?: number;
  response_format?: Record<string, unknown>;
};

type OpenRouterResponse = {
  error?: {
    message?: string;
  };
  choices?: Array<{
    message?: {
      content?: string | Array<{ type?: string; text?: string }>;
    };
  }>;
};

function getApiKey() {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    throw new Error("OPENROUTER_API_KEY is not configured.");
  }
  return apiKey;
}

function extractContent(response: OpenRouterResponse) {
  const content = response.choices?.[0]?.message?.content;
  if (typeof content === "string") {
    return content.trim();
  }

  if (Array.isArray(content)) {
    const combined = content
      .filter((part) => part.type === "text")
      .map((part) => part.text ?? "")
      .join("")
      .trim();
    if (combined) {
      return combined;
    }
  }

  throw new Error("OpenRouter returned an empty completion.");
}

export async function getOpenRouterCompletion(request: OpenRouterRequest) {
  const apiKey = getApiKey();
  const model = request.model ?? process.env.OPENROUTER_MODEL ?? "openai/gpt-4.1-mini";

  const response = await fetch(OPENROUTER_API_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": process.env.RGO_APP_URL ?? "http://localhost:3000",
      "X-Title": "RGo.ai",
    },
    body: JSON.stringify({
      ...request,
      model,
    }),
    cache: "no-store",
  });

  const payload = (await response.json()) as OpenRouterResponse;
  if (!response.ok) {
    const message = payload.error?.message ?? "Unknown OpenRouter error.";
    throw new Error(`OpenRouter request failed (${response.status}): ${message}`);
  }

  return extractContent(payload);
}

export function parseJsonFromModel<T>(rawText: string): T {
  const candidates: string[] = [];
  const trimmed = rawText.trim();
  candidates.push(trimmed);

  const fencedMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fencedMatch?.[1]) {
    candidates.push(fencedMatch[1].trim());
  }

  const firstArray = trimmed.indexOf("[");
  const lastArray = trimmed.lastIndexOf("]");
  if (firstArray !== -1 && lastArray !== -1 && lastArray > firstArray) {
    candidates.push(trimmed.slice(firstArray, lastArray + 1));
  }

  const firstObject = trimmed.indexOf("{");
  const lastObject = trimmed.lastIndexOf("}");
  if (firstObject !== -1 && lastObject !== -1 && lastObject > firstObject) {
    candidates.push(trimmed.slice(firstObject, lastObject + 1));
  }

  for (const candidate of candidates) {
    try {
      return JSON.parse(candidate) as T;
    } catch {
      continue;
    }
  }

  throw new Error(`Model did not return valid JSON. Response: ${trimmed.slice(0, 280)}`);
}
