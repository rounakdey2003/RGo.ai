"use client";

import * as React from "react";
import dynamic from "next/dynamic";
import Image from "next/image";
import {
  Bot,
  ExternalLink,
  Loader2,
  LogIn,
  MessageCircle,
  Search,
  Sparkles,
  Upload,
  Wand2,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";

const ModeToggle = dynamic(
  () => import("@/components/mode-toggle").then((module) => module.ModeToggle),
  { ssr: false }
);

type ChatMessage = {
  id: number;
  role: "user" | "assistant";
  content: string;
};

type MarketplaceItem = {
  name: string;
  category: string;
  priceInr: number;
  source: string;
  sourceUrl: string;
  reason: string;
};

type ConditionRecommendation = {
  title: string;
  steps: string[];
  expectedOutcome: string;
};

const inrFormatter = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 0,
});

function getApiError(error: unknown, fallback: string) {
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }
  return fallback;
}

function fileToDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result !== "string") {
        reject(new Error("Could not read selected image."));
        return;
      }
      resolve(reader.result);
    };
    reader.onerror = () => {
      reject(new Error("Could not read selected image."));
    };
    reader.readAsDataURL(file);
  });
}

function AuthDialog() {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button type="button" variant="outline" className="border-white/20 bg-card/60 backdrop-blur-xl">
          <LogIn />
          Login / Signup
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md border-white/15 bg-card/80 backdrop-blur-xl">
        <DialogHeader>
          <DialogTitle>Welcome to RGo.ai</DialogTitle>
          <DialogDescription>Email/password and Google login are available for everyone.</DialogDescription>
        </DialogHeader>
        <Tabs defaultValue="login" className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="login">Login</TabsTrigger>
            <TabsTrigger value="signup">Signup</TabsTrigger>
          </TabsList>
          <TabsContent value="login" className="space-y-3">
            <div className="space-y-2">
              <Label htmlFor="login-email">Email</Label>
              <Input id="login-email" type="email" placeholder="you@rgo.ai" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="login-password">Password</Label>
              <Input id="login-password" type="password" placeholder="••••••••" />
            </div>
            <Button type="button" className="w-full">
              Continue
            </Button>
          </TabsContent>
          <TabsContent value="signup" className="space-y-3">
            <div className="space-y-2">
              <Label htmlFor="signup-name">Full Name</Label>
              <Input id="signup-name" placeholder="Your name" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="signup-email">Email</Label>
              <Input id="signup-email" type="email" placeholder="you@rgo.ai" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="signup-password">Password</Label>
              <Input id="signup-password" type="password" placeholder="Create a password" />
            </div>
            <Button type="button" className="w-full">
              Create Account
            </Button>
          </TabsContent>
        </Tabs>
        <Separator />
        <Button type="button" variant="secondary" className="w-full">
          <LogIn />
          Continue with Google
        </Button>
      </DialogContent>
    </Dialog>
  );
}

