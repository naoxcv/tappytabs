# Restaurant Onboarding Design

This document defines the first restaurant onboarding flow for TappyTabs. It supports one device-bound restaurant account, uses Google Maps to identify the restaurant, uses the existing menu-scraper Actor to collect menu data, and sends owner-approved menu data through the TappyTabs menu-normalizer Actor.

Real authentication, ownership transfer, and invitations are intentionally deferred.

## Product decisions

- One restaurant account is allowed per device.
- The restaurant account is identified by the existing device ID.
- Owners may continue with manual restaurant and menu entry when Google Maps or menu scraping fails.
- Google Maps is used to resolve the restaurant and collect onboarding details.
- The existing `menu-scraper` Actor is used to scrape the selected menu or online-ordering page.
- Owners can edit all scraped restaurant details and menu data before publishing.
- Restaurant details are used during onboarding and are not currently exposed to diners.
- No account transfer or invitation flow is required before real authentication is added.

## User flow

```text
Create restaurant account
        ↓
Enter restaurant name and address
        ↓
Google Maps Actor returns candidate restaurants
        ↓
Owner confirms the matching restaurant
        ↓
Find and scrape the menu or ordering page
        ↓
Owner reviews and edits restaurant details and menu
        ↓
Owner publishes the draft
        ↓
menu-normalizer Actor processes the accepted menu
        ↓
Normalized menu becomes the active restaurant menu
```

If matching or scraping fails, onboarding enters manual review. The owner can enter the missing information and continue through the same review, publish, and normalization path.

## Architecture

Google Maps resolution and menu scraping should be separate stages:

1. A Google Maps Actor searches the owner’s name and address and returns candidate businesses, canonical Maps URLs, place IDs, hours, websites, phone numbers, and other public details.
2. The owner selects the correct candidate. The app must not silently choose the first result.
3. The selected result’s menu or ordering URL is passed to the existing `apify/menu-scraper` Actor.
4. Scraped menu rows are stored as an editable draft, not directly as active `menuItems`.
5. The owner publishes the edited draft.
6. The published raw menu is sent to `apify/menu-normalizer`.
7. Validated normalized rows become the restaurant’s active menu version.

The current Google Maps Actor should be selected and configured during implementation. `compass/crawler-google-places` is the initial candidate because it supports direct place URLs, place searches, opening hours, and menu or ordering links when detail scraping is enabled. A Google Maps menu-specific Actor may be evaluated separately, but it is not required for the first design.

## Convex data model

### `restaurantAccounts`

One account per device.

```text
deviceId
displayName
createdAt
lastSeenAt
status
```

The device ID is a temporary identity, not a secure authentication credential. Every owner mutation must verify the caller’s device ID against this row.

### `restaurants`

One restaurant belongs to one restaurant account.

```text
ownerAccountId
name
address
mapsUrl
googlePlaceId
googleMapsName
phone
websiteUrl
latitude
longitude
rating
priceLevel
hours
serviceOptions
onboardingStatus
menuSource
lastScrapedAt
lastNormalizedAt
scraperRunId
normalizerRunId
```

Restaurant details are retained for owner editing and future product use, but are not returned to diner-facing queries in this phase.

### `restaurantOnboardings`

Tracks one onboarding attempt and its asynchronous work.

```text
ownerAccountId
restaurantId
submittedName
submittedAddress
status
scraperRunId
candidates
selectedCandidate
errorMessage
createdAt
updatedAt
```

Suggested statuses:

```text
created
details_submitted
finding_restaurant
candidates_ready
restaurant_confirmed
scraping_menu
review_required
normalizing
ready
manual_review
match_failed
scrape_failed
normalization_failed
```

The `candidates` field stores the small set of Google Maps results returned for this onboarding attempt. The `selectedCandidate` field stores the owner’s chosen result. Keeping these values on the onboarding record avoids a separate candidates table while preserving resumability and candidate confirmation.

Each candidate should contain:

```text
name
address
mapsUrl
googlePlaceId
websiteUrl
phone
hours
rating
distance
matchScore
rawPayload
```

### `menuDrafts`

Stores scraper output and owner edits before normalization.

```text
onboardingId
restaurantId
source
rawItems
editedItems
status
createdAt
updatedAt
```

### `restaurantMenuVersions`

Separates draft, active, and historical menus.

```text
restaurantId
version
status
source
scraperRunId
normalizerRunId
createdAt
publishedAt
```

The existing `menuItems` rows should be associated with the active version, either through a `menuVersionId` field or an equivalent versioning structure. Existing table sessions should continue using the menu version they started with.

## Backend API

Public owner-facing functions:

- `restaurantAccounts.createOrGet`
- `restaurantAccounts.me`
- `restaurants.createDraft`
- `restaurants.getOwned`
- `onboarding.submitDetails`
- `onboarding.getStatus`
- `onboarding.listCandidates`
- `onboarding.selectCandidate`
- `onboarding.getDraft`
- `onboarding.updateDraft`
- `onboarding.publish`

