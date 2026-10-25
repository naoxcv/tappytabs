# Taste v2 demo checklist

The checked restaurant is **Tappy Kitchen (demo)**, a synthetic fixture. Its 28 prices have not been checked against a current restaurant menu. All fixture rows have `priceVerified: false`, so price does not affect ranking and agents must not call them value picks.

The fixed iOS deck has five core comparisons and an optional sixth. Answers, corrections, ingredient choices, price sensitivity, and familiarity are stored separately. Pair answers never create ingredient avoids. The summary can flip or remove a directional inference before the profile is saved.

The normalizer parses a single exact price; missing, ranged, or ambiguous values become `null`. Ingest accepts only priced rows. It never turns an unknown price into zero. Menu traits explicitly supported by wording are marked `stated`; model additions are marked `inferred`. The offline backfill annotates the synthetic fixture, leaving unsupported dimensions absent.

To use a real restaurant for the demo:

1. Replace the synthetic fixture with a current menu from the chosen restaurant, including exact item names, prices, descriptions, and currency. Run `npm run menu:backfill-taste` and review each trait against the menu wording.
2. Prepare a reviewed current-menu JSON file with `restaurantName`, `sourceUrl` (HTTPS), `checkedAt` (ISO date), and `items: [{"name":"…","price":"$12.00"}]` for every fixture row. Run `npm run menu:verify-prices -- path/to/current-menu.json`. It marks prices verified only when every item matches exactly and records the source in `convex/fixtures/price-verification.json`.
3. Seed the reviewed snapshot, onboard two people with opposite pair answers, and confirm distinct mains and shared votes on devices. Run `npm test` and the iOS simulator build before the live demo.

The current synthetic fixture cannot satisfy step 2. No real restaurant or source URL has been selected in this repository.
