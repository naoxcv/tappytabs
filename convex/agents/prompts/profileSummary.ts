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
    "Mention their allergies or diet exactly as listed, if any. Max 200 characters.",
    COMMON_RULES,
  ].join("\n");
  return { system, user: tag("profile", user) };
}

export function templateSummary(user: UserLite): string {
  const likes = user.likes.slice(0, 3).join(", ") || "good food";
  const avoid = user.allergies.map((a) => ALLERGEN_LABEL[a]).join(", ");
  return clip(`You love ${likes}${avoid ? ` and your agent will always steer clear of ${avoid}` : ""}.`, 200);
}
