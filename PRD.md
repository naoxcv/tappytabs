# TappyTabs — PRD

Oct 23, 2026 · Cal Hacks 13.0

## Overview

TappyTabs lets friends tap their phones on a restaurant's device to join a table, then watch AI agents representing each of them negotiate a group order on the restaurant screen.

**Problem.** Group ordering is slow and awkward: people talk past each other, allergies get forgotten, and shared dishes get over- or under-ordered.

**Solution.** Each diner has a personal agent that knows their tastes, allergies and hunger. The restaurant has an agent that knows its menu. After check-in, the agents negotiate a shared order while diners watch their avatars talk in speech bubbles, then everyone confirms on their own phone.

**Target community.** College students with food allergies or dietary restrictions eating out with friends.

## Goals and non-goals

The MVP is the full happy path for one configured demo restaurant with a mock menu and 3–4 diners, working live on stage.

**Goals**

- Joining a table by physically tapping phones feels instant and fun.
- Diners see their agents visibly talk to each other and converge on an order.
- No diner is ever recommended a dish that violates their allergies.
- The final order reflects every diner's choice and lands on the restaurant device.

**Non-goals (hackathon)**

- Real payments or POS integration
- Multiple restaurants
- Production authentication
- Android support

## Users and roles

| Role | Device | What they do |
| --- | --- | --- |
| Diner | Their own iPhone | Builds a taste profile, taps in, sets hunger, picks and confirms their dish |
| Host | Restaurant iPhone | Sets party size, holds the tap point, watches the agent conversation, receives the order |
| Diner agent | — | Represents one diner: filters by allergies, proposes dishes, negotiates |
| Restaurant agent | — | Owns the menu, starts the party, receives the final order |

## User flow

1. **Onboarding (once).** Diner enters a name, checks allergies and diet, sets spice tolerance, answers five fixed “This or That” comparisons (plus an optional sixth), chooses price and familiarity preferences, picks an avatar, and edits a cautious taste summary.
2. **Check-in.** Host enters party size. Each diner holds their phone to the restaurant phone; a buzz and animation confirm the join, and the restaurant screen shows "2 of 4 checked in". The last tap starts everything; "Start with fewer" covers a no-show. Each diner picks a hunger level: snack, normal or starving.
3. **Negotiation.** Each diner agent drafts 1–3 candidates plus a drink within its owner's allergies. Agents then negotiate a group plan (personal mains, shared dishes, how many). Avatars talk in speech bubbles on the restaurant screen, paced with a 1.5-second gap; diners can begin picking once the plan is ready while the conversation continues.
4. **Personal pick (stage 1).** Each phone shows the agent's top pick plus 2 alternatives with a reason and price; the diner locks one in.
5. **Group confirm (stage 2).** Every phone shows the full order. Anyone can add or remove items; removing offers the agent's substitute. Everyone confirms, and the order appears on the restaurant screen.

## Functional requirements

Must-haves define the demo; should-haves and stretch items are built only after every must-have works end to end.

**Must-have**

1. **Tap to join.** Holding a diner's iPhone against the restaurant iPhone adds them to the party within ~2 s, with haptic and visual feedback. QR code join as fallback.
2. **Restaurant view.** Party-size picker, live check-in count, automatic start at full party, extra taps rejected, "Start with fewer" override, incoming final order.
3. **Agent avatars on the restaurant screen.** Each diner's agent appears as their avatar; its messages show as speech bubbles, paced so people can read them (~2–3 s each), followed by a plan summary.
4. **Mock menu with live Apify processing.** A hand-authored menu is loaded for the demo and sent through our published Apify menu normalizer/allergen tagger Actor, which returns normalized items with name, category, price, description, allergen and diet tags. Scraping a real restaurant menu from a Google Maps location is a should-have.
5. **Taste profile.** Per user: allergies and diet (hard constraints), likes, dislikes, cuisines and spice (soft), avatar, plus hunger chosen at the table.
6. **Diner agents.** One per diner; filters by hard constraints, then proposes 1–3 ranked candidates plus a drink, each with a one-line reason.
7. **Agent negotiation.** Agents exchange candidates and reach a group plan (personal mains, shared dishes, count) in bounded rounds, finishing in under ~30 s.
8. **Two-stage confirmation.** Stage 1: pick 1 of your candidates. Stage 2: shared order with add, remove and agent-suggested substitute; everyone confirms.
9. **Allergy safety.** No dish violating a diner's allergy is ever recommended to them; shared dishes respect every sharer's allergies. Uncertain dishes are flagged "ask your server".
10. **Order hand-off.** The confirmed order appears on the restaurant device.

