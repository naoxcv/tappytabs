// Owner: Role 3. 1–2 sentence profile summary shown at the end of onboarding. Model: Claude, Bitdeer backup.
// Personality comes from personalityFrom(), never from the model.
import { z } from "zod";
import { ALLERGEN_LABEL } from "../safety";
import type { UserLite } from "../../shared/types";
import { clip } from "../bubbles";
import { COMMON_RULES, tag } from "../models/provider";

export const profileSummarySchema = z.object({ profileSummary: z.string() });

export function profileSummaryPrompt(user: UserLite) {
  const system = [
    "Write a warm 1–2 sentence summary of this diner's taste, in the second person (\"You love...\").",
    "Mention their allergies or diet exactly as listed, if any. When useful, include a liked cuisine and avoid any disliked cuisines. Max 200 characters.",
    COMMON_RULES,
  ].join("\n");
  return { system, user: tag("profile", user) };
}

export function templateSummary(user: UserLite): string {
  const likes = user.likes.slice(0, 3).join(", ") || user.cuisines.slice(0, 2).join(" and ") || "good food";
  const avoid = [
    user.dislikedCuisines?.length ? `${user.dislikedCuisines.slice(0, 2).join(" and ")} cuisines` : "",
    user.allergies.map((a) => ALLERGEN_LABEL[a]).join(", "),
  ].filter(Boolean).join("; ");
  return clip(`You love ${likes}${avoid ? ` and your agent will steer clear of ${avoid}` : ""}.`, 200);
}
