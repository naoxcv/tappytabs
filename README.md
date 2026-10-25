# TappyTabs

Tap your phone on the restaurant's phone to join a table. AI agents for each diner negotiate the group order while respecting everyone's dietary restrictions & preferences ; then each diner confirms on their own phone, or go on auto mode.

Built for Cal Hacks 13.0. Product requirements: [PRD.md](PRD.md). Design: [SOFTWARE_DESIGN.md](SOFTWARE_DESIGN.md).

## Layout

| Path | What |
| --- | --- |
| `convex/` | Backend: parties, agents, menus, restaurant onboarding |
| `ios/` | SwiftUI app (diner + restaurant modes) |
| `apify/` | Menu scraper and menu normalizer/allergen tagger Actors |
| `scripts/` | Deploy, seed, and menu snapshot tools |

## Run

```sh
npm install
npm run dev:local        # local Convex backend at http://127.0.0.1:3210
npm test                 # backend tests
```

Open `ios/TappyTabs.xcodeproj` and run. Switch the backend in the app's Debug menu. Restaurant onboarding has **Skip setup** buttons that load a ready-made menu (Tappy Kitchen or Flour + Water) without scraping.

Scraping and tagging need these Convex env vars: `APIFY_TOKEN`, `APIFY_NORMALIZER_ACTOR`, `APIFY_SCRAPER_URL_TASK`, `APIFY_SCRAPER_SEARCH_TASK`. Agents need `ANTHROPIC_API_KEY`.

## Deploy

```sh
cd apify/menu-normalizer && npx apify-cli push   # push the Actor first
npm run deploy:demo -- --skip-seed               # omit --skip-seed to reset demo data
```

## License

[MIT](LICENSE)
