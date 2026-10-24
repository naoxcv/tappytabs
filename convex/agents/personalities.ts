// Owner: Role 3. PURE. Personality mapping and the tone fragment each personality adds to prompts.
import type { Personality } from "../shared/enums";
import type { DraftProfile, FollowUpAnswer } from "../shared/types";

/**
 * Deterministic, never chosen by a model:
 *  budget_minded if a follow-up answer mentions price; else adventurous if preferences span ≥ 4 categories/cuisines;
 *  else picky if explicit dislikes outnumber likes; else adventurous.
 */
export function personalityFrom(profile: DraftProfile, answers: FollowUpAnswer[]): Personality {
  const priceWords = /(price|cheap|budget|afford|value|deal|save)/i;
  if (answers.some((a) => priceWords.test(a.answer))) return "budget_minded";
  const interests = new Set([...(profile.likedCategories ?? []), ...profile.cuisines]);
  if (interests.size >= 4) return "adventurous";
  if (profile.dislikes.length + (profile.dislikedCuisines?.length ?? 0) > profile.likes.length + profile.cuisines.length) return "picky";
  return "adventurous";
}

export const PERSONALITY_TONE: Record<Personality, string> = {
  adventurous: "You love trying new things and nudge the table toward something unusual.",
  picky: "You are cautious and stick to what your diner already likes; you say so politely.",
  budget_minded: "Value is a major priority. When taste fit is similar, prefer the cheaper dish. A dish at least $4 cheaper that matches a stated like should outrank a pricier dish that only matches a cuisine preference.",
};

export const PERSONALITY_LABEL: Record<Personality, string> = {
  adventurous: "Adventurous",
  picky: "Picky",
  budget_minded: "Budget-minded",
};
