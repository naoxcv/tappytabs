// Owner: Role 3. Onboarding brains, called by Role 4's thin actions users:followups and users:summarize.
// Plain async helpers (not Convex functions) so the actions call them directly.
import type { DraftProfile, FollowUpQuestion, UserLite } from "../shared/types";
import { callJson, type CallLog } from "./models/provider";
import { FALLBACK_FOLLOWUPS, followupsPrompt, followupsSchema } from "./prompts/followups";
import { profileSummaryPrompt, profileSummarySchema, templateSummary } from "./prompts/profileSummary";
import { clip } from "./bubbles";

export async function followupsFor(draft: DraftProfile, onLog?: (l: CallLog) => Promise<void>): Promise<FollowUpQuestion[]> {
  try {
    const p = followupsPrompt(draft);
    const r = await callJson({
      prompt: "followups", primary: "claude", system: p.system, user: p.user, schema: followupsSchema,
      timeoutMs: 4_000, onLog,
    });
    if (!r || r.data.questions.length === 0) return FALLBACK_FOLLOWUPS;
    return r.data.questions.slice(0, 3).map((q, i) => ({
      id: q.id || `q${i}`, question: clip(q.question, 80), options: q.options.map((o) => clip(o, 24)),
    }));
  } catch {
    return FALLBACK_FOLLOWUPS;
  }
}

export async function summarize(user: UserLite, onLog?: (l: CallLog) => Promise<void>): Promise<string> {
  try {
    const p = profileSummaryPrompt(user);
    const r = await callJson({
      prompt: "profileSummary", primary: "claude", system: p.system, user: p.user, schema: profileSummarySchema,
      timeoutMs: 6_000, onLog,
    });
    return r ? clip(r.data.profileSummary, 220) : templateSummary(user);
  } catch {
    return templateSummary(user);
  }
}
