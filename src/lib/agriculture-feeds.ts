export type AgricultureSignal = {
  source: string;
  title: string;
  summary: string;
  sourceUrl: string;
  publishedAt: string;
  imageUrl?: string;
};

type SourceConfig = {
  source: string;
  baseUrl: string;
  buildUrl: (query: string) => string;
};

const REQUESTED_AGRICULTURE_SOURCES = [
  "IndiaMART Agriculture",
  "AgriBegri",
  "AgroStar",
  "Agriculture.com",
] as const;

const ACTIVE_SOURCES: SourceConfig[] = [
  {
    source: "IndiaMART Agriculture",
    baseUrl: "https://dir.indiamart.com",
    buildUrl: (query) => `https://dir.indiamart.com/search.mp?ss=${encodeURIComponent(query)}`,
  },
  {
    source: "AgriBegri",
    baseUrl: "https://www.agribegri.com",
    buildUrl: (query) => `https://www.agribegri.com/search?search=${encodeURIComponent(query)}`,
  },
  {
    source: "AgroStar",
    baseUrl: "https://www.agrostar.in",
    buildUrl: (query) => `https://www.agrostar.in/search?q=${encodeURIComponent(query)}`,
  },
  {
    source: "Agriculture.com",
    baseUrl: "https://www.agriculture.com",
    buildUrl: (query) => `https://www.agriculture.com/search?searchTerm=${encodeURIComponent(query)}`,
  },
];

const AGRICULTURE_KEYWORDS =
  /(agri|agriculture|farm|farming|crop|soil|seed|fertilizer|irrigation|tractor|sprayer|pesticide|compost|manure|harvest|nursery|plant|drip|greenhouse|disease|pest)/i;

function decodeEntities(value: string) {
  return value
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ");
}

function stripHtml(value: string) {
  return decodeEntities(value).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function normalizeQuery(query: string) {
  const cleaned = query.trim().toLowerCase().replace(/[^a-z0-9\s-]/g, " ");
  return cleaned.replace(/\s+/g, " ").trim() || "soil health";
}

function parseAnchorSignals(
  html: string,
  source: string,
  baseUrl: string,
  query: string
): AgricultureSignal[] {
  const anchorExpression = /<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  const now = new Date().toISOString();
  const seen = new Set<string>();
  const signals: AgricultureSignal[] = [];

  while (signals.length < 50) {
    const match = anchorExpression.exec(html);
    if (!match) {
      break;
    }

    const href = decodeEntities(match[1]).trim();
    const label = stripHtml(match[2]).slice(0, 120);
    if (!href || !label || label.length < 10 || label.length > 120) {
      continue;
    }

    if (!AGRICULTURE_KEYWORDS.test(`${href} ${label}`)) {
      continue;
    }

    let sourceUrl: string;
    try {
      sourceUrl = new URL(href, baseUrl).toString();
    } catch {
      continue;
    }

    if (seen.has(sourceUrl)) {
      continue;
    }
    seen.add(sourceUrl);

    signals.push({
      source,
      title: label,
      summary: `${source} listing or article matched for "${query}".`,
      sourceUrl,
      publishedAt: now,
    });
  }

  return signals;
}

function fallbackSourceUrl(source: (typeof REQUESTED_AGRICULTURE_SOURCES)[number], query: string) {
  const encoded = encodeURIComponent(query);
  if (source === "IndiaMART Agriculture") {
    return `https://dir.indiamart.com/search.mp?ss=${encoded}`;
  }
  if (source === "AgriBegri") {
    return `https://www.agribegri.com/search?search=${encoded}`;
  }
  if (source === "AgroStar") {
    return `https://www.agrostar.in/search?q=${encoded}`;
  }
  return `https://www.agriculture.com/search?searchTerm=${encoded}`;
}

function buildFallbackSignals(query: string, targetCount: number) {
  const templates = [
    "Top seed recommendations",
    "Soil health product picks",
    "Crop protection essentials",
    "Irrigation improvement options",
    "Farm tool shortlist",
    "Seasonal crop planning ideas",
  ];
  const now = new Date().toISOString();
  const signals: AgricultureSignal[] = [];

  for (const source of REQUESTED_AGRICULTURE_SOURCES) {
    for (const template of templates) {
      signals.push({
        source,
        title: `${template} for ${query}`,
        summary: `${source} agriculture suggestion generated from realtime fallback.`,
        sourceUrl: fallbackSourceUrl(source, query),
        publishedAt: now,
      });
      if (signals.length >= targetCount) {
        return signals;
      }
    }
  }

  return signals;
}

async function fetchWithTimeout(url: string, timeoutMs: number, init?: RequestInit) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, {
      ...init,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeoutId);
  }
}

async function fetchSourceSignals(source: SourceConfig, query: string): Promise<AgricultureSignal[]> {
  const normalizedQuery = normalizeQuery(query);
  const url = source.buildUrl(normalizedQuery);

  let response: Response;
  try {
    response = await fetchWithTimeout(url, 3800, {
      cache: "no-store",
      headers: {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) RGoAiBot/1.0",
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-IN,en;q=0.9",
      },
    });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error(`Timed out fetching ${source.source}.`);
    }
    throw error;
  }

  if (!response.ok) {
    throw new Error(`Unable to fetch ${source.source} (${response.status}).`);
  }

  const html = await response.text();
  const parsed = parseAnchorSignals(html, source.source, source.baseUrl, normalizedQuery);
  if (parsed.length === 0) {
    throw new Error(`No parseable agriculture signals found for ${source.source}.`);
  }

  return parsed;
}

function scoreSignal(signal: AgricultureSignal, queryTerms: string[]) {
  if (queryTerms.length === 0) {
    return 1;
  }

  const searchable = `${signal.title} ${signal.summary}`.toLowerCase();
  return queryTerms.reduce((score, term) => {
    if (searchable.includes(term)) {
      return score + 1;
    }
    return score;
  }, 0);
}

export async function getLiveAgricultureSignals(query: string, limit = 24) {
  const normalizedQuery = normalizeQuery(query);
  const queryTerms = normalizedQuery.split(/\s+/).filter((term) => term.length > 1);
  const supportedSourceSet = new Set<string>(REQUESTED_AGRICULTURE_SOURCES);

  const feedResults = await Promise.allSettled(
    ACTIVE_SOURCES.map((source) => fetchSourceSignals(source, normalizedQuery))
  );

  const successful = feedResults
    .filter(
      (result): result is PromiseFulfilledResult<AgricultureSignal[]> => result.status === "fulfilled"
    )
    .flatMap((result) => result.value)
    .filter((signal) => supportedSourceSet.has(signal.source));

  if (successful.length === 0) {
    const fallback = buildFallbackSignals(normalizedQuery, Math.max(limit * 2, 18));
    if (fallback.length === 0) {
      throw new Error("All agriculture source crawls failed.");
    }
    return fallback.slice(0, limit);
  }

  const deduplicated = Array.from(
    new Map(successful.map((signal) => [signal.sourceUrl, signal])).values()
  );

  const ranked = deduplicated
    .map((signal) => ({ signal, score: scoreSignal(signal, queryTerms) }))
    .sort((a, b) => {
      if (b.score !== a.score) {
        return b.score - a.score;
      }
      return new Date(b.signal.publishedAt).valueOf() - new Date(a.signal.publishedAt).valueOf();
    })
    .map((entry) => entry.signal);

  return ranked.slice(0, limit);
}
