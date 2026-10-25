# TappyTabs — Low-Level Design

Oct 23, 2026 · @Nao

## Summary

Four people build against three frozen contracts: the Convex schema and function API (Role 4), the agent step interface and JSON schemas (Role 3), and the `userId` hand-off from onboarding and tap-in (Role 2). Role 1 renders whatever those produce. Everyone builds against mocks of the others until each integration milestone, so nobody waits.

This doc refines the [design doc](https://claude.ai/artifact/6Rtg6YiCzdCbzz6BZJ6Xr1); where it changes a decision, it says so.

## Ownership map

&#91;embedded content: ownership map · 4 roles, 3 contracts\]

Both iOS roles talk to the backend only through Role 4's function API; Role 4 reaches Role 3 only through the step actions and `isSafeFor`; Role 2 hands Role 1 a saved `userId` after onboarding and tap-in, and Role 1 shares its avatar and bubble views back.

## Project structure

One GitHub monorepo; the Convex backend and the Xcode project live side by side, so `npx convex dev` and Xcode run from the same checkout.

```
tappytabs/
├── convex/                      # Role 4 owns the folder; Role 3 owns agents/
│   ├── schema.ts                # R4  all tables (contract)
│   ├── convex.config.ts         # R4  registers agent + workflow components
│   ├── shared/
│   │   ├── enums.ts             # R4+R3  Allergen, Diet, Hunger, Status (contract)
│   │   └── types.ts             # R4+R3  AgentDraft, Vote, PlanSummary (contract)
│   ├── users.ts                 # R4  upsertUser, me
│   ├── parties.ts               # R4  createParty, joinParty, setHunger, startWithFewer, resetParty
│   ├── orders.ts                # R4  pickItem, addLine, removeLine, confirm, totals
│   ├── messages.ts              # R4  list (showAt filter), insertPaced
│   ├── menu.ts                  # R4  ingestMenu action, list, upsertItems
│   ├── negotiation.ts           # R4  workflow definition, step wiring, timeouts
│   └── agents/                  # R3
│       ├── safety.ts            # isSafeFor, safeSet, sharedSafeSet (pure)
│       ├── ranking.ts           # deterministic scoring + fallback agent
│       ├── rules.ts             # shared-dish target, vote tally, tie-break
│       ├── personalities.ts     # mapping + prompt fragments
│       ├── prompts/             # draft.ts, vote.ts, followup.ts, summary.ts, tag.ts
│       ├── claude.ts            # Anthropic client wrapper
│       ├── bitdeer.ts           # Bitdeer client wrapper
│       └── steps.ts             # draftStep, voteStep, settleStep (called by workflow)
├── convex/tests/                # R3 safety + rules tests, R4 mutation tests (Vitest)
├── apify/menu-normalizer/       # R4  published Actor (Node, Apify SDK)
│   ├── .actor/actor.json
│   ├── src/main.ts
│   └── src/keywords.ts          # R3 supplies the allergen dictionary
├── ios/
│   ├── TappyTabs.xcodeproj      # one app, two modes (see below)
│   ├── TappyCore/               # local Swift package
│   │   ├── Convex/              # R1  client singleton, Decodable models, subscriptions
│   │   ├── Proximity/           # R2  MultipeerSession, NIManager, TapDetector, QR
│   │   └── UI/                  # R1  AvatarView, SpeechBubble, PriceTag
│   ├── Diner/                   # R1  hunger, negotiating, pick, group order
│   ├── Onboarding/              # R2  profile form, swipe deck, follow-ups
│   ├── Restaurant/              # R2  party setup, check-in, table talk, order received
│   └── Assets.xcassets/         # Amy's illustrated avatars, dish card images
├── web/table-display/           # R2 stretch, Next.js mirror
├── scripts/seed.ts              # R4  demo profiles + cached menu snapshot
└── README.md                    # R2 assembles, every role contributes its track section
```

**One app, two modes (change from the design doc).** Diner and restaurant are one iOS target with a mode switch on first launch (long-press the logo to change). It halves signing and install work for Role 2 and lets any phone stand in as the restaurant phone if one dies.

## Technology stack

Every layer uses one library per job, chosen so the hackathon team never writes networking or sync code by hand.

| Layer | Choice | Owner | Notes |
| --- | --- | --- | --- |
| iOS UI | Swift, SwiftUI, iOS 17+, Xcode current | R1, R2 | `@Observable` view models, `NavigationStack` driven by party `status` |
| iOS ↔ backend | [convex-swift](https://docs.convex.dev/client/swift) (`import ConvexMobile`) | R1 | `subscribe(to:with:yielding:)` returns a Combine publisher; `mutation(_:with:)` is async |
| Proximity | MultipeerConnectivity, NearbyInteraction, Core Haptics | R2 | `NINearbyPeerConfiguration`, one `NISession` per peer on the restaurant phone |
| QR | CoreImage `CIQRCodeGenerator`, AVFoundation scanner | R2 | Encodes `tappytabs://join/<joinCode>` |
| Backend | Convex, TypeScript, `convex` npm | R4 | One dev deployment per person, one shared demo deployment |
| Durable flow | `@convex-dev/workflow` | R4 | Negotiation steps, retries, step timeouts |
| Agent threads | `@convex-dev/agent` | R3, R4 | One thread per diner agent per party; gives the Convex track its agent story |
| Validation | Zod (or Convex `v` validators at the edges) | R3 | Every model reply parsed before use |
| Claude | `@anthropic-ai/sdk`, current Sonnet model | R3 | Votes, onboarding follow-ups, profile summary; JSON via tool-use schema |
| Bitdeer | `openai` npm with `baseURL` [`https://api-inference.bitdeer.ai/v1`](https://developers.bitdeer.ai/docs/guides/integrations/dify) | R3 | Bitdeer's inference API [follows the OpenAI REST standard](https://www.bitdeer.ai/en/docs/inference/model-api/); pick a fast model in Model Studio for drafting and tags |
| Optional menu scrape (should-have) | `apify-client` npm from a Convex action | R4 | A separate scraper Actor can populate a new restaurant profile; outside the MVP path |
| Our Actor | `apify` SDK (Node, TypeScript), published to Apify Store | R4 | `Actor.getInput()`, `Actor.pushData()` |
| Tests | Vitest + `convex-test` | R3, R4 | Safety suite must pass before every demo build |
| Table display | Next.js + `convex/react` on Vercel | R2 (stretch) | Reads `messages:list` only |

**Number gotcha.** Convex numbers are 64-bit floats by default, which Swift's `Int` won't decode from. Store prices as `priceCents: v.number()` and decode as `Double` in Swift, or use the client's integer wrappers; R1 and R4 agree on this before writing models.

**Secrets.** `ANTHROPIC_API_KEY`, `BITDEER_API_KEY`, `APIFY_TOKEN` live only in Convex environment variables (`npx convex env set`), never in the iOS app. The app only knows the deployment URL.

## Shared contracts

These three pieces are frozen before feature work starts (milestone 1); changing one after that needs a message in the team channel and a thumbs-up from every role that consumes it.

### 1. Enums and agent types (`convex/shared/`)

```typescript
export const ALLERGENS = ["milk","egg","fish","shellfish","tree_nut","peanut",
  "wheat","soy","sesame","gluten"] as const;
export const DIETS = ["vegetarian","vegan","halal","no_pork"] as const;
export const HUNGER = { snack: 0.5, normal: 1, starving: 1.5 } as const;
export const STATUS = ["checkin","hunger","negotiating","pick","confirm","placed"] as const;
export type AllergenLevel = "contains" | "may_contain" | "not_detected";
export type Personality = "adventurous" | "picky" | "budget_minded";

// Role 3 returns these; Role 4 stores them
export type AgentDraft = {
  userId: Id<"users">;
  mains: { itemId: Id<"menuItems">; reason: string }[];   // exactly 3, ranked
  drink: { itemId: Id<"menuItems">; reason: string };
  sharedProposals: Id<"menuItems">[];                      // 0–2
  bubble: string;                                          // ≤ 120 chars
};
export type AgentVote = { userId: Id<"users">; yes: Id<"menuItems">[]; bubble: string };
export type Plan = {
  mains: { userId: Id<"users">; itemId: Id<"menuItems"> }[];
  shared: { itemId: Id<"menuItems">; qty: number; sharedBy: Id<"users">[] }[];
  summaryBubble: string;
};
```

### 2. Agent step interface (Role 3 → Role 4)

Role 3 exports three internal actions from `agents/steps.ts`; Role 4's workflow calls them and never looks inside. Each must return within 8 s and never throw: on any failure it returns the deterministic fallback with `fallback: true`.

| Step | Args | Returns | Model |
| --- | --- | --- | --- |
| `draftStep` | `partyId`, `userId` | `AgentDraft & { fallback }` | Bitdeer |
| `voteStep` | `partyId`, `userId`, `pooled: Id[]`, `drafts: AgentDraft[]` | `AgentVote & { fallback }` | Claude |
| `settleStep` | `partyId`, `drafts`, `votes` | `Plan` | Bitdeer, summary bubble only |

### 3. Convex function API (Role 4 → Roles 1, 2)

| Function | Kind | Args | Returns / effect | Called by |
| --- | --- | --- | --- | --- |
| `users:upsert` | mutation | `deviceId` + profile fields | `Id<"users">` | R2 onboarding |
| `users:me` | query | `deviceId` | user or `null` | R1, R2 |
| `users:followups` | action | draft profile | 0–3 `{id, question, options[]}` (Claude) | R2 onboarding |
| `users:summarize` | action | `userId` | `{profileSummary, personality}`, also saved on the user | R2 onboarding |
| `menu:ingest` | action | `restaurantId`, optional raw `items` | `{count, source, apifyRunId, note}`; runs the project normalizer/tagger Actor and upserts `menuItems` | R2 restaurant / seed setup |
| `menu:status` | query | `restaurantId` | `{name, fetchedAt, itemCount}` | R2 restaurant |
| `parties:create` | mutation | `restaurantId`, `size`, `hostDeviceId` | `{partyId, joinCode}` | R2 restaurant |
| `parties:join` | mutation | `partyId` or `joinCode`, `userId`, `via` | `{result: "joined" or "already", partyId}`; error `FULL` / `BAD_STATUS` | R2 proximity |
| `parties:current` | query | `partyId` | party (`status`, `size`, `joinCode`, `pickDeadline`, `confirmDeadline`) + members (`userId`, `name`, `avatarId`, `hunger`, `picked`, `confirmed`) | R1, R2 |
| `parties:setHunger` | mutation | `partyId`, `userId`, `hunger` | last one starts negotiation | R1 |
| `parties:startWithFewer` | mutation | `partyId` | `size` = member count, `status` = `hunger` | R2 |
| `parties:reset` | mutation | `partyId` | clears members, lines, bubbles; `status` = `checkin` | R2 |
| `messages:list` | query | `partyId` | `{serverNow, messages: [{id, fromUserId or null, text, showAt}]}` | R1, R2 |
| `orders:candidates` | query | `partyId`, `userId` | 3 mains + 1 drink: `itemId`, `name`, `priceCents`, `reason`, `rank`, `askServer` | R1 |
| `orders:pick` | mutation | `partyId`, `userId`, `itemId` | writes main line + the agent's drink line; last pick → `confirm` | R1 |
| `orders:lines` | query | `partyId` | lines (`lineId`, `itemId`, `name`, `qty`, `priceCents`, `sharedBy`, `addedBy`, `askServer`) + `totals {perUser, total}` | R1, R2 |
| `orders:addable` | query | `partyId`, `userId`, `shared` | items safe for me, or for every member when `shared` | R1 |
| `orders:add` | mutation | `partyId`, `userId`, `itemId`, `shared` | new line; error `UNSAFE` | R1 |
| `orders:remove` | mutation | `partyId`, `userId`, `lineId` | `{substitute: {itemId, name, priceCents, reason} or null}` | R1 |
| `orders:confirm` | mutation | `partyId`, `userId` | last confirm → `placed` | R1 |

**Errors.** Mutations throw `ConvexError` with `data.code` one of `FULL`, `BAD_STATUS`, `NOT_MEMBER`, `UNSAFE`, `NOT_FOUND`. Clients switch on the code, never on the message text.

`messages:list` returns every bubble with its `showAt`; clients reveal each one when the device clock passes it (a 250 ms `TimelineView` tick). Convex queries can't re-run on the clock, so pacing lives on the client while the order of bubbles stays on the server.

## Integration

&#91;embedded content: integration sequence · check-in, negotiation, confirm\]

The top four messages are check-in, the middle six are the negotiation workflow, and the bottom four are confirmation. Every arrow into a phone is a subscription push, not a request, so all phones change screens together.

| Integration | Where | Auth | Failure handling |
| --- | --- | --- | --- |
| iOS → Convex | `ConvexClient(deploymentUrl:)` in `Env.swift` | none (device id) | reconnect banner; state resumes from subscriptions |
| Convex → Claude | `agents/claude.ts` | `ANTHROPIC_API_KEY` env var | 8 s timeout → fallback agent |
| Convex → Bitdeer | `agents/bitdeer.ts`, OpenAI client with Bitdeer base URL | `BITDEER_API_KEY` | 8 s timeout → fallback agent and template bubbles |
| Convex → Apify | `menu.ts`, `apify-client` | `APIFY_TOKEN` | 60 s cap → cached normalized menu snapshot |
| Project Actor → Bitdeer | `apify/menu-normalizer/src/main.ts` | Actor secret env var | keyword tags plus Bitdeer enrichment; uncertain tags stay `may_contain` |
| Optional scraper Actor → Convex (should-have) | owner restaurant setup | `APIFY_TOKEN` | scraper output is reviewed/edited, then passed through the project Actor |
| Phone ↔ phone | Multipeer + Nearby Interaction | local only | QR join |

## Role 1 — iOS frontend

Role 1 owns the Convex Swift layer the whole app runs on, the shared avatar and bubble views, and every diner screen from choosing hunger to the placed order.

### Owns

- `ios/TappyCore/Convex/`: `ConvexService.swift` (client singleton), `API.swift` (function-name constants), `Models.swift`, `PartyStore.swift`, `Mocks/`
- `ios/TappyCore/UI/`: `AvatarView`, `SpeechBubble`, `PriceText`, `AskServerBadge`, `ToastView`
- `ios/Diner/`: `DinerRootView`, `HungerView`, `NegotiatingView`, `PickView`, `GroupOrderView`, `OrderPlacedView`

### Interfaces

**Provides to Role 2** (restaurant screens and onboarding reuse these):

```swift
struct AvatarView: View { init(avatarId: String, size: CGFloat, highlighted: Bool = false) }
struct SpeechBubble: View { init(text: String, speaker: Speaker, tail: Edge = .bottom) }
enum Speaker { case diner(avatarId: String, name: String), restaurant }
final class ConvexService { static let shared: ConvexService; let client: ConvexClient }
enum API { static let partiesCurrent = "parties:current"; /* one constant per function */ }
@Observable final class PartyStore { func start(partyId: String, userId: String); func stop() }
```

**Consumes:** `parties:current`, `parties:setHunger`, `messages:list`, `orders:candidates`, `orders:pick`, `orders:lines`, `orders:addable`, `orders:add`, `orders:remove`, `orders:confirm` (Role 4); a saved `userId` in `UserDefaults` key `tt.userId` and the `partyId` handed over by Role 2's tap-in screen; Amy's avatar images in `Assets.xcassets` named `avatar_<id>`.

### Design

**Models.** One `Decodable` struct per query result, field names identical to Role 4's return shapes. All ids are `String`. All numbers (`priceCents`, `showAt`, `serverNow`, deadlines) decode as `Double`, matching Convex's float64 default.

```swift
struct Party: Decodable { let id: String; let status: Status; let size: Double; let joinCode: String
  let pickDeadline: Double?; let confirmDeadline: Double?; let members: [Member] }
struct Member: Decodable { let userId, name, avatarId: String; let hunger: Hunger?; let picked, confirmed: Bool }
struct Bubble: Decodable, Identifiable { let id: String; let fromUserId: String?; let text: String; let showAt: Double }
struct Candidate: Decodable { let itemId, name, reason: String; let priceCents, rank: Double; let isDrink, askServer: Bool }
struct Line: Decodable { let lineId, itemId, name, addedBy: String; let qty, priceCents: Double; let sharedBy: [String]; let askServer: Bool }
struct Totals: Decodable { let perUser: [String: Double]; let total: Double }
enum Status: String, Decodable { case checkin, hunger, negotiating, pick, confirm, placed }
enum Hunger: String, Codable { case snack, normal, starving }
```

**PartyStore.** A single `@Observable` object per running party. `start` opens four subscriptions (`parties:current`, `messages:list`, `orders:candidates` for me, `orders:lines`) with `subscribe(to:with:yielding:)`, stores the Combine cancellables, and publishes `party`, `bubbles`, `serverOffset`, `candidates`, `lines`, `totals`, `lastError`. Screens never subscribe on their own. It also wraps every mutation as an `async throws` method (`setHunger`, `pick`, `add`, `remove`, `confirm`) that maps `ConvexError.code` to a user-facing message.

**Routing.** `DinerRootView` switches on `party.status`; the server moves every phone at once and no screen pushes another.

| `status` | Screen | Sub-state when I'm done early |
| --- | --- | --- |
| `checkin` | Role 2's `TapInView` | — |
| `hunger` | `HungerView` | "Waiting for the table" with members who have chosen |
| `negotiating` | `NegotiatingView` | — |
| `pick` | `PickView` | "Locked in, waiting for others" with ticks per member |
| `confirm` | `GroupOrderView` | "Confirmed, waiting for others" + countdown to `confirmDeadline` |
| `placed` | `OrderPlacedView` | — |

**Bubble timing.** `messages:list` returns `serverNow` with every update; store `serverOffset = serverNow − Date.now` (ms) on each push. A `TimelineView(.periodic(from: .now, by: 0.25))` shows bubbles where `showAt <= Date.now + serverOffset`, so phones with a skewed clock still stay in step with the restaurant screen.

**SpeechBubble.** Rounded rect with a tail toward the speaker, max width 260 pt, 15 pt text. On first appearance it shows typing dots for 0.6 s, then springs the text in. Restaurant bubbles use a neutral fill; diner bubbles use the speaker's avatar accent color (from `AvatarCatalog`).

**Screens.**

- **HungerView.** Three large buttons (snack, normal, starving) with an illustration each. Tap → `setHunger`; buttons disable while in flight; a second tap changes the choice while `status` is still `hunger`.
- **NegotiatingView.** Your avatar, "Your agent is negotiating", and the latest revealed bubble from your own agent (`fromUserId == me`). No controls.
- **PickView.** Rank 1 as a large card, ranks 2–3 as smaller cards, each with name, one-line reason, price and `AskServerBadge` when flagged. The drink shows beneath as "Your agent added: \<drink>" (removable later in stage 2). Select a card, then "Lock in" → `pick(itemId)`.
- **GroupOrderView.** Two sections, "For the table" (lines with more than one `sharedBy`, with the sharers' avatars) and "Yours". Each line shows qty, name, price, badge. Footer: your share (`totals.perUser[me]`) and table total. Swipe or tap minus to remove → `remove(lineId)` → if a substitute returns, a sheet offers "Swap for \<name>? \<reason>" → `add(substituteId, shared: false)`. "Add" opens a sheet listing `orders:addable` with a "Share with the table" toggle. "Confirm" → `confirm`.
- **OrderPlacedView.** Final order summary and "Sent to the restaurant", with a haptic success.

**Mocks.** `Mocks/` holds one JSON fixture per `status` (party, bubbles, candidates, lines). A `MockPartyStore` with the same interface replays them; a debug menu switches status, so every screen builds before the backend exists.

### Edge cases

- A mutation fails with `UNSAFE`: toast with the reason; the item stays out.
- `BAD_STATUS` (the server moved on): ignore silently; the subscription will route the screen.
- Subscription or network error: banner "Reconnecting…"; screens keep the last data and re-render when updates resume.
- Deadline passes while I haven't picked or confirmed: the server acts for me; the screen simply follows `status`.
- App backgrounded and reopened: `PartyStore` resubscribes on `scenePhase == .active` with the saved `partyId`.
- Prices: format `priceCents / 100` with `NumberFormatter` currency USD; shared lines show the per-person split in your total, the full price on the line.

### Acceptance criteria

- [ ] Four phones move from hunger to placed with every screen switching within \~1 s of each other
- [ ] Bubbles on a diner phone and the restaurant phone appear within 0.3 s of each other
- [ ] Removing a dish shows the agent's substitute, and swapping it updates every phone's order and totals
- [ ] No screen ever shows an item flagged unsafe for the viewer; flagged-uncertain items always show the badge
- [ ] Every screen renders from mocks alone with the backend off

### Task log

Ordered by dependency; *needs* marks a cross-role dependency.

- [ ] Add convex-swift to `TappyCore`; `ConvexService` with dev and demo deployment URLs in `Env.swift`
- [ ] `API.swift` constants for every function in the API table
- [ ] Agree number and id types with Role 4; write `Models.swift`
- [ ] Mock fixtures for every `status` and `MockPartyStore`
- [ ] `AvatarCatalog` (ids, accent colors) and `AvatarView`; *needs* Amy's assets (placeholders until then)
- [ ] `SpeechBubble` with typing dots and spring-in
- [ ] `PartyStore` with subscriptions, server-offset clock, mutation wrappers and error mapping
- [ ] `DinerRootView` routing on `status`, including early-done sub-states
- [ ] `HungerView`
- [ ] `NegotiatingView`
- [ ] `PickView` with badges and lock-in
- [ ] `GroupOrderView`: sections, totals, remove with substitute sheet, add sheet with share toggle, confirm
- [ ] Confirm countdown from `confirmDeadline`
- [ ] `OrderPlacedView`
- [ ] Reconnect banner, background/foreground resubscribe
- [ ] Swap mocks for live data; *needs* Role 4's functions and a seeded deployment
- [ ] End-to-end run on four phones with Role 2's tap-in; *needs* Role 2 proximity
- [ ] Polish: haptics on lock-in and confirm, Dynamic Type, dark mode check

## Role 2 — Proximity, restaurant mode and demo

Role 2 builds the physical tap first, then everything the restaurant phone shows, the onboarding flow that creates each diner, getting the app onto every phone, and the demo itself.

### Owns

- `ios/TappyCore/Proximity/`: `Proximity.swift` (facade), `MultipeerSession.swift`, `NIManager.swift`, `TapDetector.swift`, `QRCode.swift`, `QRScannerView.swift`, `ProximityDebugOverlay.swift`
- `ios/Diner/TapInView.swift` (the diner's check-in screen)
- `ios/Restaurant/`: `RestaurantRootView`, `PartySetupView`, `CheckInView`, `HungerWaitView`, `TableTalkView`, `PlanSummaryCard`, `ProgressView` (pick and confirm), `OrderReceivedView`
- `ios/Onboarding/`: `OnboardingFlow`, `BasicsView`, `AllergyDietView`, `SpiceView`, `SwipeDeckView`, `FollowUpView`, `AvatarPickerView`, `ProfileSummaryView`, `OnboardingCards.json`
- `ios/App/`: `ModeSelectView`, URL scheme handling, Info.plist
- Signing, installs, demo runbook, README assembly; stretch: `web/table-display/`

### Interfaces

**Provides:**

```swift
final class Proximity {
  static let shared: Proximity
  var debugDistances: [String: Float] { get }   // userId → metres, for the overlay
  // Diner: browse for a restaurant, range, fire once on a tap
  func startDinerTapIn(userId: String, onConnected: (partyId: String) -> Void,
                       onTapped: () -> Void, onRejected: (reason: String) -> Void)
  // Restaurant: advertise the party, range every diner, report taps
  func startHosting(partyId: String, onTap: (userId: String) -> Void)
  func reject(userId: String, reason: String)   // restaurant → diner over Multipeer
  func stop()
}
struct TapConfig { var thresholdMetres: Float = 0.15; var consecutive = 3; var debounce: TimeInterval = 5 }
```

To Role 1: a saved `userId` (`UserDefaults` key `tt.userId`) after onboarding, and `PartyStore.start(partyId:userId:)` called once `TapInView` sees the diner in the party.

**Consumes:** `users:upsert`, `users:followups`, `users:summarize`, `menu:ingest`, `menu:status`, `parties:create`, `parties:join`, `parties:current`, `parties:startWithFewer`, `parties:reset`, `messages:list`, `orders:lines` (Role 4); `AvatarView`, `SpeechBubble`, `ConvexService`, `API` (Role 1); Amy's avatar set.

### Design: proximity

**Discovery.** The restaurant runs `MCNearbyServiceAdvertiser` on service type `tappytabs` with `discoveryInfo = ["partyId": partyId]` and peer display name `restaurant`. The diner runs `MCNearbyServiceBrowser`, invites the first restaurant it finds with no UI, and the advertiser auto-accepts. Session encryption `.optional` for speed.

**Token swap.** On `.connected`, each side creates a fresh `NISession`, archives its `discoveryToken` with `NSKeyedArchiver(requiringSecureCoding: true)` and sends one `Codable` envelope:

```swift
enum Envelope: Codable { case hello(userId: String?, token: Data)   // userId nil from restaurant
                         case rejected(reason: String) }
```

On receiving `hello`, the receiver unarchives the peer token and runs `NINearbyPeerConfiguration(peerToken:)`. The restaurant keeps a dictionary `userId → NISession`, one per diner.

**Tap detection.** `TapDetector` watches `session(_:didUpdate:)` distances per peer. A tap fires once when `distance < thresholdMetres` for `consecutive` updates in a row, then that peer is ignored for `debounce` seconds. Nil distances reset the count. Check `NISession.deviceCapabilities.supportsPreciseDistanceMeasurement` at launch and show "This phone can't tap, use QR" if false.

- Diner side: on fire, play a Core Haptics transient + success animation immediately (no network wait), call `onTapped`.
- Restaurant side: on fire, call `onTap(userId)`; the restaurant screen then calls `parties:join(partyId, userId, "uwb")`. On `FULL` it calls `Proximity.reject(userId, "Table is full")`.

**Session lifecycle.** On `sessionWasSuspended` wait; on `sessionSuspensionEnded` re-run the same configuration. On `didInvalidateWith` or a Multipeer disconnect, drop the peer's state and redo the token swap on reconnect (tokens are single-session).

**QR fallback.** The restaurant shows `CIQRCodeGenerator` output for `tappytabs://join/<joinCode>`. The diner's "Scan QR" opens `QRScannerView` (`AVCaptureMetadataOutput`, type `.qr`); the app also registers the URL scheme so the system Camera works. Both call `parties:join(joinCode, userId, "qr")`.

**TapInView (diner).** States: searching → connected ("Hold your phone to the restaurant phone") → tapped (animation) → joined (my `userId` appears in `parties:current.members`) → hand off to Role 1. If not joined 3 s after `tapped`, show "Scan QR instead". "Scan QR" is always visible as a secondary button.

**Debug overlay.** A hidden toggle (triple-tap the logo) shows live distance per peer and the tap count, used to tune `TapConfig` on the real demo phones.

### Design: restaurant mode

- **PartySetupView.** Size stepper 2–6; show the seeded restaurant and normalized mock-menu status from `menu:status`; "Open table" → `parties:create` → `CheckInView` and `startHosting`. Menu editing and Maps-based menu discovery are should-have setup features, not part of starting a demo party.
- **CheckInView.** Large "2 of 4 checked in", avatar grid where each new member pops in with a haptic, small QR in a corner, "Start with fewer" enabled at 2 or more members → `parties:startWithFewer`.
- **HungerWaitView.** Members with a tick once they choose hunger.
- **TableTalkView.** Restaurant avatar top centre, diner avatars on a semicircle (positions precomputed for 2–6). Bubbles from `messages:list` appear above their speaker when `showAt` passes (same server-offset clock as Role 1); the previous bubble fades to a scrolling history strip at the bottom. When `status` becomes `pick`, `PlanSummaryCard` slides up: each diner's main, shared dishes with sharer avatars.
- **ProgressView.** During `pick` and `confirm`: "3 of 4 locked in" / "3 of 4 confirmed" with avatar ticks.
- **OrderReceivedView.** Ticket layout from `orders:lines`: shared dishes, then per diner, ask-server flags highlighted, table total. A "New table" button → `parties:reset`.
- **Mode select.** First launch asks "Diner or Restaurant", saved in `UserDefaults` key `tt.mode`; long-press the logo for 2 s to switch or reset.

**Should-have: self-service restaurant setup.** Add authenticated owner accounts and restaurant profile creation. The owner supplies a Google Maps location. A separate Apify scraper Actor uses that location to find menu data and prefill the profile; the owner reviews and edits it before saving. Pass the accepted menu through this project's `menu-normalizer` Actor. This is a convenience for fast setup, not a must-have dependency.

### Design: onboarding

Steps, under 90 s total, each a full screen with a progress bar:

1. **Basics:** name.
2. **Allergies and diet:** checkboxes from the shared enums (`ALLERGENS`, `DIETS`), with plain labels ("Shellfish", "Tree nuts").
3. **Spice:** 0–4 slider with chilli icons.
4. **Swipe deck:** 16 cards from `OnboardingCards.json` (drawn from the demo restaurant's menu, each `{name, image?, tags[]}`). Right = like, left = dislike; liked tags go to `likes`, disliked to `dislikes`, and the cuisines of liked cards to `cuisines`.
5. **Follow-ups:** `users:followups(draft)` returns up to 3 multiple-choice questions; skip if it takes over 4 s.
6. **Avatar:** grid of Amy's illustrations.
7. **Summary:** `users:upsert` with everything, then `users:summarize(userId)`; show the returned `profileSummary` and personality badge; save `tt.userId`.

### Design: installs and demo

- One Apple developer team; register all 5 demo phones (4 diners + restaurant), each with Developer Mode on; one scheme builds the single app target.
- Info.plist: `NSNearbyInteractionUsageDescription`, `NSLocalNetworkUsageDescription`, `NSBonjourServices` = `_tappytabs._tcp`, `_tappytabs._udp`, `NSCameraUsageDescription`, URL scheme `tappytabs`.
- **Pre-demo checklist:** every permission prompt already accepted; same Wi-Fi or hotspot on all phones; Do Not Disturb on; brightness up; auto-lock off; app open in the right mode; demo deployment URL; seeded profiles on each diner phone; normalized mock menu ready.
- **Runbook:** phone-to-person assignment, the 2-minute script from the PRD with timings, who says what, and the fallback for each failure in the design doc's reliability table.
- **README:** assemble the track sections each role writes, plus architecture diagram and setup steps.

### Edge cases

- Diner taps a second time after joining: debounce plus `parties:join` returning `already` → no duplicate, diner sees the joined state.
- Party full: restaurant sends `rejected`; diner shows "Table is full".
- Two diners tap at once: each has its own `NISession`; `parties:join` is transactional, so the count never overshoots.
- Phone without precise distance: QR only.
- Multipeer finds nothing for 5 s: TapInView promotes "Scan QR" to the primary button.
- Restaurant app backgrounded: advertising stops; on return it restarts and diners reconnect.

### Acceptance criteria

- [ ] Every tap on the demo phones registers first try, in under 2 s from contact to the restaurant count updating
- [ ] A deliberate double tap never double-joins; a fifth diner at a table of 4 is rejected with a message
- [ ] QR join works from both the in-app scanner and the system Camera
- [ ] Table talk is readable from 1 m away and stays in step with diner phones
- [ ] A new user finishes onboarding in under 90 s
- [ ] The app is installed and running on all 5 phones, and the full script runs 5 times in a row without touching a laptop

### Task log

- [ ] Two-phone spike: Multipeer connect, token swap, live distance on screen
- [ ] `TapDetector` with `TapConfig`, debug overlay
- [ ] Tune threshold and hold on the real demo phones; record readings at 5, 10, 15, 20 cm
- [ ] `Proximity` facade: diner and restaurant sides, rejection, session lifecycle handling
- [ ] Capability check and QR-only path
- [ ] Info.plist keys and URL scheme
- [ ] QR generator and scanner; URL scheme handler
- [ ] `ModeSelectView` and long-press reset
- [ ] `TapInView` state machine; *needs* `parties:join`, `parties:current` (Role 4)
- [ ] `PartySetupView` with seeded restaurant/menu status; *needs* `menu:status`
- [ ] `CheckInView` with live count, pop-in, start with fewer
- [ ] `HungerWaitView` and `ProgressView`
- [ ] `TableTalkView` semicircle layout, timed bubbles, history strip; *needs* `SpeechBubble`, `AvatarView` (Role 1)
- [ ] `PlanSummaryCard` and `OrderReceivedView`; *needs* `orders:lines`
- [ ] `OnboardingCards.json` from the demo restaurant's menu; *needs* the restaurant choice (with Role 4)
- [ ] Onboarding screens 1–4 and avatar picker; *needs* Amy's assets
- [ ] Follow-ups and summary wiring; *needs* `users:followups`, `users:summarize` (Role 4 wiring, Role 3 prompts)
- [ ] Apple team, device registration, Developer Mode, builds on all 5 phones
- [ ] Pre-demo checklist and runbook
- [ ] Seed the 4 teammate profiles on their phones; *needs* `scripts/seed.ts` (Role 4)
- [ ] Full-team rehearsals until 5 clean runs in a row
- [ ] README assembly
- [ ] Stretch: Next.js table display mirroring `TableTalkView`

## Role 3 — Agent brain

Role 3 owns every decision about food: what is safe for whom, what ranks first, how agents vote and settle, what they say, and every prompt in the repo. The deterministic core is pure TypeScript with no Convex or network imports, so it is fully unit-testable.

### Owns

- `convex/agents/safety.ts`, `ranking.ts`, `rules.ts`, `substitute.ts`, `personalities.ts` (pure)
- `convex/agents/prompts/`: `draft.ts`, `vote.ts`, `dropBubble.ts`, `summaryBubble.ts`, `followups.ts`, `profileSummary.ts`, `tag.ts`
- `convex/agents/claude.ts`, `bitdeer.ts` (model clients), `steps.ts` (the three step actions), `profile.ts` (follow-up and summary actions logic)
- `convex/tests/agents/*` and `apify/menu-normalizer/src/keywords.ts`
- `convex/shared/enums.ts` and `types.ts`, co-owned with Role 4

### Interfaces

**Provides (pure, imported by Role 4's mutations and steps):**

```typescript
type Safety = { safe: boolean; askServer: boolean; reasons: string[] };
isSafeFor(item: MenuItem, users: User[]): Safety          // every user must pass
safeSet(menu: MenuItem[], user: User): (MenuItem & { askServer: boolean })[]
sharedSafeSet(menu: MenuItem[], users: User[]): (MenuItem & { askServer: boolean })[]
scoreItem(item: MenuItem, user: User, hunger: Hunger): number
fallbackDraft(menu: MenuItem[], user: User, hunger: Hunger): AgentDraft
fallbackVote(pooled: MenuItem[], user: User): AgentVote
sharedTarget(hungers: Hunger[]): number
tally(pooled: Id<"menuItems">[], votes: AgentVote[], menu: MenuItem[], target: number): Id<"menuItems">[]
substituteFor(removed: MenuItem, user: User, menu: MenuItem[]): { item: MenuItem; reason: string } | null
personalityFrom(profile: DraftProfile, answers: FollowUpAnswer[]): Personality
dropBubbleText(item: MenuItem, failed: { user: User; safety: Safety }[]): string
```

**Provides (internal actions, called by Role 4):** `draftStep`, `voteStep`, `settleStep` as in Shared contracts §2, plus `followupsFor(draft)` and `summarize(user)` used by `users:followups` and `users:summarize`. Every one returns within 8 s and never throws.

**Consumes:** schema types and enums (Role 4); `ANTHROPIC_API_KEY`, `BITDEER_API_KEY`, `BITDEER_MODEL`, `CLAUDE_MODEL` from Convex env; the seeded mock menu in `menuItems` and the 4 seeded profiles for tuning.

### Design: safety rules

- An allergen field per item is `contains`, `may_contain` or `not_detected`.
- For each of a user's allergies: `contains` → unsafe; `may_contain` → safe with `askServer`; `not_detected` → safe. A `gluten` allergy also checks `wheat`.
- Diets are positive tags set by the tagger. `vegan` requires the `vegan` tag; `vegetarian` accepts `vegetarian` or `vegan`; `halal` requires `halal` or `vegetarian`; `no_pork` requires `no_pork` or `vegetarian`. A missing tag fails the diet (conservative).
- `isSafeFor(item, users)` is unsafe if any user fails; `askServer` is true if any user's check was `may_contain`; `reasons` name the user and allergen for bubbles and error messages.
- Drinks go through the same checks (milk, nuts in smoothies).

### Design: ranking and rules

- **`scoreItem`:** +3 per like tag matched, +2 if the item's cuisine is in `cuisines`, −4 per dislike tag, −2 per spice level above tolerance, +1 for `shareable` when hunger is `starving`, −1 per $5 over the menu median for `budget_minded`, +2 for categories not in likes for `adventurous`, −2 for `askServer` items for `picky`.
- **`fallbackDraft`:** top 3 mains by score from `safeSet`, top drink, the top 2 `shareable` items from `sharedSafeSet` across the whole party as proposals, reasons from templates ("Matches your love of noodles"), bubble from a template.
- **`sharedTarget`:** weights snack 0.5, normal 1, starving 1.5; `max(1, round(sum / 2))`.
- **`tally`:** count yes votes per pooled item; take the top `target`; ties go to lower price, then menu order. Each chosen shared dish has `qty` 1 and `sharedBy` = every member it is safe for.
- **`substituteFor`:** the highest-scoring item for that user in the same category, safe for them, not already in the order; null if none.
- **`personalityFrom`:** `budget_minded` if a follow-up answer chooses price; else `adventurous` if liked cards span 4 or more categories; else `picky` if dislikes outnumber likes; else `adventurous`.

### Design: prompts and model calls

Common rules for every prompt: profile and menu text go inside XML tags as data; the system prompt says only listed ids may be returned and the list is final; bubbles are at most 120 characters, refer to the diner in the third person by first name, and never mention an allergen the diner did not list.

| Prompt | Model | Input | Output (validated) |
| --- | --- | --- | --- |
| `draft` | Bitdeer (JSON mode) | `<profile>`, hunger, personality, `<candidates>` (id, name, category, price, description, askServer) from `safeSet`, `<shared_candidates>` from `sharedSafeSet` | `AgentDraft` |
| `vote` | Claude (one tool, `cast_vote`, `input_schema` = `AgentVote`) | own profile, personality, `<pooled>`, other agents' drafts and bubbles | `AgentVote` |
| `dropBubble` | none (code) | template "\<Name>'s allergic to \<allergen>, so no \<dish> for the table" | no model: filled in code by `dropBubbleText`, because allergy claims must be exact |
| `summaryBubble` | Bitdeer | the settled `Plan` with names | one restaurant-agent line |
| `followups` | Claude | draft profile | 0–3 `{id, question, options[]}` |
| `profileSummary` | Claude | full profile | `{profileSummary}` of 1–2 sentences; personality comes from `personalityFrom`, not the model |
| `tag` | Bitdeer | batch of 20 `{name, description}` + keyword results | per item, allergen levels and diet tags; may only add or raise, never lower |

**Validation.** Parse every reply with Zod; then drop any `itemId` not in the right candidate set. If fewer than 3 mains survive, fill from `fallbackDraft`. Any parse failure, empty result or timeout returns the fallback with `fallback: true`.

**Clients.** `claude.ts` uses `@anthropic-ai/sdk` with `CLAUDE_MODEL`; `bitdeer.ts` uses the `openai` SDK with `baseURL: "https://api-inference.bitdeer.ai/v1"` and `BITDEER_MODEL`. Both wrap calls in an `AbortController` with an 8 s timeout, temperature 0.7 normally and 0 when `DEMO_SEED` is set, and log prompt name, model, latency and `fallback` through a Role 4 `agentLogs:insert` internal mutation.

### Design: steps

- **`draftStep(partyId, userId)`:** load user, hunger, menu; compute `safeSet` and `sharedSafeSet`; call `draft`; validate; return.
- **`voteStep(partyId, userId, pooled, drafts)`:** call `vote` with the pooled ids (already filtered by Role 4 using `sharedSafeSet`); validate; return.
- **`settleStep(partyId, drafts, votes)`:** pure `tally` and plan building, then one `summaryBubble`; returns `Plan`. Drop bubbles are not made here: Role 4 writes them during pooling with `dropBubbleText`, so they stream before the votes.

### Edge cases

- A diner with a safe set smaller than 3 mains: return what exists; Role 1 shows fewer cards.
- No shared dish safe for everyone: `sharedSafeSet` empty → zero shared dishes and a bubble saying so.
- All votes tie at zero: tie-break still picks deterministically.
- A model invents a dish or an allergen-unsafe dish: removed by validation before anything is stored.
- Prompt injection in a name or menu description: treated as data inside tags; outputs are ids from a fixed list, so injected text can't add dishes.

### Acceptance criteria

- [ ] Zero allergen or diet violations across a 500-run randomized test of full negotiations with fixture users and menus
- [ ] Every step returns a valid result within 8 s with the network disabled (fallbacks)
- [ ] A full negotiation on the seeded mock menu takes under 20 s with live models
- [ ] Bubbles name the right people and reasons, stay under 120 characters, and read naturally on the restaurant screen
- [ ] Each personality produces visibly different tone and at least sometimes a different pick

### Task log

- [ ] Agree `shared/enums.ts` and `shared/types.ts` with Role 4
- [ ] Fixture users (shellfish, peanut, vegan, gluten-free, no restrictions) and a fixture menu with traps
- [ ] `safety.ts` + unit tests
- [ ] `rules.ts` (`sharedTarget`, `tally`) + tests
- [ ] `ranking.ts` (`scoreItem`, `fallbackDraft`, `fallbackVote`) + tests
- [ ] `steps.ts` returning fallbacks only, so Role 4 can wire the workflow
- [ ] `substitute.ts` + tests; hand to Role 4 for `orders:remove`
- [ ] `personalities.ts` and `personalityFrom`
- [ ] Allergen keyword dictionary and `tag` prompt; hand to Role 4 for the Actor
- [ ] `bitdeer.ts` client with timeout and logging; *needs* `agentLogs:insert` (Role 4)
- [ ] `draft` prompt + Zod schema + validation
- [ ] `claude.ts` client; `vote` prompt with tool schema
- [ ] `dropBubbleText` (pure) for Role 4's pooling; `summaryBubble` prompt; complete `settleStep`
- [ ] `followups` and `profileSummary` prompts; `followupsFor` and `summarize`
- [ ] 500-run randomized safety test
- [ ] Tune prompts on the seeded mock menu with the 4 seeded profiles
- [ ] Rehearsal mode (temperature 0) check for repeatable bubbles
- [ ] README sections: Claude usage and failure modes handled, Bitdeer usage

## Role 4 — Backend and data

Role 4 owns the Convex deployment end to end: schema, every public function, the party state machine, the negotiation workflow that calls Role 3's steps, bubble pacing, and the menu pipeline including our published Apify Actor.

### Owns

- `convex/schema.ts`, `convex.config.ts`, `users.ts`, `parties.ts`, `orders.ts`, `messages.ts`, `menu.ts`, `negotiation.ts`, `agentLogs.ts`
- `convex/shared/` (co-owned with Role 3), `convex/tests/backend/*`
- `apify/menu-normalizer/` (except `keywords.ts`, from Role 3)
- `scripts/seed.ts`; the dev and demo deployments and their env vars

### Interfaces

**Provides:** every function in the API table (Shared contracts §3) with those exact names, args and return shapes; `agentLogs:insert` (internal) for Role 3; a seeded deployment Roles 1–3 can build against.

**Consumes:** Role 3's pure functions (`isSafeFor`, `safeSet`, `sharedSafeSet`, `sharedTarget`, `substituteFor`, `dropBubbleText`), step actions (`draftStep`, `voteStep`, `settleStep`, `followupsFor`, `summarize`), keyword dictionary and `tag` prompt.

### Design: schema

The schema below records the original contract shape. The implementation has since added fields needed by the current backend contract: `users.likedCategories`; restaurant `menuSource`; menu-item `tagStatus`; party `epoch` and lifecycle timestamps; member `joinedAt`; order-line `kind`; and `agentLogs.provider`. `restaurants.mapsUrl` is optional, as specified here. For the current table definitions, use `convex/schema.ts`; the high-level design's §5 data model describes the current contract.

```typescript
const allergenV = v.union(...ALLERGENS.map(a => v.literal(a)));
const dietV = v.union(...DIETS.map(d => v.literal(d)));
const levelV = v.union(v.literal("contains"), v.literal("may_contain"), v.literal("not_detected"));

export default defineSchema({
  users: defineTable({ deviceId: v.string(), name: v.string(), allergies: v.array(allergenV),
    diet: v.array(dietV), spice: v.number(), likes: v.array(v.string()), dislikes: v.array(v.string()),
    cuisines: v.array(v.string()), personality: v.optional(personalityV), avatarId: v.string(),
    profileSummary: v.optional(v.string()) }).index("by_device", ["deviceId"]),
  restaurants: defineTable({ name: v.string(), ownerDeviceId: v.optional(v.string()), mapsUrl: v.optional(v.string()),
    apifyRunId: v.optional(v.string()), fetchedAt: v.optional(v.number()) }),
  menuItems: defineTable({ restaurantId: v.id("restaurants"), name: v.string(), category: v.string(),
    cuisine: v.optional(v.string()), tags: v.array(v.string()), description: v.string(),
    priceCents: v.number(), allergens: v.array(v.object({ allergen: allergenV, level: levelV })),
    diet: v.array(dietV), spice: v.number(), isDrink: v.boolean(), shareable: v.boolean(),
    menuOrder: v.number() }).index("by_restaurant", ["restaurantId"]),
  parties: defineTable({ restaurantId: v.id("restaurants"), hostDeviceId: v.string(), size: v.number(),
    status: statusV, joinCode: v.string(), pickDeadline: v.optional(v.number()),
    confirmDeadline: v.optional(v.number()) }).index("by_joinCode", ["joinCode"]),
  members: defineTable({ partyId: v.id("parties"), userId: v.id("users"), joinedVia: v.union(v.literal("uwb"), v.literal("qr")),
    hunger: v.optional(hungerV), pickedItemId: v.optional(v.id("menuItems")), confirmedAt: v.optional(v.number()) })
    .index("by_party", ["partyId"]).index("by_party_user", ["partyId", "userId"]),
  candidates: defineTable({ partyId: v.id("parties"), userId: v.id("users"), itemId: v.id("menuItems"),
    rank: v.number(), reason: v.string(), isDrink: v.boolean(), askServer: v.boolean() })
    .index("by_party_user", ["partyId", "userId"]),
  messages: defineTable({ partyId: v.id("parties"), fromUserId: v.optional(v.id("users")), text: v.string(),
    showAt: v.number() }).index("by_party_showAt", ["partyId", "showAt"]),
  orderLines: defineTable({ partyId: v.id("parties"), itemId: v.id("menuItems"), qty: v.number(),
    sharedBy: v.array(v.id("users")), addedBy: v.union(v.id("users"), v.literal("agent")) })
    .index("by_party", ["partyId"]),
  agentLogs: defineTable({ partyId: v.optional(v.id("parties")), userId: v.optional(v.id("users")),
    prompt: v.string(), model: v.string(), latencyMs: v.number(), fallback: v.boolean(), error: v.optional(v.string()) }),
});
```

`fromUserId` absent = the restaurant agent. A line is "shared" when `sharedBy` has more than one user. `askServer` on lines is computed in `orders:lines` with `isSafeFor` against `sharedBy`, never stored.

### Design: party state machine

| From → to | Trigger | Side effects |
| --- | --- | --- |
| new → `checkin` | `parties:create` | 6-character `joinCode` (no 0/O/1/I), unique by index |
| `checkin` → `hunger` | last `parties:join`, or `parties:startWithFewer` (≥ 2 members) | `startWithFewer` sets `size` to member count |
| `hunger` → `negotiating` | last `parties:setHunger` | starts the `negotiate` workflow |
| `negotiating` → `pick` | `parties:advance`, scheduled at the final bubble's `showAt` | sets `pickDeadline = now + 45 s`, schedules `orders:autoPick` |
| `pick` → `confirm` | last `orders:pick`, or `orders:autoPick` (rank-1 for anyone missing) | sets `confirmDeadline = now + 45 s`, schedules `orders:autoConfirm` |
| `confirm` → `placed` | last `orders:confirm`, or `orders:autoConfirm` | re-checks every line with `isSafeFor`; drops and logs any that fail |
| any → `checkin` | `parties:reset` | deletes members, candidates, messages, lines; new `joinCode` |

Every mutation first checks `status` and throws `BAD_STATUS` if wrong; scheduled functions check too and exit quietly, so a reset or early finish makes stale timers harmless.

### Design: functions

- **`parties:join`.** Resolve the party by id or `joinCode`. Throw `BAD_STATUS` unless `checkin`. If the member exists return `already`. Count members by index; throw `FULL` at `size`. Insert; if the count now equals `size`, patch `status` to `hunger`. Convex mutations are serializable transactions, so two simultaneous taps can't both take the last seat.
- **`parties:setHunger`.** Patch the member; when every member has hunger, patch `negotiating` and `workflow.start(internal.negotiation.negotiate, { partyId })`.
- **`orders:pick`.** Require `status = pick`, the item in this user's candidates, and `isSafeFor(item, [user])`. Delete this user's previous agent-added personal lines, insert the main line and the user's drink candidate line (both `sharedBy: [userId]`, `addedBy: "agent"`), set `pickedItemId`. Last pick → `confirm`.
- **`orders:add`.** Personal: `isSafeFor(item, [user])`, `sharedBy: [userId]`. Shared: `sharedBy` = all members, `isSafeFor(item, members)`; throw `UNSAFE` with the reasons on failure.
- **`orders:remove`.** Personal line: delete it. Shared line: remove the caller from `sharedBy`, delete when empty. Return `substituteFor(item, user, menu)` from Role 3 (it excludes items already in the order).
- **`orders:lines` / totals.** Join each line to its item; per-user share = `priceCents × qty ÷ sharedBy.length` added to each sharer; `total` = sum of line prices. Integers in cents; round shares to the nearest cent, with the remainder going to the first sharer so the sum matches.
- **`orders:addable`.** `safeSet` (personal) or `sharedSafeSet` over members (shared), minus drinks when shared.
- **`users:followups` / `users:summarize`.** Thin actions calling Role 3's `followupsFor` and `summarize`; `summarize` also patches the user with `profileSummary` and `personality`.
- **`messages:list`.** All messages for the party ordered by `showAt`, plus `serverNow: Date.now()`.

### Design: negotiation workflow

```typescript
export const negotiate = workflow.define({
  args: { partyId: v.id("parties") },
  handler: async (step, { partyId }) => {
    const { userIds } = await step.runQuery(internal.negotiation.load, { partyId });
    const drafts = await Promise.all(userIds.map(userId =>
      step.runAction(internal.agents.steps.draftStep, { partyId, userId })));
    const { pooled } = await step.runMutation(internal.negotiation.poolAndPost, { partyId, drafts });
    const votes = await Promise.all(userIds.map(userId =>
      step.runAction(internal.agents.steps.voteStep, { partyId, userId, pooled, drafts })));
    await step.runMutation(internal.negotiation.postVotes, { partyId, votes });
    const plan = await step.runAction(internal.agents.steps.settleStep, { partyId, drafts, votes });
    await step.runMutation(internal.negotiation.commit, { partyId, drafts, plan });
  },
});
```

- **`poolAndPost`.** Union of all `sharedProposals`; drop any not in `sharedSafeSet` over all members; post each diner's opening bubble, then one restaurant bubble per dropped dish from `dropBubbleText`.
- **`postVotes`.** One bubble per diner from their vote.
- **`commit`.** Write `candidates` (3 mains + drink per diner), write shared `orderLines` from the plan (`addedBy: "agent"`), post the summary bubble, schedule `parties:advance` at its `showAt`.
- **Pacing (`messages.insertPaced`, internal).** `showAt = max(now, lastShowAt + 2500)`; the first bubble of a party gets `now + 500`. Bubbles begin playing while votes are still computing.
- **Timeouts.** Role 3's steps self-limit to 8 s. If the workflow hasn't committed 30 s after start, a scheduled `negotiation.rescue` runs the same flow with fallback agents only (Role 3's `fallbackDraft` / `fallbackVote`) and commits.

### Design: menu pipeline

1. **Restaurant row.** `seed.ts` creates the single demo restaurant. Its raw hand-authored mock menu is the MVP source; a Maps URL or owner-managed profile is not required.
2. **`menu:ingest` (action).** Accept `{ restaurantId, items? }`; when omitted, use the seeded raw mock menu. With `APIFY_TOKEN` and `APIFY_NORMALIZER_ACTOR`, call the project Actor with `{ items }`, read its output, stop waiting at 60 s, and use the checked-in normalized snapshot if the Actor is unavailable. Upsert `menuItems` by `(restaurantId, name)` and record the project Actor run ID / `fetchedAt`.
3. **Actor `menu-normalizer`.** Node + TypeScript on the `apify` SDK. Input: `{ items: [{ name, description?, ingredients?, price?, category? }] }`. For each item: parse price to cents; keyword pass (`keywords.ts`) checks the name, description, and ingredients for allergens and diet; Bitdeer `tag` prompt in batches of 8 by default may add or raise allergens and add tags, cuisine, spice 0–4, `isDrink`, `shareable`; anything unreadable becomes `may_contain` for every allergen. Output per item via `Actor.pushData`: exactly the `menuItems` fields minus `restaurantId`. `.actor/actor.json` and an input schema with a README, published public on the Apify Store.
4. **Seed fallback.** `seed.ts` includes the raw mock menu and a hand-checked normalized snapshot, so agents always have menu data. The MVP demo still runs the project Actor against the mock input to demonstrate the required Apify integration.

5. **Should-have scraper path.** A separate Apify scraper Actor accepts a Google Maps location and finds candidate menu data for an authenticated restaurant owner profile. The owner reviews and edits the results; then `menu:ingest` sends the accepted items through the project normalizer/tagger above. Do not make this scraper a dependency of the demo.

### Design: seed and deployments

- `scripts/seed.ts --scenario base` writes the demo restaurant, raw mock menu, checked normalized snapshot and 4 teammate users (with fixed `deviceId`s matched to each demo phone). `--scenario negotiated` and `--scenario placed` add a party at those stages for Role 1 and Role 2 mocks against a real backend.
- Each person runs their own `npx convex dev`; only Role 4 deploys to the shared demo deployment. Env vars there: `ANTHROPIC_API_KEY`, `CLAUDE_MODEL`, `BITDEER_API_KEY`, `BITDEER_MODEL`, `APIFY_TOKEN`, `DEMO_SEED`.

### Edge cases

- Two taps for the last seat at once: one succeeds, the other gets `FULL`.
- A diner leaves mid-party: not supported in the MVP; timers act for them.
- Workflow step crash: the workflow component retries; the 30 s rescue covers a stuck run.
- Menu changes between ingest and order: lines reference item ids; ingest upserts and never deletes during an open party.
- Duplicate bubbles on retry: `insertPaced` dedupes on `(partyId, fromUserId, text)`.

### Acceptance criteria

- [x] A script calling `parties:join` ×4, `setHunger` ×4, `pick` ×4 and `confirm` ×4 reaches `placed` with no client (passed on isolated `dev/e2e` deployment)
- [ ] `convex-test` covers join (full, already, concurrent), every status transition, timers firing after reset, and totals summing exactly
- [ ] With models disabled, negotiation still commits within 30 s via fallbacks
- [ ] Run the project Actor on the seeded mock menu and store normalized records; our Actor is public on the Apify Store
- [ ] Every mutation that writes an order line refuses an unsafe item

### Task log

- [ ] Repo, `npx convex dev`, share the dev URL
- [x] `convex.config.ts` registers `@convex-dev/workflow`; `@convex-dev/agent` is deferred for the MVP (High-Level Design D10)
- [ ] Confirm the implemented `shared/enums.ts` and `shared/types.ts` contract with Role 3; iOS mirrors the shared allergen, diet, hunger, status, and personality enums
- [x] `schema.ts` implements the current backend contract; it extends the original schema above, and `restaurants.mapsUrl` is optional
- [x] Base seed writes the hand-checked snapshot, then best-effort runs `menu:ingest` on the raw mock menu
- [x] `users:upsert`, `users:me`, `users:followups`, `users:summarize` + fallback and persistence tests
- [x] `parties:create`, `join`, `current`, `startWithFewer`, `reset` + tests (including concurrent last-seat joins and stale timers after reset)
- [x] `messages:list`, `insertPaced` with dedupe
- [x] `agentLogs:insert` for Role 3
- [x] `negotiate` workflow wired to Role 3's fallback steps; `poolAndPost`, `postVotes`, `commit`, `advance`; Role 3's `steps.ts` and `dropBubbleText` are available
- [x] `parties:setHunger` starting the workflow; 30 s rescue (fallback workflow and rescue coverage added)
- [x] `orders:candidates`, `pick`, `autoPick`, `lines` with totals, `addable`, `add`, `remove`, `confirm`, `autoConfirm` + tests; Role 3's `isSafeFor` and `substituteFor` are available
- [x] `seed.ts --scenario negotiated` and `--scenario placed`
- [x] Raw mock menu and checked normalized snapshot in `convex/fixtures/raw-menu.json` and `convex/fixtures/normalized-menu.json`
- [x] Actor input schema, price parsing, ingredient-aware keyword pass, Bitdeer tagging, and normalized output; Role 3 keyword rules and tag prompt are available
- [ ] Publish the Actor to the Apify Store (Actor README is in `apify/menu-normalizer/README.md`)
- [x] `menu:ingest`, `menu:status`; base seed invokes ingest and keeps the checked snapshot as fallback
- [x] Add `npm run menu:snapshot` to export a successful live ingest into the checked fallback fixture
- [x] Run the project Actor on the mock fixture; verify all 28 rows are tagged and refresh the checked snapshot
- [x] Backend E2E script passed on the isolated Convex `dev/e2e` deployment; original development deployment data was left untouched
- [x] Demo deployment configured at `https://oceanic-canary-660.convex.cloud`; provider and Apify env vars set; tagged 28-item menu seeded
- [ ] Full iOS happy path on five demo phones, twice; record run results
  - Status (2026-10-24): not run; one physical iPhone was connected, and the iOS simulator build succeeded. No app-level rehearsal results are recorded.
- [x] README section: Convex architecture and setup, with a link to the repository Actor docs
- [ ] Add the public Apify Store link to the README after Actor publication

## Integration milestones, mocks and conventions

Four milestones mark when the seams between roles go live; each is reached when its checks pass, and the team does a quick joint test at each one before moving on.

1. **Contracts frozen.** `schema.ts`, `shared/enums.ts`, `shared/types.ts` merged; dev deployment URL shared; Role 3's `steps.ts` returns fallbacks; Role 2 shows live UWB distance between two phones. Unblocks everyone working against real types.
2. **Data flows.** Seeded deployment live; Role 1's screens read real subscriptions; Role 2's tap and QR call `parties:join`; Role 4's workflow runs end to end on Role 3's fallback agents.
3. **Real brains and normalized mock menu.** During demo setup, `npm run seed` writes the checked snapshot, then sends the raw mock fixture through `menu:ingest`, which runs the project Apify Actor when configured and fills `menuItems`; Role 3's model steps replace fallbacks; bubbles play on the restaurant screen in step with diner phones. The separate menu scraper remains a should-have.
4. **Happy path.** Full flow on all 5 phones from tap to `placed`, twice in a row, with zero safety-test failures. After this: should-haves, polish and rehearsal only.

**Mocks so nobody waits.**

| Who is blocked | On | Mock |
| --- | --- | --- |
| Role 1 | Backend | JSON fixtures in `TappyCore/Convex/Mocks`, one per party `status` |
| Role 1, Role 2 | Real negotiation | `scripts/seed.ts --scenario negotiated` writes candidates, lines and bubbles directly |
| Role 2 | Tap hardware | Debug button "Simulate tap" calling `parties:join` |
| Role 2 | Amy's avatars | Placeholder avatars with the same asset names |
| Role 4 | Agent steps | Role 3's fallback agents (no model calls) |
| Role 3 | Final menu | Hand-made mock fixture with shellfish, nut and gluten traps |

**Conventions.**

- Branches per role (`r1/…` to `r4/…`), small PRs into `main`, merge at least at every milestone. Role 4 reviews any change to `convex/schema.ts` or `shared/`; Role 3 reviews any change to `convex/agents/`.
- Each person runs their own Convex dev deployment; only Role 4 changes the shared demo deployment.
- Function names are `file:function` exactly as in the API table; Swift calls use the constants in `API.swift`.
- Every model call logs prompt name, latency and `fallback` to `agentLogs`, which doubles as evidence for the Anthropic and Bitdeer tracks.
- A contract change after milestone 1 needs a message in the team channel and a thumbs-up from every role that consumes it.
- Keep design notes in Notability throughout (low-effort track).
