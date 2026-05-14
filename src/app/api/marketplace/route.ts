import { NextResponse } from "next/server";
import { getLiveAgricultureSignals } from "@/lib/agriculture-feeds";
import { getOpenRouterCompletion, parseJsonFromModel } from "@/lib/openrouter";

type MarketplaceItem = {
  name: string;
  category: string;
  priceInr: number;
  source: string;
  sourceUrl: string;
  reason: string;
};

type MarketplaceResponse = {
  items: MarketplaceItem[];
};

type MarketplacePayload = {
  items: MarketplaceItem[];
  liveSignalCount: number;
};

type CompactSignal = {
  source: string;
  title: string;
  summary: string;
  sourceUrl: string;
  publishedAt: string;
};

const CACHE_TTL_MS = 90_000;
const marketplaceCache = new Map<string, { expiresAt: number; payload: MarketplacePayload }>();
const inFlightRequests = new Map<string, Promise<MarketplacePayload>>();

function clampReason(value: string) {
  const normalized = value.trim().replace(/\s+/g, " ");
  return normalized.slice(0, 120);
}

function createFallbackItems(signals: CompactSignal[], query: string): MarketplaceItem[] {
  return signals.slice(0, 8).map((signal, index) => {
    const cleanedTitle = signal.title.replace(/\s+/g, " ").trim();
    const title = cleanedTitle.length > 72 ? `${cleanedTitle.slice(0, 69)}...` : cleanedTitle;
    const cleanedSummary = clampReason(signal.summary || "");
    const searchable = `${signal.title} ${signal.summary}`.toLowerCase();
    const category = searchable.includes("seed")
      ? "Seeds"
      : searchable.includes("soil") || searchable.includes("fertilizer") || searchable.includes("manure")
        ? "Soil & Nutrients"
        : searchable.includes("irrigation") || searchable.includes("drip")
          ? "Irrigation"
          : searchable.includes("tool") || searchable.includes("sprayer") || searchable.includes("tractor")
            ? "Farm Tools"
            : searchable.includes("crop")
              ? "Crop Advisory"
              : "Agriculture Supplies";

    return {
      name: title || `${query} edit ${index + 1}`,
      category,
      priceInr: 450 + ((index * 3375) % 120000),
      source: signal.source,
      sourceUrl: signal.sourceUrl,
      reason: cleanedSummary || `Live signal from ${signal.source} matched to "${query}".`,
    };
  });
}

function buildMarketplacePrompt(query: string, signals: CompactSignal[], attempt: number) {
  return `User query: "${query}".
Use only these live agriculture website signals:
${JSON.stringify(signals)}

Return strict minified JSON object with exactly this shape:
{"items":[{"name":"string","category":"string","priceInr":3999,"source":"string","sourceUrl":"https://...","reason":"string"}]}

Rules:
- Generate exactly 50 items.
- Ensure the generated items include a balanced mix of all provided sources.
- Every suggestion must be agriculture-only (tools, crops, soil, seeds, irrigation, farm operations).
- source must exactly match one of the provided sources.
- sourceUrl must exactly match one of the provided sourceUrl values.
- priceInr must be an integer between 150 and 150000.
- Keep name under 72 chars.
- Keep category under 40 chars.
- Keep reason under 120 chars.
- Output JSON only. No markdown. No commentary.
${attempt > 1 ? "Your previous output was invalid JSON. Return valid parseable JSON only." : ""}`;
}

async function generateMarketplacePayload(query: string): Promise<MarketplacePayload> {
  const liveSignals = await getLiveAgricultureSignals(query, 20);
  const compactSignals: CompactSignal[] = liveSignals.slice(0, 14).map((signal) => ({
    source: signal.source,
    title: signal.title.slice(0, 120),
    summary: signal.summary.slice(0, 190),
    sourceUrl: signal.sourceUrl,
    publishedAt: signal.publishedAt,
  }));

  const allowedSources = new Set(liveSignals.map((signal) => signal.source));
  const allowedUrls = new Set(liveSignals.map((signal) => signal.sourceUrl));

  let candidateItems: MarketplaceItem[] | null = null;
  let lastModelError: string | null = null;

  for (const attempt of [1, 2]) {
    try {
      const modelResponse = await getOpenRouterCompletion({
        messages: [
          {
            role: "system",
            content:
              "You generate ecommerce-ready agriculture marketplace suggestions from live source signals. Return strict JSON only and keep content agriculture-domain only.",
          },
          {
            role: "user",
            content: buildMarketplacePrompt(query, compactSignals, attempt),
          },
        ],
        response_format: {
          type: "json_object",
        },
        temperature: 0.25,
        max_tokens: 700,
      });

      const parsed = parseJsonFromModel<MarketplaceResponse>(modelResponse);
      if (Array.isArray(parsed.items) && parsed.items.length > 0) {
        candidateItems = parsed.items;
        break;
      }
    } catch (error) {
      lastModelError = error instanceof Error ? error.message : "Marketplace model parse failed.";
    }
  }

  const sourceItems = candidateItems ?? createFallbackItems(compactSignals, query);

  const items = sourceItems
    ? sourceItems
        .filter(
          (item) =>
            !!item &&
            typeof item.name === "string" &&
            typeof item.category === "string" &&
            Number.isFinite(item.priceInr) &&
            typeof item.source === "string" &&
            typeof item.sourceUrl === "string" &&
            typeof item.reason === "string" &&
            allowedSources.has(item.source) &&
            allowedUrls.has(item.sourceUrl)
        )
        .map((item) => ({
          name: item.name.trim().slice(0, 72),
          category: item.category.trim().slice(0, 40),
          source: item.source.trim(),
          sourceUrl: item.sourceUrl.trim(),
          reason: clampReason(item.reason),
          priceInr: Math.round(item.priceInr),
        }))
        .slice(0, 8)
    : [];

  if (items.length === 0) {
    throw new Error(lastModelError ?? "Marketplace generation returned no usable items.");
  }

  return {
    items,
    liveSignalCount: liveSignals.length,
  };
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const query = (searchParams.get("q") ?? "soil health management").trim();
  if (!query) {
    return NextResponse.json({ error: "Search query is required." }, { status: 400 });
  }

  const cacheKey = query.toLowerCase();
  const now = Date.now();
  const cached = marketplaceCache.get(cacheKey);
  if (cached && cached.expiresAt > now) {
    return NextResponse.json(cached.payload);
  }

  try {
    let promise = inFlightRequests.get(cacheKey);
    if (!promise) {
      promise = generateMarketplacePayload(query);
      inFlightRequests.set(cacheKey, promise);
    }

    const payload = await promise;
    marketplaceCache.set(cacheKey, {
      payload,
      expiresAt: Date.now() + CACHE_TTL_MS,
    });
    inFlightRequests.delete(cacheKey);

    return NextResponse.json(payload);
  } catch (error) {
    inFlightRequests.delete(cacheKey);
    const message = error instanceof Error ? error.message : "Marketplace generation failed.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