**Should-have**

- Restaurant owner accounts and self-service restaurant profiles. An owner enters a Google Maps location; a separate Apify scraper Actor finds menu data to prefill the restaurant's editable menu profile. The owner can review and edit the results. This is a setup shortcut, not an MVP dependency.
- One main is assumed sufficient for a normally hungry diner; hunger changes only the number of shared dishes considered.
- Agent personalities from the profile (adventurous, picky, budget-minded).
- Per-person and total price on the confirmation screen.
- A diner who never confirms defaults to their agent's pick after a timeout.
- Large "table display" screen (laptop or monitor) mirroring the avatar conversation.
- Privacy setting: what your agent may say about you on the shared screen.

**Stretch**

- Voice summary of the final order.
- Bill split.
- Learning from past orders.

## Non-functional requirements and constraints

- **Latency.** Tap to join under 2 s; negotiation under 30 s; state changes visible on every device within ~1 s.
- **Consistency.** Every device shows the same party and order state in real time.
- **Determinism.** Allergy filtering and order totals are computed in plain code, never by an LLM. LLMs rank, explain and negotiate inside those bounds.
- **Reliability.** Negotiation always terminates (fixed rounds, deterministic tie-break). The demo survives flaky venue Wi-Fi (hotspot backup) and a failed tap (QR fallback).
- **Platform.** Native iOS. Every demo phone, including the restaurant phone, is an iPhone 11 or later with an ultra-wideband chip (not SE or 16e), Developer Mode on, app in the foreground during taps.
- **Tooling decisions already made.** Convex is the backend (TypeScript), including agents. Claude and Bitdeer AI Model Studio provide LLM reasoning. The MVP runs our Apify menu normalizer/allergen tagger on a mock menu; a separate Apify scraper Actor that finds a menu from a Google Maps location is a should-have. Detailed design is in the software design documents.

## Backend architecture and setup

Convex owns profiles, restaurants and menu items, party state, order lines, and the live message stream. The `@convex-dev/workflow` component runs negotiation; deterministic safety and fallback logic lives in TypeScript, with Claude and Bitdeer used for bounded language tasks. Menu ingestion calls the [TappyTabs menu normalizer Actor source and README](apify/menu-normalizer/README.md).

```text
iOS app ──subscriptions/mutations──> Convex API + schema
                                      ├─ party and order state machine
                                      ├─ negotiation workflow ──> Claude / Bitdeer
                                      └─ menu:ingest ──> Apify menu normalizer
```

For a local backend, install dependencies, start Convex, then seed from a second terminal:

```bash
npm ci
npm run dev:local
npm run seed
```

The seed writes the checked menu snapshot first, then tries the configured normalizer Actor using the raw mock menu. If Apify is unavailable or unconfigured, the snapshot remains in place. `npm run seed:negotiated` and `npm run seed:placed` prepare screen fixtures. `npm run e2e` exercises the full backend flow and **wipes app data in the active Convex deployment**, so use a disposable local or personal deployment.

