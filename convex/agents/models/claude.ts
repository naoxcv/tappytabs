// Owner: Role 3. Claude via the Anthropic SDK, JSON through structured outputs (output_config.format).
// Notes for current models (Sonnet 5.5): no temperature/top_p, no forced tool_choice — so we don't use either.
// effort "low" keeps votes/follow-ups well inside the 8 s step budget. Server-side refusal fallback is on.
import Anthropic from "@anthropic-ai/sdk";
import type { ModelProvider } from "./provider";

export const DEFAULT_CLAUDE_MODEL = "claude-sonnet-5-5";

export function claudeProvider(): ModelProvider {
  const model = process.env.CLAUDE_MODEL || DEFAULT_CLAUDE_MODEL;
  return {
    name: "claude",
    model,
    available: () => !!process.env.ANTHROPIC_API_KEY,
    async json(req) {
      const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY, maxRetries: 0 });
      const res = await client.beta.messages.create(
        {
          model,
          max_tokens: 2048,
          betas: ["server-side-fallback-2026-07-01"],
          fallbacks: "default",
          system: req.system,
          messages: [{ role: "user", content: req.user }],
          output_config: {
            effort: "low",
            format: { type: "json_schema", schema: req.jsonSchema as { [key: string]: unknown } },
          },
        },
        { signal: req.signal },
      );
      if (res.stop_reason === "refusal") throw new Error("refusal");
      if (res.stop_reason === "max_tokens") throw new Error("max_tokens");
      const text = res.content.map((b) => (b.type === "text" ? b.text : "")).join("");
      return JSON.parse(text);
    },
  };
}
