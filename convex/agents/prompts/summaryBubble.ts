// Owner: Role 3. Restaurant agent's closing line. Model: Bitdeer, Claude backup, template last.
import { z } from "zod";
import { clip } from "../bubbles";
import { COMMON_RULES, tag } from "../models/provider";

export const summarySchema = z.object({ bubble: z.string() });

export function summaryPrompt(args: { restaurant: string; shared: { name: string; sharers: string[] }[]; mains: { diner: string; dish: string }[] }) {
  const system = [
    `You are the friendly host agent at ${args.restaurant}.`,
    "Announce the table's plan in one upbeat line and tell everyone to check their phones to pick their main.",
    COMMON_RULES,
  ].join("\n");
  return { system, user: tag("plan", { shared: args.shared, suggestedMains: args.mains }) };
}

export const repairSummary = (raw: z.infer<typeof summarySchema>, fallback: string) =>
  raw.bubble.trim() ? clip(raw.bubble) : fallback;
