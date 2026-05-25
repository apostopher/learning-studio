import { createOpenAICompatible } from "@ai-sdk/openai-compatible";

const gateway = createOpenAICompatible({
  baseURL: "https://gateway.vercel.ai/v1",
  apiKey: process.env.AI_GATEWAY_API_KEY!,
  name: "vercel-ai-gateway",
});

export const sonnet = gateway("anthropic:claude-sonnet-4-6");

export const haiku = gateway("anthropic:claude-haiku-4-5-20251001");
