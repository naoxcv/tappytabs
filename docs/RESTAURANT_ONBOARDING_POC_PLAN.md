# Restaurant Onboarding POC Plan

This plan supersedes the Google Maps–first approach from `docs/RESTAURANT_ONBOARDING_DESIGN.md`.

It builds on the existing commits:

- `6a0d840` — backend onboarding schema and flow
- `07ad94f` — Convex generated bindings
- `7845ef4` — onboarding backend tests
- `dce7cdb` — iOS onboarding flow and API wiring
- `96c21f5` — existing scraper Actor integration

## Goal

Use the new external Apify Actor as the sole restaurant/menu discovery integration.

Primary path:

```text
Owner enters menu or restaurant URL
        ↓
New Actor URL Mode
        ↓
Editable menu draft
        ↓
Owner publishes
        ↓
menu-normalizer
        ↓
Active menu version
```

Optional fallback:

```text
Owner enters restaurant name and location
        ↓
New Actor Search Mode, maxResults 1–3
        ↓
Owner selects a candidate
        ↓
Selected result becomes the editable menu draft
```

Google Maps is removed from the onboarding flow.

## Product decisions

- URL Mode is the default and primary path.
- Search Mode is optional and explicitly labeled as slower.
- Search Mode uses `maxResults: 3` maximum.
- The owner must select a Search Mode result.
- The first result is never silently accepted.
- Manual URL entry remains available if Search Mode fails.
- Restaurant metadata is intentionally minimal.
- Menu data is the primary restaurant asset.
- Existing active menus remain untouched until normalization succeeds.

## Actor integration

Configure separate Apify Tasks as `APIFY_SCRAPER_URL_TASK` and `APIFY_SCRAPER_SEARCH_TASK`.

URL Mode input:

```json
{
  "mode": "url",
  "url": "https://restaurant.example.com",
  "location": "San Jose, CA",
  "freshness": "med_cache"
}
```

Search Mode input:

```json
{
  "mode": "search",
  "query": "restaurant name",
  "location": "San Jose, CA",
  "freshness": "med_cache",
  "maxResults": 3
}
```

Map each successful Actor result into:

- restaurant name
- source URL
- optional address
- confidence
- extraction confidence
- categories
- raw menu items
- raw Actor payload for audit/debugging

Only successful results with usable menu data should enter review.

Suggested minimum validation:

- `success === true`
- `menu.categories` is non-empty
- at least five usable menu items
- reject `confidence === "low"` unless the owner explicitly chooses manual review

A high-confidence menu without prices should remain valid. The normalizer can process missing prices conservatively.

## Backend changes

### 1. Remove Google Maps resolution

Deprecate or remove:

- `resolveGoogleMaps`
- `APIFY_GOOGLE_MAPS_ACTOR`
- Google Maps candidate-specific fields
- Google Maps matching logic
- Google Maps candidate UI

Existing optional database fields can remain temporarily for compatibility, but new code should stop writing them.

### 2. Add explicit acquisition modes

Add onboarding fields:

```text
acquisitionMode: "url" | "search"
sourceUrl
searchQuery
searchLocation
actorRunId
```

Add statuses such as:

```text
awaiting_source
scraping_url
scraping_search
search_results_ready
review_required
scrape_failed
```

### 3. Replace synchronous scraping

The current onboarding actions use synchronous Actor requests. That is too short for the new Actor.

Implement an asynchronous Actor runner:

1. Start the mode-specific Task with `POST /actor-tasks/{task}/runs`.
2. Persist the run ID.
3. Poll run status through a scheduled Convex action.
4. Read dataset results as they become available or when the run completes.
5. Persist successful rows and failures.
6. Transition to review or manual fallback.

Suggested practical time budgets:

- URL Mode: approximately 3–4 minutes
- Search Mode with three results: approximately 8 minutes

The iOS app should subscribe to onboarding status and never block on a long-running request.

### 4. Preserve versioned menu behavior

Keep:

- `menuDrafts`
- `restaurantMenuVersions`
- `activeMenuVersionId`
- normalization failure rollback
- historical menu versions
- existing party/menu stability behavior

These are still valuable for the POC.

### 5. Keep restaurant data minimal

The canonical restaurant fields should be:

```text
ownerAccountId
name
address
sourceUrl
onboardingStatus
activeMenuVersionId
```

Do not add hours, phone, ratings, coordinates, service options, or Google identifiers for this phase.

## iOS changes

Replace the current Google Maps onboarding UI with an acquisition choice:

```text
How would you like to add your menu?

[Paste a restaurant or menu URL]
[Find it automatically]
```

### URL Mode

- URL text field
- Optional location field
- “Import menu” button
- Progress state
- Retry and manual-review fallback

### Search Mode

- Restaurant name field
- City/location field
- Explicit warning: “This may take several minutes”
- Search progress
- Candidate cards showing:
  - restaurant name
  - source URL
  - address if available
  - confidence
  - item count
- Owner selection required

### Review screen

Continue using the existing editable draft UI, but label data as:

- “Imported from URL”
- “Found automatically”

The review screen should not expose Google-specific concepts.

## Existing scraper cleanup

After the new Actor integration is validated:

- Remove `apify/menu-scraper` source and tests.
- Remove its package-level configuration.
- Remove references to the old Actor from README and docs.
- Keep only the new Actor ID in deployment configuration.
- Do not delete or alter the external Apify Actor until the replacement has completed a real run successfully.

## Configuration

Required:

```bash
npx convex env set APIFY_TOKEN <token> --deployment <deployment>
npx convex env set APIFY_SCRAPER_URL_TASK <url-task-id> --deployment <deployment>
npx convex env set APIFY_SCRAPER_SEARCH_TASK <search-task-id> --deployment <deployment>
npx convex env set APIFY_NORMALIZER_ACTOR naoxcv/menu-normalizer --deployment <deployment>
```

No `APIFY_GOOGLE_MAPS_ACTOR` is needed after this change.

The current deployments already contain:

- `APIFY_TOKEN`
- `APIFY_NORMALIZER_ACTOR`

The development deployment may still have the old `APIFY_SCRAPER_ACTOR`; it can be removed after the Tasks are deployed and validated.

## Testing plan

### Backend

Add tests for:

- URL Mode run creation
- Search Mode run creation with `maxResults: 3`
- ownership checks
- failed Actor results
- low-confidence results entering manual review
- multiple Search Mode candidates
- explicit candidate selection
- retry after timeout
- normalization rollback

### Actor mapping

Add fixture tests for:

- URL Mode output
- Search Mode output
- missing prices
- failed extraction rows
- multiple categories
- empty or malformed menus

### iOS

Validate:

- URL Mode is the default
- Search Mode is visibly slower and optional
- app relaunch resumes polling
- candidates are selectable
- failed scraping exposes retry/manual entry
- demo/mock restaurant mode remains unchanged

## Acceptance criteria

- URL Mode is the first and fastest onboarding option.
- Search Mode is optional and capped at three results.
- Google Maps is no longer required.
- The owner never waits synchronously for an Actor run.
- Search results require explicit owner selection.
- Successful Actor output becomes an editable draft.
- Low-quality or failed output does not become active.
- Normalization failure preserves the previous active menu.
- The old scraper integration is removed after replacement validation.
- The seeded demo restaurant path continues to work.
