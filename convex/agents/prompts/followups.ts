// Owner: Role 3. Onboarding follow-up questions. Model: Claude, Bitdeer backup. 0–3 multiple-choice questions.
import { z } from "zod";
import type { DraftProfile, FollowUpQuestion } from "../../shared/types";
import { COMMON_RULES, tag } from "../models/provider";

export const followupsSchema = z.object({
  questions: z.array(z.object({
    id: z.string(),
    question: z.string(),
    options: z.array(z.string()).min(2).max(4),
  })).max(3),
});

export function followupsPrompt(draft: DraftProfile) {
  const system = [
    "You help a food-ordering app learn a new diner's taste in under 20 seconds.",
    "Ask at most 3 short multiple-choice questions that would most change what we'd recommend.",
    "One of them should be about whether price matters. Never ask about allergies (already collected).",
    "Each question ≤ 60 characters, 2–4 options of ≤ 20 characters.",
    COMMON_RULES,
  ].join("\n");
  return { system, user: tag("draft_profile", draft) };
}

export const FALLBACK_FOLLOWUPS: FollowUpQuestion[] = [
  { id: "price", question: "When you eat out, what matters most?", options: ["Taste", "Price", "Trying new things"] },
  { id: "portion", question: "How big is your usual appetite?", options: ["Light", "Normal", "Huge"] },
];