Internal actions:

- `onboarding.resolveGoogleMaps`
- `onboarding.scrapeMenu`
- `onboarding.normalizeMenu`

Actor calls should run asynchronously, persist run IDs and errors, and update onboarding status. The iOS app should subscribe to status rather than wait synchronously for a long-running scrape.

## Google Maps matching

The first search should combine the submitted name and full address. Return a small candidate set, such as five results, and rank candidates deterministically using:

- normalized restaurant-name similarity;
- street-address similarity;
- city and postal-code match;
- geographic distance;
- restaurant-category match;
- exact place ID when the owner supplies a Maps URL;
- closed or permanently closed status.

The owner confirms the selected result. If the owner supplies a Google Maps URL, its place ID or canonical URL is the strongest matching signal, but the returned name and address should still be shown for confirmation.

## Menu scraping

The existing `apify/menu-scraper` Actor currently accepts public menu or online-ordering URLs and returns names, descriptions, prices, categories, source URLs, and optional images. It should be extended or wrapped so the onboarding pipeline can pass:

```json
{
  "googleMapsUrl": "...",
  "menuUrl": "...",
  "restaurantName": "...",
  "maxRequestsPerCrawl": 10
}
```

The selected Google Maps result should supply the menu or ordering URL when one is available. If the Actor finds no usable menu, onboarding should enter `manual_review` rather than publishing an empty or misleading menu.

Potential source cases:

- structured public online menu: scrape automatically;
- JavaScript-rendered ordering page: add browser support or request manual entry;
- menu PDF or image only: retain the source link and require manual entry;
- no public menu: allow the owner to create the menu manually.

## Owner review and publishing

The review screen should display and allow editing of:

- restaurant name and address;
- phone and website;
- weekly hours;
- menu categories;
- item names, descriptions, prices, categories, and images;
- duplicate, missing, or suspicious fields.

The UI should clearly label scraped data as requiring owner review. The owner can add, remove, edit, and reorder anything before publishing.

Publishing should be an explicit action. It should create or activate a menu version and then invoke the normalizer. The active menu should not change until normalization succeeds and the result passes the existing validation rules.

## Failure handling

- Missing or invalid device ownership: reject the mutation.
- Ambiguous Google Maps match: keep the candidate list and ask the owner to choose.
- Google Maps timeout: allow retry or manual entry.
- No menu URL: allow manual menu entry.
- Scraper timeout or empty output: keep the draft and enter manual review.
- Normalizer timeout or invalid output: preserve the previous active menu and show a retry state.
- Duplicate menu items: merge or flag them for owner review.
- Interrupted onboarding: resume from the persisted status.
- Concurrent publish attempts: accept only one transition from draft to publishing.

Existing parties must remain stable while a new menu version is being prepared. Do not delete menu rows that an active party may reference.

## iOS implementation sequence

1. Add restaurant-mode entry for creating a restaurant account.
2. Add device-bound account creation and ownership checks.
3. Add name and address submission.
4. Add onboarding progress subscription.
5. Add Google Maps candidate selection.
6. Add restaurant-detail confirmation and editing.
7. Add menu scraping progress and fallback-to-manual state.
8. Add menu draft review and editing.
9. Add explicit publish action.
10. Add normalization progress and completion state.
11. Use the active normalized menu for existing restaurant sessions.
12. Preserve the seeded demo restaurant path behind demo/debug behavior.

## Implementation milestones

### Milestone 1: account and ownership

Add `restaurantAccounts`, one-restaurant-per-device enforcement, restaurant drafts, and owner guards. This milestone does not require Apify.

### Milestone 2: Google Maps resolution

Select the Google Maps Actor, map its output, persist candidates, implement deterministic ranking, and add owner confirmation.

### Milestone 3: menu acquisition

Connect the selected Maps result to its menu URL, adapt `menu-scraper`, persist raw drafts, and add retry/manual fallback behavior.

### Milestone 4: owner review

Build editable restaurant-detail and menu-draft screens. Add explicit publish behavior.

### Milestone 5: normalization and active menu

Send the published draft through `menu-normalizer`, validate the result, create an active menu version, and expose it to restaurant sessions.

### Milestone 6: real-restaurant validation

Test at least one restaurant with a structured menu, one JavaScript ordering site, one restaurant with only a menu link, one restaurant with no public menu, and one ambiguous name/address match.

## Acceptance criteria

- A new device can create exactly one restaurant account.
- A second restaurant cannot be created from the same device.
- Only the owning device can modify or publish the restaurant.
- Google Maps candidates are persisted and manually selectable.
- The owner can continue without a successful scrape.
- Scraped restaurant details and menu items are fully editable.
- Raw scraped data is never written directly to the active menu.
- The owner must explicitly publish the draft.
- Published menu data passes through `menu-normalizer`.
- A failed normalization preserves the previous active menu.
- Existing table sessions are not broken by a new menu version.
- The seeded demo restaurant remains available for the current demo flow.
