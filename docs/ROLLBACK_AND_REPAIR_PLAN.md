# Restaurant Onboarding / Apify Rollback and Repair Plan

This document is a handoff plan for evaluating two parallel paths:

1. A rollback candidate that removes the restaurant-onboarding / Apify work while preserving later teammate work as much as possible.
2. A repair candidate that keeps the current implementation and fixes the menu-normalizer and publish pipeline.

Do not reset, force-push, or rewrite `main` while evaluating these paths.

## Current repository state

At the time this plan was written:

- Local branch: `main`
- Remote branch: `origin/main`
- Local `main` was one commit behind `origin/main`.
- `origin/main` contained teammate commit `29f9804` (`Add personalized fast auto ordering`).
- The local worktree had uncommitted changes in:
  - `convex/onboarding.ts`
  - `convex/tests/onboarding.test.ts`
- Those local changes include fixes for:
  - Converting scraped raw items into iOS-decodable menu draft items.
  - Correcting the Apify normalizer URL used during publish.

Before branching, inspect the worktree and decide whether to preserve those changes in a temporary commit, stash them, or discard them from the candidate branches. Do not accidentally include debugging changes in a rollback comparison.

## Why publish currently fails

The current normalizer path has several independent failure modes:

1. The Apify normalizer is called synchronously with a 60-second request timeout.
2. The Actor launches all Bitdeer tagging batches concurrently with `Promise.all`.
3. A failed or timed-out Bitdeer batch returns no LLM tags, so its items become `tagStatus: "untagged"`. This is intentional and should not block publishing.
4. The Actor can emit `priceCents: null` when a price is ambiguous or cannot be parsed.
5. Convex’s `normalizedItem` validator currently requires `priceCents` to be a nonnegative number.
6. The publish action filters invalid normalized rows and throws if `validItems.length === 0`.
7. The action then rethrows the provider error, which surfaces in the iOS app as a generic Convex/server error.

Therefore, “untagged” is not itself the reason publishing should stop. The likely blockers are provider timeout/rate limiting, invalid rows caused by nullable prices, or all rows being filtered out by schema validation.

The full request ID from the Convex error is useful for confirming the exact failure in the deployment logs. A truncated ID is not sufficient for reliable log correlation.

## Important commit history

The following commits are the main actor/onboarding area identified so far. Confirm their exact patch contents before reverting:

### Earlier Apify and menu-normalizer work

- `5a699fb` — Wire menu ingest into demo seeding
- `a13b0df` — Fix Apify menu item schema titles
- `e8c9278` — Add Apify input field descriptions
- `cc20168` — Validate Apify actor schema
- `44bfdd6` — Allow more time for Bitdeer menu tagging
- `8ee8dca` — Extend menu ingest timeout
- `9267036` — Refresh normalized menu snapshot
- `ffcf6f9` — Map normalizer batch indexes to source items
- `a4b7dd4` — Reduce default normalizer batch size
- `322ecd5` — Correct normalizer deployment details
- `61bf28f` — Retry normalizer tagging timeouts
- `954541e` — Merge Role 4 normalizer timeout fixes

### Restaurant onboarding implementation

- `a288ceb` — Implement restaurant onboarding backend
- `f68cd49` — Regenerate Convex onboarding bindings
- `9a71c59` — Test restaurant onboarding flow
- `665489e` — Wire restaurant onboarding into iOS
- `a2ba545` — Align onboarding with menu Actors
- `77306a7` — Fix menu scraper dataset schema
- `240e346` — Use Apify Tasks for restaurant onboarding
- `55452c7` — Fix restaurant candidate selection
- `66d5b70` — Accept scraper restaurant name output
- `ba61537` — Map search result addresses

The commits were authored at different points and are interleaved with teammate merges and later diner/product work. Do not assume that reverting every commit by one author will produce a coherent product state.

## Branch setup

First save the current state without changing shared history:

```bash
git status --short --branch
git fetch origin
git log --graph --oneline --decorate --all -50
```

If the current uncommitted fixes should be retained for reference, create a temporary local checkpoint:

```bash
git add convex/onboarding.ts convex/tests/onboarding.test.ts
git commit -m "WIP: preserve onboarding publish diagnostics"
```

If you do not want to commit them, stash them with a descriptive name instead:

```bash
git stash push -m "onboarding publish diagnostics"
```

Create two independent branches from the current remote main:

