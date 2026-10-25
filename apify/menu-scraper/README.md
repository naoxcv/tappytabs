# TappyTabs Restaurant Menu Scraper

Scrapes menu items from a user-supplied public restaurant menu or online ordering page. It recognizes common menu markup, Schema.org `MenuItem` and `Product` data, and visible item cards. Each dataset row contains the item name, description, price when available, category, source URL, and an HTTPS photo URL when the page exposes one. The TappyTabs menu normalizer can then add dietary and cuisine tags.

## Input

You must supply at least one URL in `startUrls`, or a single `menuUrl` when called by the TappyTabs onboarding pipeline. The Actor does not choose a restaurant or menu for you. `maxRequestsPerCrawl` defaults to one page.

The source page must be publicly accessible and expose menu information in its HTML. Pages requiring sign-in, image-only/PDF menus, bot challenges, and JavaScript-rendered pages may need additional browser or OCR support. The Actor fails when it cannot find menu items instead of returning an empty or misleading menu.

## Run locally

```bash
npm install
npx apify run
```

## Dataset fields

| Field         | Description                      |
| ------------- | -------------------------------- |
| `name`        | Menu item name                   |
| `description` | Item description, when available |
| `price`       | Price string, when available     |
| `category`    | Menu section, when identifiable  |
| `imageUrl`    | Item photo URL, when available   |
| `sourceUrl`   | URL scraped                      |

## Deploy

Run `apify push` from this directory after reviewing the Actor and dataset output. Then set `APIFY_SCRAPER_ACTOR` in the Convex deployment to this Actor's ID or username/name.