To enable live model and menu processing, set Convex environment variables with `npx convex env set`: `ANTHROPIC_API_KEY`, `CLAUDE_MODEL`, `BITDEER_API_KEY`, `BITDEER_MODEL`, `APIFY_TOKEN`, `APIFY_NORMALIZER_ACTOR` (the demo currently uses `naoxcv/menu-normalizer`), `APIFY_SCRAPER_URL_TASK`, and `APIFY_SCRAPER_SEARCH_TASK`, plus optionally `DEMO_SEED`. Restaurant onboarding uses the URL Task by default, or the Search Task with at most three owner-selectable results. After a successful live ingest, refresh the checked fallback with `CONVEX_URL=<your-deployment-url> npm run menu:snapshot`. This exports the current normalized menu without reseeding.

Restaurant onboarding also calls the published normalizer before showing the review draft, so scraped zero prices can be filled with unverified estimates. Publishing runs normalization again after owner edits. Merging source code does not update the Apify Actor or Convex deployment; publish the Actor and deploy the matching backend and iOS build for this behavior.

To deploy and seed the shared demo deployment, first configure its Convex environment variables, then run:

```bash
npm run deploy:demo
```

This runs `npx convex deploy` followed by `seedActions:baseAndIngest --prod`. The seed wipes and recreates the demo app data. To deploy without reseeding, use `npm run deploy:demo -- --skip-seed`.

## Success criteria and demo

The demo is a 2-minute live run with 3–4 phones, ending with the order landing on the restaurant device.

**Success criteria**

- [ ] Every tap works on the first try, under 2 s each.
- [ ] Negotiation completes in under 30 s with zero allergen violations.
- [ ] Avatars visibly talk and converge on the restaurant screen.
- [ ] Every device shows the same order in real time.
- [ ] The mock menu is visible on the restaurant device and has been processed by a live run of our Apify Actor.
- [ ] Each target track's requirement is visible in the demo or README.

**Demo script**

1. (15 s) Pitch: group ordering is a mess, and someone's allergy always gets forgotten.
2. (20 s) Host sets party size to 4; each teammate taps in; names and avatars appear.
3. (40 s) Avatars negotiate on the restaurant screen, e.g. "Maya's allergic to shellfish, so no paella for the table."
4. (25 s) Stage 1 picks; stage 2 group order; one diner swaps a dish for a suggested substitute.
5. (10 s) Everyone confirms; the order lands on the restaurant screen.
6. (10 s) Tech close: ultra-wideband tap, live Apify processing of the mock menu, agents on Convex, reasoning on Claude and Bitdeer.

## Target tracks and their requirements

Four sponsor tracks are built into the product; design must keep each one's requirement central, not bolted on.

| Track | Prize | Requirement the design must satisfy |
| --- | --- | --- |
| Convex | $5,000 | Convex is the core backend: agents, negotiation and realtime sync all run on it |
| Apify + Best Actor | $5k across top 5; $400 | The mock menu is processed in a live Apify run; our menu normalizer/allergen tagger is published as its own Actor. A separate menu scraper from a Google Maps location is a should-have. |
| Bitdeer AI Model Studio | $500 / $200 credits + hardware | Model Studio does real work (drafting, tagging, bubble copy), named in code and README |
| Anthropic | TBD | Named community, a real problem, one thing done well, Claude central with known failure modes handled |
| Cal Hacks: Technically Complex, People-First, Hacker's Choice, Creative | Hardware | Working live demo; clear human benefit |

**Low-effort add-ons:** Notability (design notes from hour one), MLH Gen AI, GoDaddy / .Tech domain.

**Optional, needs a feature:** Visa (prices, per-person totals, merchant benefit), ElevenLabs (voice summary).

## Open questions

- [ ] Is the restaurant iPhone screen enough for the avatar conversation, or do we add a large table display?
- [ ] Do demo users pre-onboard before judging?
- [ ] Does every teammate have a compatible iPhone and a Mac with current Xcode?
- [ ] Can one project enter multiple sponsor tracks, and is there a cap?
