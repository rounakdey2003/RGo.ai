import { NextResponse } from "next/server";
import { getOpenRouterCompletion } from "@/lib/openrouter";

type AnalyzeImageRequest = {
  imageDataUrl?: string;
  fileName?: string;
};

const MAX_IMAGE_BYTES = 4 * 1024 * 1024;

function estimateBase64Bytes(dataUrl: string) {
  const [, encoded = ""] = dataUrl.split(",", 2);
  return Math.floor((encoded.length * 3) / 4);
}

export async function POST(request: Request) {
  const body = (await request.json()) as AnalyzeImageRequest;
  const imageDataUrl = body.imageDataUrl?.trim();
  const fileName = body.fileName?.trim() || "uploaded image";

  if (!imageDataUrl || !imageDataUrl.startsWith("data:image/")) {
    return NextResponse.json({ error: "A valid image data URL is required." }, { status: 400 });
  }

  if (estimateBase64Bytes(imageDataUrl) > MAX_IMAGE_BYTES) {
    return NextResponse.json(
      { error: "Image is too large. Upload an image up to 4MB." },
      { status: 400 }
    );
  }

  try {
    const analysis = await getOpenRouterCompletion({
      messages: [
        {
          role: "system",
          content:
            "You are an agriculture and agronomy vision assistant. Analyze farm-related images and respond with practical agriculture insights only. Keep response under 180 words.",
        },
        {
          role: "user",
          content: [
            {
              type: "text",
              text: `Analyze this agriculture image (${fileName}). Include: probable crop or plant stage, visible soil condition cues, possible pest/disease risk signs, farm tool observations, and 3 actionable improvements.`,
            },
            {
              type: "image_url",
              image_url: {
                url: imageDataUrl,
              },
            },
          ],
        },
      ],
      temperature: 0.35,
      max_tokens: 300,
    });

    return NextResponse.json({ analysis });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Image analysis failed.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
