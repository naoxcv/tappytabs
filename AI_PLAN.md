# AI Implementation Plan

## Role and current status

I own the agent brain in `convex/agents/**`, the pure safety and ranking rules, the LLM prompts/provider integration, and the menu tagger prompt/keywords in `apify/menu-normalizer/src/`. I co-own the shared agent contracts and demo personas with the backend role.

The first implementation pass is in place. The backend can run the full agent flow using deterministic fallbacks, and the AI code includes model-backed draft, vote, summary, and onboarding profile steps. The remaining work is to verify live provider calls, tune the prompts against real profiles/menu data, and demonstrate the required latency and conversation quality. The implementation notes report that no live model call has yet been made, so live behavior is not yet verified.

## Implemented

- **Safety:** `safety.ts` filters personal and shared recommendations using allergen levels, diet tags, gluten/wheat checks, and conservative handling of missing or uncertain tags. Untagged items are excluded from agent recommendations.
- **Ranking and fallback:** `ranking.ts` scores preferences, hunger, spice, personality, and price, and generates deterministic drafts and votes.
- **Negotiation rules:** `rules.ts` pools shared proposals, filters them for the whole table, sets a hunger-based shared target, tallies votes deterministically, and builds the plan. Unsafe proposals can produce exact, code-generated explanation bubbles.
- **Model integration:** `models/provider.ts` validates structured output with Zod, enforces a deadline, tries the other provider after failure, and logs each attempt. Claude and Bitdeer adapters are implemented.
- **Agent prompts and steps:** draft, vote, and summary prompts have output repair and fallback behavior. Step actions are designed to return a result without throwing. The workflow runs drafts and votes in parallel; Convex commits a deterministic rescue plan if negotiation has not committed after 30 seconds.
- **Onboarding and swaps:** AI follow-up questions and profile summaries have deterministic fallbacks. Stage-two substitute selection is deterministic and safety-filtered.
- **Coverage:** the implementation design reports pure safety/rules tests, a 500-run randomized safety suite including hostile-model paths, and fallback behavior when the network is unavailable.

## Remaining work, in priority order

### 1. Prove live model calls end to end

- Configure `ANTHROPIC_API_KEY`, `BITDEER_API_KEY`, and `BITDEER_MODEL` in the local Convex environment; set `CLAUDE_MODEL` only if changing the default.
- Run the existing end-to-end negotiation path and inspect `agentLogs:recent` in the Convex dashboard.
- Confirm calls succeed with `fallback: false`, output repairs preserve valid candidates, and provider failure still reaches the deterministic fallback.
- Record actual per-step and full-negotiation latency. Each model step has an 8-second budget, and the full negotiation target is under 30 seconds.

### 2. Tune the draft and vote behavior

- Try the four seeded personas against the current demo menu.
- Make sure draft bubbles use the correct first names, sound natural, and stay within 120 characters; reasons should stay grounded in menu/profile data.
- Make personality differences visible in tone and sometimes in picks.
- Tune vote behavior so agents express meaningful preferences instead of agreeing with nearly every pooled dish.
- Ensure the closing summary names shared dishes and tells diners to check their phones.
- Keep code-generated allergy/drop explanations as the source of exact safety claims.

### 3. Validate the menu tagger on the selected restaurant

- Coordinate with the backend/menu owner on the chosen restaurant and a representative real menu.
- Compare the Apify normalizer/tagger output with hand-checked ingredients, allergens, diets, and uncertainty markers.
- Extend `keywords.ts` and adjust `tagPrompt.ts` for gaps found in that menu. Treat uncertain or missing tags conservatively.
- Revisit ranking weights and candidate variety against the real menu after the tags are corrected.

### 4. Rehearse and document the AI demo

- Re-run the negotiation with live providers and the real menu for 3–4 diners; verify under-30-second completion and inspect all logged fallbacks/errors.
- Use `DEMO_SEED=1` where repeatable Bitdeer output is useful for rehearsal. Claude does not use temperature, so deterministic fallback votes remain an option if repeatability is important.
- Update the README with what Claude and Bitdeer do and the failure modes handled, using `agentLogs` and the rehearsal as evidence.

## Definition of done

- Live provider calls have been exercised end to end, and fallback operation remains valid when keys/network/provider calls fail.
- No model output can introduce an ineligible menu ID; personal and shared recommendations are checked in code.
- The real-menu path handles missing/uncertain tags conservatively and does not present uncertain dishes as confirmed safe.
- The live workflow completes within 30 seconds for a 3–4 diner party, or reliably commits the deterministic rescue plan within that bound.
- Agent messages are readable, correctly attributed, within length limits, and the seeded personalities produce discernible behavior.
- README/demo documentation accurately describes the actual provider use and measured behavior.

## Team dependencies

- Backend/menu owner supplies the chosen restaurant, scraper/Apify setup, and normalized menu for evaluation.
- Backend owner configures or coordinates Convex environment secrets and the shared demo deployment.
- App owner confirms the display expectations for candidate reasons, `askServer` markers, bubbles, and fallback status.
- The team agrees on shared-dish quantity rules and any profile privacy limits for public bubbles.

## Out of scope for the current pass

- Learning from past orders, voice summaries, bill splitting, or production-grade personalization.
- Letting a model decide allergy safety, invent menu items, override validation, or calculate prices.