export default function Home() {
  const [searchTerm, setSearchTerm] = React.useState("soil health management");
  const [marketplaceItems, setMarketplaceItems] = React.useState<MarketplaceItem[]>([]);
  const [marketplaceLoading, setMarketplaceLoading] = React.useState(false);
  const [marketplaceError, setMarketplaceError] = React.useState<string | null>(null);
  const [liveSignalCount, setLiveSignalCount] = React.useState(0);

  const [previewUrl, setPreviewUrl] = React.useState<string | null>(null);
  const [uploadedFileName, setUploadedFileName] = React.useState("");
  const [uploadedImageDataUrl, setUploadedImageDataUrl] = React.useState<string | null>(null);
  const [analysisText, setAnalysisText] = React.useState(
    "Upload a crop, soil, farm-tool, or field image to run realtime agriculture analysis."
  );
  const [analysisLoading, setAnalysisLoading] = React.useState(false);
  const [analysisError, setAnalysisError] = React.useState<string | null>(null);

  const [chatInput, setChatInput] = React.useState("");
  const [chatLoading, setChatLoading] = React.useState(false);
  const [chatError, setChatError] = React.useState<string | null>(null);
  const [messages, setMessages] = React.useState<ChatMessage[]>([
    {
      id: 1,
      role: "assistant",
      content:
        "Hello! I am RGo.ai Agronomy Assistant. Ask me about crops, soil health, seeds, irrigation, pests, farm tools, and yield improvement.",
    },
  ]);

  const [conditionPrompt, setConditionPrompt] = React.useState("");
  const [conditionLoading, setConditionLoading] = React.useState(false);
  const [conditionError, setConditionError] = React.useState<string | null>(null);
  const [generatedRecommendations, setGeneratedRecommendations] = React.useState<
    ConditionRecommendation[]
  >([
    {
      title: "Low Nitrogen in Paddy Field",
      steps: [
        "Run a soil test to confirm N level before dosing.",
        "Apply split nitrogen through urea in 2-3 scheduled rounds.",
        "Maintain shallow water layer to reduce nitrogen loss.",
      ],
      expectedOutcome: "Improved tillering and healthier canopy growth within 10-14 days.",
    },
  ]);

  const lastAutoConditionPrompt = React.useRef("");
  const lastMarketplaceQuery = React.useRef("");

  const fetchMarketplace = React.useCallback(async (query: string, signal: AbortSignal) => {
    const response = await fetch(`/api/marketplace?q=${encodeURIComponent(query)}`, {
      method: "GET",
      signal,
      cache: "no-store",
    });
    const payload = (await response.json()) as {
      items?: MarketplaceItem[];
      liveSignalCount?: number;
      error?: string;
    };

    if (!response.ok) {
      throw new Error(payload.error ?? "Could not fetch marketplace suggestions.");
    }

    setMarketplaceItems(payload.items ?? []);
    setLiveSignalCount(payload.liveSignalCount ?? 0);
  }, []);

  React.useEffect(() => {
    const query = (searchTerm.trim() || "soil health management").toLowerCase();
    if (query === lastMarketplaceQuery.current) {
      return;
    }

    const controller = new AbortController();
    const timeoutId = window.setTimeout(async () => {
      setMarketplaceLoading(true);
      setMarketplaceError(null);
      try {
        await fetchMarketplace(query, controller.signal);
        lastMarketplaceQuery.current = query;
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") {
          return;
        }
        setMarketplaceError(getApiError(error, "Could not fetch marketplace suggestions."));
      } finally {
        setMarketplaceLoading(false);
      }
    }, 700);

    return () => {
      window.clearTimeout(timeoutId);
      controller.abort();
    };
  }, [fetchMarketplace, searchTerm]);

  const handleImageSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    try {
      const dataUrl = await fileToDataUrl(file);
      setUploadedFileName(file.name);
      setUploadedImageDataUrl(dataUrl);
      setPreviewUrl(dataUrl);
      setAnalysisError(null);
      setAnalysisText("Image loaded. Running realtime agriculture analysis...");
    } catch (error) {
      setAnalysisError(getApiError(error, "Could not read image."));
    }
  };

  const handleImageAnalyze = React.useCallback(async () => {
    if (!uploadedImageDataUrl) {
      setAnalysisError("Please upload an image first.");
      return;
    }

    setAnalysisLoading(true);
    setAnalysisError(null);

    try {
      const response = await fetch("/api/analyze-image", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          imageDataUrl: uploadedImageDataUrl,
          fileName: uploadedFileName,
        }),
      });
      const payload = (await response.json()) as { analysis?: string; error?: string };
      if (!response.ok) {
        throw new Error(payload.error ?? "Image analysis failed.");
      }
      setAnalysisText(payload.analysis ?? "No analysis generated.");
    } catch (error) {
      setAnalysisError(getApiError(error, "Image analysis failed."));
    } finally {
      setAnalysisLoading(false);
    }
  }, [uploadedFileName, uploadedImageDataUrl]);

  React.useEffect(() => {
    if (!uploadedImageDataUrl) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      void handleImageAnalyze();
    }, 450);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [handleImageAnalyze, uploadedImageDataUrl]);

  const handleSendMessage = async () => {
    const trimmed = chatInput.trim();
    if (!trimmed || chatLoading) {
      return;
    }

    const userMessage: ChatMessage = {
      id: Date.now(),
      role: "user",
      content: trimmed,
    };

    setMessages((current) => [...current, userMessage]);
    setChatInput("");
    setChatLoading(true);
    setChatError(null);

    try {
      const history = [...messages, userMessage].slice(-10).map((entry) => ({
        role: entry.role,
        content: entry.content,
      }));

      const response = await fetch("/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          message: trimmed,
          history,
        }),
      });
      const payload = (await response.json()) as { reply?: string; error?: string };
      if (!response.ok) {
        throw new Error(payload.error ?? "Could not get chatbot response.");
      }

      setMessages((current) => [
        ...current,
        {
          id: Date.now() + 1,
          role: "assistant",
          content: payload.reply ?? "I couldn't generate a reply right now.",
        },
      ]);
    } catch (error) {
      const message = getApiError(error, "Could not get chatbot response.");
      setChatError(message);
      setMessages((current) => [
        ...current,
        {
          id: Date.now() + 1,
          role: "assistant",
          content: `I hit an error: ${message}`,
        },
      ]);
    } finally {
      setChatLoading(false);
    }
  };

  const requestRecommendations = React.useCallback(
    async (condition: string) => {
      const trimmed = condition.trim();
      if (!trimmed) {
        setConditionError("Please describe a farm condition.");
        return;
      }

      setConditionLoading(true);
      setConditionError(null);
      try {
        const response = await fetch("/api/conditions", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            condition: trimmed,
            imageContext: analysisText,
          }),
        });
        const payload = (await response.json()) as {
          recommendations?: ConditionRecommendation[];
          error?: string;
        };
        if (!response.ok) {
          throw new Error(payload.error ?? "Could not generate recommendations.");
        }

        const recommendations = Array.isArray(payload.recommendations) ? payload.recommendations : [];
        if (recommendations.length === 0) {
          throw new Error("No recommendations generated.");
        }
        setGeneratedRecommendations(recommendations);
      } catch (error) {
        setConditionError(getApiError(error, "Could not generate recommendations."));
      } finally {
        setConditionLoading(false);
      }
    },
    [analysisText]
  );

  React.useEffect(() => {
    const prompt = conditionPrompt.trim();
    if (prompt.length < 10) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      if (lastAutoConditionPrompt.current === prompt || conditionLoading) {
        return;
      }
      lastAutoConditionPrompt.current = prompt;
      void requestRecommendations(prompt);
    }, 900);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [conditionLoading, conditionPrompt, requestRecommendations]);

  return (
    <div className="relative min-h-screen overflow-x-hidden bg-background">
      <div className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(circle_at_top_left,rgba(34,197,94,0.2),transparent_35%),radial-gradient(circle_at_bottom_right,rgba(22,163,74,0.22),transparent_40%)]" />

      <header className="sticky top-0 z-30 border-b border-white/15 bg-background/45 backdrop-blur-xl">
        <div className="mx-auto flex w-full max-w-7xl items-center justify-between px-4 py-4 md:px-8">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">RGo.ai</h1>
            <p className="text-sm text-muted-foreground">realtime agriculture intelligence</p>
          </div>
          <div className="flex items-center gap-3">
            <AuthDialog />
            <ModeToggle />
          </div>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-8 md:px-8">
        <section className="grid gap-4 md:grid-cols-[1.6fr_1fr]">
          <Card className="border-white/15 bg-card/65 backdrop-blur-xl">
            <CardHeader>
              <Badge className="w-fit" variant="secondary">
                Live Agriculture Suggestions
              </Badge>
              <CardTitle className="text-2xl md:text-3xl">Marketplace</CardTitle>
              <CardDescription>
                Live agriculture suggestions from leading agriculture websites.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="relative">
                <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={searchTerm}
                  onChange={(event) => setSearchTerm(event.target.value)}
                  placeholder="Search crops, seeds, tools, soil care, irrigation..."
                  className="h-10 border-white/20 bg-background/60 pl-9"
                />
              </div>
            </CardContent>
          </Card>

          <Card className="border-white/15 bg-card/65 backdrop-blur-xl">
            <CardHeader>
              <CardTitle className="text-base">Marketplace Results</CardTitle>
              <CardDescription>
                {liveSignalCount > 0
                  ? `Built from ${liveSignalCount} live agriculture signals.`
                  : "Suggestions update as you type."}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-44 pr-3">
                <div className="space-y-2">
                  {marketplaceLoading ? (
                    <p className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Loader2 className="size-4 animate-spin" />
                      Fetching live agriculture suggestions...
                    </p>
                  ) : marketplaceError ? (
                    <p className="text-sm text-destructive">{marketplaceError}</p>
                  ) : marketplaceItems.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No results found.</p>
                  ) : (
                    marketplaceItems.map((item) => (
                      <div
                        key={`${item.name}-${item.sourceUrl}`}
                        className="rounded-lg border border-white/15 bg-background/45 px-3 py-2"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div>
                            <p className="font-medium">{item.name}</p>
                            <p className="text-xs text-muted-foreground">{item.category}</p>
                          </div>
                          <Badge variant="outline">{inrFormatter.format(item.priceInr)}</Badge>
                        </div>
                        <p className="mt-1 text-xs text-muted-foreground">{item.reason}</p>
                        <a
                          href={item.sourceUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="mt-1 inline-flex items-center gap-1 text-xs text-primary hover:underline"
                        >
                          {item.source}
                          <ExternalLink className="size-3" />
                        </a>
                      </div>
                    ))
                  )}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>
        </section>

        <section className="grid gap-4 lg:grid-cols-3">
          <Card className="border-white/15 bg-card/65 backdrop-blur-xl lg:col-span-1">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Upload className="size-4" />
                AI Image Analysis
              </CardTitle>
              <CardDescription>
                Upload crop, soil, field, or equipment images for realtime AI agriculture analysis.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <Input
                type="file"
                accept="image/*"
                onChange={(event) => {
                  void handleImageSelect(event);
                }}
                className="cursor-pointer border-white/20 bg-background/60"
              />
              <div className="h-100 overflow-hidden rounded-lg border border-white/20 bg-background/40">
                {previewUrl ? (
                  <Image
                    src={previewUrl}
                    alt="Uploaded agriculture preview"
                    width={640}
                    height={640}
                    unoptimized
                    className="size-full object-cover"
                  />
                ) : (
                  <div className="flex size-full items-center justify-center text-sm text-muted-foreground">
                    No image uploaded yet.
                  </div>
                )}
              </div>
              <Button
                type="button"
                onClick={() => {
                  void handleImageAnalyze();
                }}
                disabled={!uploadedImageDataUrl || analysisLoading}
                className="w-full"
              >
                {analysisLoading ? <Loader2 className="animate-spin" /> : <Sparkles />}
                Analyze
              </Button>
              {analysisError ? (
                <p className="text-sm text-destructive">{analysisError}</p>
              ) : (
                <p className="text-sm text-muted-foreground">{analysisText}</p>
              )}
            </CardContent>
          </Card>

          <Card className="border-white/15 bg-card/65 backdrop-blur-xl lg:col-span-1">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <MessageCircle className="size-4" />
                AI Chatbot
              </CardTitle>
              <CardDescription>Realtime agriculture-only suggestions from API.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <ScrollArea className="h-120 rounded-lg border border-white/20 bg-background/40 p-3">
                <div className="space-y-2">
                  {messages.map((message) => (
                    <div
                      key={message.id}
                      className={`max-w-[90%] rounded-lg px-3 py-2 text-sm ${
                        message.role === "user"
                          ? "ml-auto bg-primary text-primary-foreground"
                          : "bg-muted text-foreground"
                      }`}
                    >
                      {message.role === "assistant" ? (
                        <span className="mb-1 flex items-center gap-1 text-xs opacity-75">
                          <Bot className="size-3.5" />
                          RGo.ai Agronomy AI
                        </span>
                      ) : null}
                      {message.content}
                    </div>
                  ))}
                  {chatLoading ? (
                    <div className="max-w-[90%] rounded-lg bg-muted px-3 py-2 text-sm text-foreground">
                      <span className="mb-1 flex items-center gap-1 text-xs opacity-75">
                        <Bot className="size-3.5" />
                        RGo.ai Agronomy AI
                      </span>
                      <span className="flex items-center gap-2">
                        <Loader2 className="size-4 animate-spin" />
                        Thinking...
                      </span>
                    </div>
                  ) : null}
                </div>
              </ScrollArea>
              {chatError ? <p className="text-sm text-destructive">{chatError}</p> : null}
              <div className="flex gap-2">
                <Input
                  value={chatInput}
                  onChange={(event) => setChatInput(event.target.value)}
                  placeholder="Ask about crop disease, irrigation, seed choice, soil improvement..."
                  className="border-white/20 bg-background/60"
                  disabled={chatLoading}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      void handleSendMessage();
                    }
                  }}
                />
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => {
                    void handleSendMessage();
                  }}
                  disabled={chatLoading}
                >
                  Send
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card className="border-white/15 bg-card/65 backdrop-blur-xl lg:col-span-1">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Wand2 className="size-4" />
                Condition Generation
              </CardTitle>
              <CardDescription>
                Realtime recommendations update while you type and on demand.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <Label htmlFor="condition-prompt">Describe your farm condition</Label>
              <Textarea
                id="condition-prompt"
                value={conditionPrompt}
                onChange={(event) => setConditionPrompt(event.target.value)}
                placeholder="Example: Tomato leaves curling, yellow spots, and drip flow seems low in 2 rows."
                className="min-h-20 border-white/20 bg-background/60"
              />
              <Button
                type="button"
                className="w-full"
                disabled={conditionLoading}
                onClick={() => {
                  const prompt = conditionPrompt.trim();
                  lastAutoConditionPrompt.current = prompt;
                  void requestRecommendations(prompt);
                }}
              >
                {conditionLoading ? <Loader2 className="animate-spin" /> : <Sparkles />}
                Generate Recommendations
              </Button>
              {conditionError ? <p className="text-sm text-destructive">{conditionError}</p> : null}
            </CardContent>
            <CardFooter className="flex-col items-start gap-2">
              {generatedRecommendations.map((item) => (
                <div
                  key={`${item.title}-${item.steps.join("|")}`}
                  className="w-full rounded-lg border border-white/15 bg-background/40 px-3 py-2 text-sm"
                >
                  <p className="font-medium">{item.title}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{item.steps.join(" • ")}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{item.expectedOutcome}</p>
                </div>
              ))}
            </CardFooter>
          </Card>
        </section>
      </main>
    </div>
  );
}
