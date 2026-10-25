# TappyTabs Menu Normalizer & Allergen Tagger

This Actor accepts hand-written or scraped menu items and writes one normalized dataset row per item. TappyTabs uses the output to populate Convex `menuItems`.

## Input

```json
{
  "items": [
    {
      "name": "Pad Thai",
      "description": "Rice noodles with tamarind sauce",
      "ingredients": ["egg", "crushed peanuts", "fish sauce"],
      "price": "$18.00",
      "category": "Mains"
    }
  ],
  "batchSize": 8
}
```

`name` is required. `description`, `ingredients`, `price`, and `category` are optional. Provide prices as strings (for example, `"$18.00"` or `"18.00"`); output prices are cents. Set the Actor secrets `BITDEER_API_KEY` and `BITDEER_MODEL` to enable model enrichment; without them, the deterministic keyword pass runs and uncertain allergen fields stay conservative.

## Output

Each dataset row matches the Convex menu item shape, excluding `restaurantId`: `name`, `category`, optional `cuisine`, `tags`, `description`, `priceCents`, `priceVerified`, `allergens`, `diet`, `spice`, `isDrink`, `shareable`, `menuOrder`, and `tagStatus`.

When a scraped price is missing or zero, the Bitdeer enrichment call estimates a positive price from the dish and up to six known prices on the same menu, favoring the same category. Batches without missing prices receive no price examples. Estimates use cents and retain `priceVerified: false`; known positive prices and explicitly free prices such as `"$0.00"` are never replaced. Invalid estimates, ambiguous prices, or a failed model call stay at `priceCents: 0` with `priceVerified: false`. A failed Bitdeer batch still produces conservative `tagStatus: "untagged"` rows.

The keyword pass runs before model enrichment. Model output may only add or raise allergen warnings, and diet labels are intersected with the deterministic pass. If enrichment fails, unconfirmed allergens become `may_contain` and `tagStatus` is `untagged`; TappyTabs agents do not recommend untagged items.

Tagging uses at most three concurrent Bitdeer requests. A failed or incomplete batch is retried as smaller groups, down to individual items, within a 50-second tagging budget. Each model request has a 12-second timeout; the budget leaves room for the 60-second synchronous Apify caller to receive the dataset. Items still unresolved at the deadline retain conservative keyword-only output. The Actor logs their count.

## Local development and publishing

From this directory, run `npm install`, `npm test`, then `npm run local` to run the checked-in input fixture. Publish with the Apify CLI after configuring the Actor in your account; set its public Store visibility there. TappyTabs calls the published Actor using the Convex environment variables `APIFY_TOKEN` and `APIFY_NORMALIZER_ACTOR` (`username/menu-normalizer`).