```bash
git switch -c rollback/restaurant-onboarding origin/main
git switch -c repair/restaurant-onboarding origin/main
```

If the current working tree is not clean, use separate worktrees instead. This avoids accidentally carrying changes between candidates:

```bash
git worktree add ../tappytabs-rollback -b rollback/restaurant-onboarding origin/main
git worktree add ../tappytabs-repair -b repair/restaurant-onboarding origin/main
```

Do all rollback work only in `rollback/restaurant-onboarding` and all fixes only in `repair/restaurant-onboarding`.

## Rollback candidate: selective inverse commits

The preferred rollback mechanism is a sequence of ordinary revert commits. This preserves the complete history and makes every inverse change reviewable.

### 1. Identify the exact patch set

Inspect each candidate commit before reverting it:

```bash
git show --stat --summary <commit>
git show --format=fuller --find-renames <commit> -- <path>
```

Start with the onboarding-specific commits:

```bash
git show --stat a288ceb 665489e a2ba545 77306a7 240e346 55452c7 66d5b70 ba61537
```

Then inspect the normalizer/menu commits:

```bash
git show --stat 5a699fb 44bfdd6 ffcf6f9 a4b7dd4 322ecd5 61bf28f
```

Separate commits into these buckets:

- Must remove: restaurant onboarding UI/backend/schema/API wiring.
- Probably remove: scraper Task integration and onboarding-specific Apify mapping.
- Maybe remove: shared menu-normalizer changes that are still needed by the diner/menu demo.
- Must preserve: teammate diner onboarding, ordering, UWB, party, and later product changes.

Do not revert shared `convex/menu.ts`, `convex/schema.ts`, or iOS files solely because they appear in an actor-related commit. Inspect whether those files also contain unrelated final-product work.

### 2. Revert from newest to oldest

For ordinary commits, revert newest first so dependent fixes are removed before the original implementation:

```bash
git revert --no-commit ba61537
git revert --no-commit 66d5b70
git revert --no-commit 55452c7
git revert --no-commit 240e346
git revert --no-commit 77306a7
git revert --no-commit a2ba545
git revert --no-commit 665489e
git revert --no-commit 9a71c59
git revert --no-commit f68cd49
git revert --no-commit a288ceb
```

Review the staged diff before committing:

```bash
git diff --cached --stat
git diff --cached -- convex schema.ts ios apify docs
```

If the goal is to remove the normalizer changes too, evaluate the normalizer commits separately. Do not revert the normalizer just because onboarding was removed; the seeded/demo menu may still depend on it.

If a revert conflicts:

```bash
git status
# resolve only the intended rollback conflict
git add <resolved-files>
git revert --continue
```

If the selected revert is wrong, abort that individual revert without affecting other work:

```bash
git revert --abort
```

Because `--no-commit` is being used, group the reviewed inverse changes into a single candidate commit only after the result is understood:

```bash
git commit -m "Candidate rollback of restaurant onboarding integration"
```

### 3. Handle merge commits carefully

Commits such as `954541e` and other merge commits should not be reverted automatically. A merge revert requires choosing a parent with `-m`, and the wrong parent can remove unrelated teammate work.

Inspect the merge first:

```bash
git show --summary --pretty=raw 954541e
git diff 954541e^1 954541e --stat
git diff 954541e^2 954541e --stat
```

Prefer reverting the individual non-merge commits that introduced the unwanted behavior. Only revert a merge commit if its entire side branch is unwanted and the parent choice is unambiguous.

### 4. Validate the rollback candidate

At minimum:

```bash
npm install
npm run typecheck
npm test
git diff origin/main...HEAD --stat
git diff origin/main...HEAD -- convex/schema.ts convex/menu.ts convex/onboarding.ts ios apify
```

Build the iOS app if the rollback touches Swift or the Xcode project:

```bash
xcodebuild -project ios/TappyTabs.xcodeproj \
  -scheme TappyTabs \
  -sdk iphonesimulator \
  -configuration Debug \
  CODE_SIGNING_ALLOWED=NO build
```

Do not deploy the rollback candidate to the demo deployment until the diff has been reviewed. If deployment is needed, use a disposable Convex deployment first.

## Repair candidate: keep onboarding and make publish resilient

The repair branch should be developed independently from the rollback branch.

### 1. Make untagged output publishable

The Actor’s contract should explicitly allow:

- `tagStatus: "untagged"`
- deterministic keyword allergen results
- conservative `may_contain` levels
- partial LLM failure

The backend should not reject an item solely because it is untagged.

### 2. Resolve price semantics

Choose one consistent contract:

- Option A: `priceCents` is always a number; unknown prices become `0` and the UI displays “price unavailable”.
- Option B: `priceCents` is nullable throughout the Actor, Convex validator, Swift model, menu display, and ordering logic.

Option B is semantically cleaner, but it touches more consumers. Option A is lower risk for the current MVP because ordering already expects numeric prices. Document the choice and add tests for `$12.50`, `12.5`, ranges, “market price”, and missing prices.

### 3. Bound external tagging work

The Actor currently creates all batches at once with `Promise.all`. Replace that with bounded concurrency, for example:

- batch size: 4–8 items
- maximum concurrent Bitdeer requests: 2 or 3
- per-request timeout: 20 seconds
- retry count: 1 or 2 with backoff
- failed batches: continue with deterministic keyword output

The total Actor run must remain below the Apify synchronous request timeout, or the backend should use an asynchronous run/poll flow instead of `run-sync-get-dataset-items`.

### 4. Preserve partial results

The normalizer should always push one output row per input item when possible. If a Bitdeer batch fails:

- keep the keyword-pass row;
- set `tagStatus` to `untagged`;
- preserve conservative allergen levels;
- include a log count of failed batches;
- do not make the entire run fail.

The Convex publish action should validate and retain all valid rows, then fail only if zero usable rows remain. It should record how many rows were accepted and rejected.

### 5. Improve publish diagnostics

Before throwing, record a concise but useful error in `menuDrafts` and `restaurantOnboardings`, including:

- Apify HTTP status;
- whether the normalizer returned an array;
- returned row count;
- valid row count;
- rejected row count;
- first few validation failure reasons;
- Apify run ID, if present.

The iOS app should display the stored error and leave the draft editable rather than making the user retry blindly.

### 6. Add integration coverage

Add tests for:

- all rows tagged;
- all rows untagged but schema-valid;
- mixed tagged/untagged rows;
- unknown prices;
- one failed batch with remaining valid rows;
- zero valid rows;
- normalizer HTTP failure;
- publish retry after a failed attempt.

The existing onboarding unit test only covers draft conversion and does not exercise the external normalizer response path.

## Comparing the two branches

Use these commands to compare product impact:

```bash
git diff --stat origin/main..rollback/restaurant-onboarding
git diff --stat origin/main..repair/restaurant-onboarding
git diff --name-status origin/main..rollback/restaurant-onboarding
git diff --name-status origin/main..repair/restaurant-onboarding
```

For shared files, inspect focused diffs:

```bash
git diff origin/main..rollback/restaurant-onboarding -- convex/schema.ts convex/menu.ts ios/TappyTabs/Restaurant
git diff origin/main..repair/restaurant-onboarding -- convex/onboarding.ts convex/menu.ts apify/menu-normalizer
```

Create a short decision record after testing:

| Question | Rollback candidate | Repair candidate |
|---|---|---|
| Existing diner flow passes? |  |  |
| Existing restaurant party flow passes? |  |  |
| Restaurant onboarding intentionally present? |  |  |
| Menu seed/demo still works? |  |  |
| Full test suite passes? |  |  |
| iOS build passes? |  |  |
| Demo deployment tested? |  |  |
| Teammate changes preserved? |  |  |

## Recommended decision order

1. Do not change shared `main` yet.
2. Create both candidates from the latest `origin/main`.
3. Get the full Convex request ID from the failed publish and inspect the server error.
4. Implement the smallest repair-branch changes needed to make untagged and unknown-price items publish safely.
5. In parallel, complete the rollback candidate and measure how much final-product behavior it removes.
6. Prefer the repair branch if it preserves required teammate work and can pass the full test suite reliably.
7. Prefer the rollback candidate only if onboarding is not required for the final product or the repair cost/risk is unacceptable.
8. Merge or deploy only after a branch-level review and validation.

## Safety rules

- Never use `git reset --hard` on shared `main` for this experiment.
- Never force-push `main`.
- Do not revert teammate commits by author alone.
- Do not revert shared menu/Convex files without checking for unrelated behavior.
- Keep rollback and repair branches separate.
- Use a disposable Convex deployment for candidate validation.
- Keep the full Apify request ID and Convex action error when diagnosing failures.
