// Owner: Role 3. Each diner agent votes on the pooled shared dishes. Model: Claude (tool-use JSON), Bitdeer backup.
import { z } from "zod";
import type { Hunger } from "../../shared/enums";
import type { AgentVote, MenuItemLite, UserLite } from "../../shared/types";
import { COMMON_RULES, tag } from "../models/provider";
import { PERSONALITY_TONE } from "../personalities";

export const voteSchema = z.object({
  yes: z.array(z.string()),
});

export function votePrompt(args: {
  user: UserLite; hunger: Hunger; pooled: MenuItemLite[];
}) {
  const system = [
    `You are ${args.user.name}'s dining agent, negotiating which dishes the table will share.`,
    PERSONALITY_TONE[args.user.personality ?? "adventurous"],
    "Vote yes on any pooled dishes your diner would happily share. You may vote for several. Return only the votes; conversation is generated after the plan is settled.",
    COMMON_RULES,
  ].join("\n");
  const user = [
    tag("profile", { name: args.user.name, likes: args.user.likes, dislikes: args.user.dislikes, hunger: args.hunger }),
    tag("pooled", args.pooled.map((p) => ({ id: p._id, name: p.name, price: p.priceCents / 100, tags: p.tags }))),
  ].join("\n");
  return { system, user };
}

export function repairVote(raw: z.infer<typeof voteSchema>, pooled: Set<string>, fallback: AgentVote): AgentVote {
  const yes = [...new Set(raw.yes.filter((id) => pooled.has(id)))];
  if (yes.length === 0 && raw.yes.length > 0) return fallback; // model voted only for made-up ids
  return { userId: fallback.userId, yes, bubble: fallback.bubble, fallback: false };
}
