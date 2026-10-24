# TappyTabs — Implementation Design (per role)

Oct 24, 2026 · companion to [HIGH_LEVEL_DESIGN.md](HIGH_LEVEL_DESIGN.md) (decisions D1–D12 referenced below)

The repo already has a **working scaffold for every role**. The backend runs the full happy path on fallback agents, the iOS app runs every screen on mocks *and* against a live backend, and the Apify Actor runs locally. Each role section lists **what's done**, **what you build next** (in dependency order), and how to know you're finished.

**Legend:** ✅ built and tested · 🟡 built, needs real-world work (keys, hardware, tuning, art) · ⬜ not started

---

## 0. Morning checklist (everyone, ~10 min)

```bash
git pull && npm install                      # backend deps
npm run dev:local                            # local Convex at http://127.0.0.1:3210 (no account); keep it running
npm run seed                                 # (2nd terminal) restaurant, 28-item menu, 4 personas
npm test                                     # 35 tests incl. 500-run safety suite
npm run e2e                                  # full party: join → negotiate → pick → confirm → placed (~27 s)
open ios/TappyTabs.xcodeproj                 # build & run "TappyTabs" on a simulator → Mock mode by default
```

- Regenerate the Xcode project after adding or removing Swift files: `brew install xcodegen && cd ios && xcodegen`. The generated `.xcodeproj` is committed.
- To point the app at your backend, open the **Debug menu (ladybug icon)** → Live, set the URL (`http://127.0.0.1:3210` on the simulator; on a phone use your Mac's LAN IP and run `npx convex dev --local` reachable on the LAN, or your personal cloud dev deployment), then pick **Be demo diner N** or **Be the demo restaurant** to use the seeded profiles.
- Seeded ids: host `deviceId` = `demo-restaurant`; diners `demo-diner-1..4` = Maya (shellfish), Leo (peanut, tree nut, budget-minded), Priya (vegetarian, picky), Sam (gluten).
- `npm run seed:negotiated` / `seed:placed` put a party straight at `pick` / `placed` (join code `DEMO42`).
- Keys are optional for everything except "real brains": `npx convex env set ANTHROPIC_API_KEY …` (also `BITDEER_API_KEY`, `BITDEER_MODEL`, `CLAUDE_MODEL`, `APIFY_TOKEN`, `APIFY_NORMALIZER_ACTOR`, `APIFY_SCRAPER_ACTOR`, `DEMO_SEED`).

## 1. Repo map

```
tappytabs/
├── README.md                         PRD (authoritative for requirements)
├── docs/HIGH_LEVEL_DESIGN.md         architecture + decisions
├── docs/IMPLEMENTATION_DESIGN.md     this file
├── package.json, vitest.config.ts    backend scripts (dev:local, seed, e2e, test, typecheck)
├── convex/
│   ├── schema.ts                     R4  CONTRACT: all tables
│   ├── convex.config.ts              R4  workflow component
│   ├── shared/enums.ts, types.ts,    R3+R4 CONTRACT: enums, validators, agent types, TIMING,
│   │   errors.ts                           error codes
│   ├── lib/guards.ts                 R4  status/member/host/device checks
│   ├── users.ts parties.ts orders.ts R4  public API (§2.3)
│   ├── messages.ts menu.ts           R4
│   ├── negotiation.ts                R4  workflow, pooling, commit, rescue
│   ├── agentLogs.ts seed.ts          R4
│   ├── seedData.ts e2e.ts            R4 (+R3 personas/traps)
│   ├── agents/                       R3
│   │   ├── safety.ts ranking.ts      pure: the safety rules, scoring, fallback agent
│   │   ├── rules.ts substitute.ts    pure: target, pooling, tally, plan, swaps
│   │   ├── bubbles.ts personalities.ts  pure: template copy, exact drop bubble, personality
│   │   ├── models/provider.ts        ModelProvider + callJson (timeout, provider fallback, logging)
│   │   ├── models/claude.ts bitdeer.ts
│   │   ├── prompts/*.ts              draft, vote, summaryBubble, followups, profileSummary
│   │   ├── steps.ts                  draftStep, voteStep, settleStep (never throw, ≤ 8 s)
│   │   └── profile.ts                followupsFor, summarize
│   └── tests/                        R3 safety/rules/randomized, R4 backend (convex-test)
├── apify/menu-normalizer/            R4 Actor (R3 owns src/keywords.ts, src/tagPrompt.ts)
├── scripts/export-fixtures.mjs       R4 runs, R1 consumes: real API → iOS mock JSON
└── ios/
    ├── project.yml                   XcodeGen spec (R2 sets DEVELOPMENT_TEAM)
    ├── TappyTabs/App/                R2 app shell, mode select, debug menu; R1 Env/AppModel wiring
    ├── TappyTabs/Core/Convex/        R1 Models, API, Backend protocol, LiveBackend, MockBackend, PartyStore
    ├── TappyTabs/Core/Mocks/         R1 fixtures (generated, don't hand-edit)
    ├── TappyTabs/Core/UI/            R1 AvatarView, SpeechBubble, PriceText, badges, toasts
    ├── TappyTabs/Core/Proximity/     R2 Proximity (Multipeer + NI), TapDetector, QR, debug overlay
    ├── TappyTabs/Diner/              R1 screens (+ R2's TapInView)
    ├── TappyTabs/Onboarding/         R2
    ├── TappyTabs/Restaurant/         R2
    └── TappyTabsTests/               R1 + R2
```

## 2. Shared contracts (frozen at milestone 1)

### 2.1 Enums, types, timing: `convex/shared/`

- `ALLERGENS` = milk, egg, fish, shellfish, tree_nut, peanut, wheat, soy, sesame, gluten · `DIETS` = vegetarian, vegan, halal, no_pork · `HUNGERS` = snack (0.5), normal (1), starving (1.5) · `STATUSES` = checkin, hunger, negotiating, pick, confirm, placed · levels `contains | may_contain | not_detected` · `tagStatus` `tagged | untagged` · `JOIN_VIA` uwb, qr, sim.
- Agent types: `AgentDraft {userId, mains[≤3]{itemId, reason}, drink|null, sharedProposals[≤2], bubble ≤120, fallback}`, `AgentVote {userId, yes[], bubble, fallback}`, `Plan {mains[], shared[]{itemId, qty, sharedBy[]}, summaryBubble, fallback}`. Pure code uses `MenuItemLite` / `UserLite`, which Convex docs already satisfy.
- `TIMING`: step 8 s · rescue 30 s · ingest 20 s · bubble gap 2.2 s · first bubble +0.5 s · pick 45 s · confirm 45 s.

### 2.2 Errors

Mutations throw `ConvexError({code, message, reasons?})`, where `code` is one of `FULL`, `BAD_STATUS`, `NOT_MEMBER`, `NOT_HOST`, `UNSAFE`, `NOT_FOUND`, `INVALID`. Clients switch on `code` only. iOS maps these to `TTError` (`LiveBackend.swift`). `BAD_STATUS` is ignored by the UI, because the subscription re-routes the screen.

### 2.3 Function API (Role 4 → Roles 1, 2)

Every diner write takes `deviceId` and every restaurant write takes `hostDeviceId` (D1).

| Function | Kind | Args | Returns / effect | Caller |
|---|---|---|---|---|
| `users:upsert` | mutation | `deviceId`, name, allergies, diet, spice, likes, dislikes, cuisines, likedCategories?, avatarId | `userId` | R2 onboarding |
| `users:me` | query | `deviceId` | user or null | R1, R2 |
| `users:followups` | action | `draft` (profile fields) | 0–3 `{id, question, options[]}` | R2 |
| `users:summarize` | action | `userId`, `answers?[]{id,question,answer}` | `{profileSummary, personality}` (also saved) | R2 |
| `menu:restaurants` | query | – | `[{id, name}]` | R2 |
| `menu:status` | query | `restaurantId` | `{name, source, fetchedAt, itemCount}` | R2 |
| `menu:list` | query | `restaurantId` | full menu (debug) | – |
| `menu:ingest` | action | `restaurantId` | `{count, source, apifyRunId, note}`; never throws for Apify problems | R2 |
| `parties:create` | mutation | `restaurantId`, `size` 2–6, `hostDeviceId` | `{partyId, joinCode}` | R2 |
| `parties:join` | mutation | `partyId` or `joinCode`, `userId`, `via`, `hostDeviceId` (uwb/sim) or `deviceId` (qr) | `{result: joined/already, partyId}`; `FULL`, `BAD_STATUS`, `NOT_HOST` | R2 |
| `parties:current` | query | `partyId` | `{id, restaurantName, status, size, joinCode, pickDeadline, confirmDeadline, members[{userId, name, avatarId, hunger, picked, confirmed}]}` | R1, R2 |
| `parties:hosted` | query | `hostDeviceId` | `{partyId, status}` or null (relaunch) | R2 |
| `parties:forUser` | query | `userId` | `{partyId, status}` or null (relaunch) | R1 |
| `parties:setHunger` | mutation | `partyId`, `userId`, `deviceId`, `hunger` | last one starts negotiation | R1 |
| `parties:startWithFewer` | mutation | `partyId`, `hostDeviceId` | size = member count (≥ 2), status → hunger | R2 |
| `parties:reset` | mutation | `partyId`, `hostDeviceId` | clears everything, new code, epoch + 1 | R2 |
| `messages:list` | query | `partyId` | `{serverNow, messages[{id, fromUserId\|null, text, showAt}]}` | R1, R2 |
| `orders:candidates` | query | `partyId`, `userId` | `[{itemId, name, description, priceCents, reason, rank, isDrink, askServer}]` | R1 |
| `orders:pick` | mutation | `partyId`, `userId`, `deviceId`, `itemId` | main + agent's drink lines; last pick → confirm | R1 |
| `orders:lines` | query | `partyId` | `{lines[{lineId, itemId, name, qty, priceCents, kind, sharedBy[], addedBy, askServer}], totals{perUser, total}}` | R1, R2 |
| `orders:addable` | query | `partyId`, `userId`, `shared` | `[{itemId, name, category, priceCents, isDrink, askServer}]` | R1 |
| `orders:add` | mutation | `partyId`, `userId`, `deviceId`, `itemId`, `shared` | lineId; `UNSAFE` with reasons | R1 |
| `orders:remove` | mutation | `partyId`, `userId`, `deviceId`, `lineId` | `{substitute: {itemId, name, priceCents, reason, askServer} \| null}` | R1 |
| `orders:confirm` | mutation | `partyId`, `userId`, `deviceId` | last confirm → placed | R1 |

Rules for stage 2: edits are allowed only in `confirm`. Once **you** confirm, you can't edit, but others still can. Removing a shared line takes you off `sharedBy`; the line is deleted when nobody is left.

### 2.4 Agent step interface (Role 3 → Role 4)

Internal actions in `convex/agents/steps.ts`. Each returns within 8 s and **never throws** (on any failure it returns the fallback with `fallback: true`).

| Step | Args | Returns | Model (backup) |
|---|---|---|---|
| `draftStep` | `partyId`, `userId` | `AgentDraft` | Bitdeer (Claude) |
| `voteStep` | `partyId`, `userId`, `pooled[]`, `drafts[]` | `AgentVote` | Claude (Bitdeer) |
| `settleStep` | `partyId`, `pooled[]`, `drafts[]`, `votes[]` | `Plan` | Bitdeer (Claude), summary bubble only |

Pure functions Role 4 imports: `isSafeFor`, `safeSet`, `sharedSafeSet`, `addableSet`, `poolForParty`, `sharedTarget`, `tally`, `buildPlan`, `fallbackDraft`, `fallbackVote`, `substituteFor`, `dropBubbleText`, `topUpBubble`, `summaryTemplate`, `personalityFrom`.

### 2.5 iOS hand-offs (Role 2 ↔ Role 1)

- `UserDefaults` keys (`Keys` in `Env.swift`): `tt.mode`, `tt.deviceId`, `tt.userId`, `tt.partyId`, `tt.backend`, `tt.convexURL`. Exposed through `AppModel`.
- Onboarding sets `app.userId`. `TapInView` sets `app.partyId` once the diner appears in `parties:current.members`. `DinerFlow` then wraps the party in `PartyScope`, which creates and starts a `PartyStore`.
- Role 1 provides `AvatarView(avatarId:size:highlighted:)`, `SpeechBubble(text:speaker:tail:)`, `Speaker`, `PriceText`, `AskServerBadge`, `MemberTicks`, `BigButtonStyle`, `.storeFeedback(store)`, and `PartyStore` (with `visibleBubbles(at:)`, `serverOffsetMs`, `admit(userId:via:)`, `startWithFewer()`, `reset()` for the restaurant).

---

## Role 1: iOS frontend (diner screens and the Convex layer)

**Owns:** `ios/TappyTabs/Core/Convex/*`, `Core/UI/*`, `Core/Mocks/*` (generated), `Diner/*` except `TapInView.swift`, `App/Env.swift`.

### Done

| | Item |
|---|---|
| ✅ | `Models.swift`: one `Decodable` per query, ids `String`, numbers `Double`. Decoding of every fixture exported from the real backend is tested. |
| ✅ | `API.swift` constants; `Backend` protocol; `LiveBackend` (convex-swift 0.8.1: subscriptions on main, optional args left out, numbers sent as `Double`, `ConvexError` → `TTError`). |
| ✅ | `MockBackend`: replays fixtures and simulates the whole party on timers. Debug menu → *Jump to status*. |
| ✅ | `PartyStore`: 4 subscriptions, server clock offset, mutation wrappers, error mapping, reconnect flag. |
| ✅ | Routing `DinerRootView` on `status` with "done early" sub-states; `HungerView`, `NegotiatingView`, `PickView` (cards, countdown, drink), `GroupOrderView` (sections, swipe-remove → substitute sheet, add sheet with share toggle, your share and table total, confirm), `OrderPlacedView`. |
| ✅ | UI kit with placeholder emoji avatars; `SpeechBubble` with typing dots → spring; toast and reconnect banner. |
| ✅ | Verified live against a local backend in the simulator (pick screen renders real candidates). |

### Next, in order

1. **Mutation round trip on live.** Run `seed:negotiated`, be demo diner 1, lock in, and check that the screen moves to "Locked in". Then add the paella from the Add sheet and check that the `UNSAFE` toast text is readable. This verifies the `ConvexError` payload parsing in `TTError.from`; adjust the parser if convex-swift wraps `data` differently.
2. **Diner relaunch:** on launch with `userId` set and no `partyId`, call `backend.forUser(userId:)` and resume.
3. **Avatars:** swap placeholders for Amy's art (`Assets.xcassets/avatar_1…8`); `AvatarView` picks them up automatically. *Needs:* Amy's assets.
4. **Polish:** haptics are in; check Dynamic Type, dark mode, and SE-sized layout on `GroupOrderView`.
5. Show the per-person split of shared lines in "Yours" (the line keeps the full price, your total includes your share).
6. Optional: `confirmDeadline` countdown at the top of `GroupOrderView` is in; style it.
7. **4-phone run** with Role 2's tap-in. *Needs:* milestone 2.

### Design notes

- Screens never subscribe on their own; everything goes through `PartyStore`. The one exception is `AddSheet`, which reads `orders:addable` once each time it opens.
- Bubble timing: `serverOffsetMs = serverNow − now` on each push; `TimelineView(.periodic(by: 0.25))` reveals bubbles where `showAt ≤ now + offset`.
- When the API changes: Role 4 runs `node scripts/export-fixtures.mjs` (needs `dev:local` running), and `FixtureDecodingTests` tells you what broke.

### Edge cases

`UNSAFE` → toast with reasons, and the item stays out. `BAD_STATUS` → ignored. Network loss → banner, last data stays on screen. Deadline passes → the server acts and the screen follows `status`. Backgrounded app → `PartyScope` resubscribes when the app becomes active.

### Acceptance

- [ ] Four phones go from hunger to placed with every screen switching within ~1 s of each other
- [ ] Bubbles on a diner phone and the restaurant phone appear within 0.3 s of each other
- [ ] Removing a dish offers the substitute, and swapping updates every phone's order and totals
- [ ] No screen shows an item unsafe for the viewer; uncertain items always show the badge
- [ ] Every screen renders in Mock mode with the backend off ✅ (already true)

---

## Role 2: Proximity, restaurant mode, onboarding and demo

**Owns:** `Core/Proximity/*`, `Diner/TapInView.swift`, `Restaurant/*`, `Onboarding/*`, `App/TappyTabsApp.swift`, `App/ModeSelectView.swift`, `App/AppModel.swift`, `project.yml` / signing, runbook, README assembly.

### Done

| | Item |
|---|---|
| ✅ | `TapDetector` (pure, tested): < 15 cm for 3 readings in a row, 5 s debounce, a nil reading resets the count. |
| 🟡 | `Proximity`: Multipeer advertise/browse with auto-accept, `Envelope` token swap, one `NISession` per peer, rejection message, suspend/invalidate handling. **Compiles; never run on hardware.** |
| ✅ | QR: generator, AVFoundation scanner, `tappytabs://join/<code>` URL scheme (Info.plist), tested parser. |
| 🟡 | `ProximityDebugOverlay` (triple-tap the logo): distances, counts, threshold slider. |
| ✅ | `TapInView` state machine: searching → connected → tapped → joined, with QR promotion at 5 s and 3 s, URL-scheme join, mock "Simulate tap". |
| ✅ | Restaurant: `PartySetupView` (size 2–6, menu status line, Fetch menu), `CheckInView` (count, pop-in haptic, QR, Start with fewer, hosting), `HungerWaitView`, `TableTalkView` (semicircle, bubbles above speakers, history strip, `PlanSummaryCard`), `ProgressBoardView`, `OrderReceivedView` (ticket, ask-server rows, New table). Relaunch resumes the hosted party. |
| ✅ | Onboarding: name → allergies/diet chips → spice → 16-card swipe deck → follow-ups (skipped after 4 s) → avatar → summary (`upsert` + `summarize`). |
| ✅ | Mode select, long-press to switch, Debug menu (Mock/Live, URL, seeded identities, jump to status). |

### Next, in order

1. **Two-phone spike (first thing):** set `DEVELOPMENT_TEAM` in `project.yml`, run `xcodegen`, and install on two UWB iPhones. Restaurant phone: *Be the demo restaurant* → Open table. Diner phone: *Be demo diner 1* → Tap-in. Watch the debug overlay for live distance.
2. **Tune `TapConfig`:** record readings at 5, 10, 15 and 20 cm on the actual demo phones, and set the threshold and count in `TapConfig` defaults.
3. Check the first-run permission prompts (Local Network, Nearby Interaction, Camera) and make the pre-demo checklist accept all of them.
4. **Edge cases on hardware:** double tap (expect `already`), fifth diner at a table of 4 (diner sees "Table is full"), two simultaneous taps, restaurant app backgrounded and resumed.
5. `OnboardingCards.json`: replace with dishes from the chosen real restaurant. *Needs:* restaurant choice, with Role 4.
6. Avatars in the picker and table talk. *Needs:* Amy's assets.
7. TableTalk readability from 1 m: font sizes and bubble width on the restaurant phone.
8. Apple team, device registration and Developer Mode on all 5 phones; builds on all of them.
9. **Runbook:** phone-to-person map; seeded profile per phone (Debug → Be demo diner N); same Wi-Fi or hotspot; Do Not Disturb; brightness; auto-lock off; demo URL; menu fetched; the 2-minute script with fallbacks (QR, Start with fewer, `npm run seed`).
10. Rehearse until 5 clean runs in a row. README assembly.
11. Stretch: Next.js table display reading `messages:list`.

### Acceptance

- [ ] Every tap on the demo phones registers first try, in < 2 s from contact to the restaurant count updating
- [ ] A double tap never double-joins; a fifth diner at a table of 4 is rejected with a message
- [ ] QR join works from the in-app scanner and the system Camera
- [ ] Table talk is readable from 1 m and stays in step with diner phones
- [ ] A new user finishes onboarding in < 90 s
- [ ] All 5 phones run the full script 5 times in a row without touching a laptop

---

## Role 3: Agent brain

**Owns:** `convex/agents/**`, `convex/tests/{safety,rules,randomized}.test.ts`, `convex/tests/fixtures.ts`, `apify/menu-normalizer/src/keywords.ts`, `src/tagPrompt.ts`; co-owns `convex/shared/*` and the personas in `seedData.ts`.

### Done

| | Item |
|---|---|
| ✅ | `safety.ts`: three levels, gluten also checks wheat, positive diet tags, personal vs shared mode, untagged items never recommended (D5). |
| ✅ | `ranking.ts`: `scoreItem` weights (personalities, spice, askServer penalty), `mainPool`, `isSharePlate`, `fallbackDraft`, `fallbackVote`. |
| ✅ | `rules.ts`: `sharedTarget`, `poolForParty` (allergy drops first, at most 2 drop bubbles, top-up to 2), `tally`, `buildPlan`; `substitute.ts`; `personalities.ts`; `bubbles.ts` with the exact `dropBubbleText` (the PRD line is a test). Long bubble text splits into sequential sentence-sized messages; the workflow caps each transcript at 8 messages and reserves up to two for the final summary. |
| ✅ | `models/provider.ts`: `callJson` with deadline, provider fallback, Zod parse, `agentLogs`. `claude.ts` (structured outputs, effort low, server-side refusal fallback on, no `temperature` or forced tool choice, since current models reject them); `bitdeer.ts` (OpenAI SDK + Bitdeer base URL, JSON mode). |
| ✅ | Prompts with XML data tags and repair functions that never trust model ids; `steps.ts` with fallbacks; `profile.ts`. |
| ✅ | 27 pure tests + the 500-run randomized suite with a "hostile model". |
| 🟡 | **No real model call has been made yet** (no keys tonight). |

### Next, in order

1. **Keys on your local backend:** `npx convex env set ANTHROPIC_API_KEY …`, `BITDEER_API_KEY`, `BITDEER_MODEL` (pick a fast model in Model Studio). Optional: `CLAUDE_MODEL` (default `claude-sonnet-5-5`).
2. Run `npm run e2e`, then look at `agentLogs:recent` in the dashboard (`npx convex dashboard`). Check that `fallback: false` and latency stays under 8 s. If Claude's latency is high, keep `effort: "low"`.
3. **Tune the `draft` prompt** on the 4 personas: bubbles should name people correctly, stay ≤ 120 chars and read naturally. Each personality should sound different.
4. **Tune the `vote` prompt** so votes actually differ between agents (fallback votes are mostly "yes to everything").
5. Have the summary bubble name 1–2 shared dishes and tell people to check their phones.
6. **Tag prompt** (`apify/.../tagPrompt.ts`): test it on the real menu, compare against hand tags, and extend `keywords.ts` for the cuisine you pick.
7. `DEMO_SEED=1`: temperature 0 for Bitdeer; check whether bubbles repeat across rehearsals. Claude has no temperature, so if repeatability matters for votes, use fallback votes during rehearsal.
8. Re-tune `scoreItem` weights once the real menu is in. Run `npm test` after each change.
9. README sections: Claude usage and the failure modes handled; Bitdeer usage. Use `agentLogs` as evidence.

### Prompt rules (every prompt)

Profile and menu go inside XML tags as data. Only listed ids may be returned. Bubbles are ≤ 120 chars, use third person and first names, and never mention an allergy the diner didn't list. The drop bubble is **never** written by a model. Personality comes from `personalityFrom`, never from a model.

### Acceptance

- [x] Zero allergen or diet violations across 500 randomized negotiations (fallback and hostile-model paths)
- [x] Every step returns a valid result within 8 s with the network off (fallbacks)
- [ ] A full negotiation with live models finishes in < 30 s on the real menu
- [ ] Bubbles name the right people and reasons, stay ≤ 120 chars, and read naturally
- [ ] Each personality produces a visibly different tone and sometimes a different pick

---

## Role 4: Backend and data

**Owns:** `convex/*.ts` (except `agents/`), `convex/lib/`, `convex/tests/backend.test.ts`, `apify/menu-normalizer/` (except R3's two files), `scripts/`, deployments and env vars.

### Done

| | Item |
|---|---|
| ✅ | Schema (D1, D5 fields: `deviceId`, `tagStatus`, `epoch`, `kind`, `menuSource`). |
| ✅ | Every function in §2.3 with status, device and host checks; serializable join; epoch-guarded timers; exact-cent totals; final safety gate at placement. |
| ✅ | Negotiation workflow (`@convex-dev/workflow`), parallel steps, pooling, idempotent commit, 30 s rescue, paced bubbles with dedupe. |
| ✅ | `menu:ingest` over Apify's run-sync REST API (no SDK needed in Convex), Zod validation, upsert without deleting, 20 s cap, seed fallback. `mapScraperOutput` is best-effort. |
| ✅ | Seed (`base`, `negotiated`, `placed`); `e2e:happyPath` (27 s on fallbacks); `scripts/export-fixtures.mjs`. |
| ✅ | Actor `menu-normalizer`: keyword pass → Bitdeer tag pass (add or raise only) → `pushData`; `.actor/` spec, input schema, Dockerfile, local `INPUT.json`; 3 node tests; local run verified. |
| ✅ | 7 convex-test backend tests (join already/full/host/QR, startWithFewer, reset, UNSAFE, substitute, exact totals, device binding, pacing). |

### Next, in order

1. **Push the scaffold** (it isn't committed yet) and share the repo.
2. **Demo deployment:** `npx convex deploy` (or a dedicated project). Set env vars there, run `npx convex run seed:base --prod`, and put the URL in `ios/TappyTabs/App/Env.swift → demoURL`.
3. **Choose the restaurant with Role 2.** Try Apify Store scrapers on its Maps URL and pick the one that returns the full menu. Set `APIFY_SCRAPER_ACTOR`, then tighten `mapScraperOutput` to that scraper's shape.
4. **Publish the Actor:** `cd apify/menu-normalizer && apify login && apify push`. Add a README for the Store and make it public. Set `APIFY_NORMALIZER_ACTOR=<user>/menu-normalizer` and `BITDEER_*` as Actor env vars.
5. Run `menu:ingest` on the real restaurant. Hand-check its allergen tags against the menu, then **refresh `seedData.ts`** from the real run (the seed becomes the real menu, hand-checked).
6. Regenerate iOS fixtures (`node scripts/export-fixtures.mjs`) whenever a return shape changes, and tell Role 1.
7. Add tests: timers firing after reset, `autoPick`/`autoConfirm`, concurrent joins for the last seat.
8. Optional (Convex track): wrap each diner agent's vote in an `@convex-dev/agent` thread (D10).
9. README sections: Convex architecture, Apify Actor link.

### Acceptance

- [x] A script calling join ×4, setHunger ×4, pick ×4 and confirm ×4 reaches `placed` with no client (`npm run e2e`)
- [~] `convex-test` covers join (full, already), status transitions, reset, totals; *timers after reset still to add*
- [x] With models disabled, negotiation commits within 30 s via fallbacks (27 s)
- [ ] `menu:ingest` loads the real restaurant through both Actors; our Actor is public on the Apify Store
- [x] Every mutation that writes an order line refuses an unsafe item

---

## 3. Integration milestones

| # | Milestone | Status | Check |
|---|---|---|---|
| 1 | **Contracts frozen** | ✅ scaffold matches this doc | Everyone reads §2 and raises objections **before lunch**; after that, changes need the whole team's agreement |
| 2 | **Data flows** | 🟡 backend + simulator verified | Phones on a shared deployment: tap/QR → join → mock-free run on fallback agents |
| 3 | **Real brains and real menu** | ⬜ | Keys set; Apify ingest of the real restaurant; bubbles in step on the restaurant screen |
| 4 | **Happy path** | ⬜ | 5 phones, tap to `placed`, twice in a row, `npm test` green |

## 4. Mocks so nobody waits

| Blocked role | On | Use |
|---|---|---|
| R1, R2 | Backend | iOS **Mock** mode (fixtures from the real API), Debug → Jump to status |
| R1, R2 | Real negotiation | `npm run seed:negotiated` / `seed:placed` + Debug → Be demo diner N |
| R2 | Tap hardware | "Simulate tap" (mock), or `via: "sim"` from the restaurant phone |
| R2, R1 | Amy's avatars | Placeholder emoji avatars with the same `avatar_<n>` names |
| R4 | Model keys | Fallback agents (automatic when keys are missing) |
| R3 | Real menu | `seedData.ts` (28 items with shellfish, nut, gluten and diet traps) + `tests/fixtures.ts` |

## 5. Conventions

- Branches `r1/…` to `r4/…`; small PRs into `main`. Role 4 reviews `convex/schema.ts` and `convex/shared/`; Role 3 reviews `convex/agents/`.
- Function names come only from `API.swift` (iOS) or `api.*` (TS).
- `npm run typecheck && npm test` before pushing backend changes; iOS tests (`⌘U`) before pushing Swift.
- Every model call logs through `callJson` → `agentLogs`.
- Keep design notes in Notability (low-effort track).

## 6. Known gaps and things to verify first

1. **Untested on hardware:** UWB/Multipeer (Role 2, step 1).
2. **No live model or Apify call made yet:** prompts, structured-output schemas and the Apify REST path are written to the docs but unproven (Role 3 steps 1–2, Role 4 steps 3–4).
3. **`ConvexError` payload format in Swift**, assumed to be the JSON of `{code, message, reasons}` (Role 1 step 1).
4. **Phones → local backend:** the simulator reaches `127.0.0.1`. Phones need your Mac's LAN IP (ATS is relaxed for dev in Info.plist) or a cloud dev deployment.
5. `DEVELOPMENT_TEAM` is empty in `project.yml`.
6. The demo restaurant (`Tappy Kitchen (demo)`) and its Maps URL are placeholders until the real one is chosen.
