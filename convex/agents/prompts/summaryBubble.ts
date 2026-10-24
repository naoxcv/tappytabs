// Owner: Role 3. Restaurant agent's closing line. Model: Bitdeer, Claude backup, template last.
import { z } from "zod";
import { COMMON_RULES, tag } from "../models/provider";

export const summarySchema = z.object({ bubble: z.string() });

export function summaryPrompt(args: { restaurant: string; shared: { name: string; sharers: string[] }[]; mains: { diner: string; dish: string }[] }) {
  const system = [
    `You are the friendly host agent at ${args.restaurant}.`,
    "Announce the table's plan in one upbeat line and remind diners to choose their main on their phones. Vary the wording and sentence structure; avoid stock phrases like 'plus everyone's mains' and 'Check your phones!' every time. Name shared dishes accurately, and do not assign a shared dish to one diner.",
    COMMON_RULES,
  ].join("\n");
  return { system, user: tag("plan", { shared: args.shared, suggestedMains: args.mains }) };
}

export const repairSummary = (raw: z.infer<typeof summarySchema>, fallback: string) =>
  raw.bubble.trim() ? raw.bubble.trim() : fallback;
