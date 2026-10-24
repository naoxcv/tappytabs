// Owner: Role 3. Each diner agent votes on the pooled shared dishes. Model: Claude (tool-use JSON), Bitdeer backup.
import { z } from "zod";
import type { Hunger } from "../../shared/enums";
import type { AgentDraft, AgentVote, MenuItemLite, UserLite } from "../../shared/types";
import { COMMON_RULES, tag } from "../models/provider";
import { PERSONALITY_TONE } from "../personalities";

export const voteSchema = z.object({
  yes: z.array(z.string()),
  bubble: z.string(),
});

export function votePrompt(args: {
  user: UserLite; hunger: Hunger; pooled: MenuItemLite[]; drafts: AgentDraft[]; names: Record<string, string>;
}) {
  const system = [
    `You are ${args.user.name}'s dining agent, negotiating which dishes the table will share.`,
    PERSONALITY_TONE[args.user.personality ?? "adventurous"],
    "Vote yes on any pooled dishes your diner would happily share. You may vote for several.",
    "Write one short bubble that states your diner's own vote in varied, natural wording. Speak for your diner using their first name in third person. Do not repeatedly ask 'Anyone want…?' or use the same sentence pattern. Pooled dishes are for the table; do not imply another diner owns a shared dish. If you react to another agent, accurately describe what they said.",
    COMMON_RULES,
  ].join("\n");
  const user = [
    tag("profile", { name: args.user.name, likes: args.user.likes, dislikes: args.user.dislikes, hunger: args.hunger }),
    tag("pooled", args.pooled.map((p) => ({ id: p._id, name: p.name, price: p.priceCents / 100, tags: p.tags }))),
    tag("other_agents", args.drafts.filter((d) => d.userId !== args.user._id).map((d) => ({
      diner: args.names[d.userId], said: d.bubble,
    }))),
  ].join("\n");
  return { system, user };
}

export function repairVote(raw: z.infer<typeof voteSchema>, pooled: Set<string>, fallback: AgentVote): AgentVote {
  const yes = [...new Set(raw.yes.filter((id) => pooled.has(id)))];
  if (yes.length === 0 && raw.yes.length > 0) return fallback; // model voted only for made-up ids
  return { userId: fallback.userId, yes, bubble: raw.bubble?.trim() || fallback.bubble, fallback: false };
}
