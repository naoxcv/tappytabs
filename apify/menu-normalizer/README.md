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

`name` is required. `description`, `ingredients`, `price`, and `category` are optional. Provide prices as strings (for example, `"$18.00"` or `"18.00"`); output prices are cents. Set the Actor secrets `BITDEER_API_KEY` and `BITDEER_MODEL`; a complete demo menu requires model enrichment.

## Output

Each dataset row matches the Convex menu item shape, excluding `restaurantId`: `name`, `category`, optional `cuisine`, `tags`, `description`, `priceCents`, `priceVerified`, `allergens`, `diet`, `spice`, `isDrink`, `shareable`, `menuOrder`, and `tagStatus`.

When a scraped price is missing or zero, the Bitdeer enrichment call estimates a positive price from the dish and up to six known prices on the same menu, favoring the same category. Batches without missing prices receive no price examples. Estimates use cents and retain `priceVerified: false`; known positive prices and explicitly free prices such as `"$0.00"` are never replaced. If an item cannot be tagged or given a needed price estimate, the Actor fails rather than emitting a partial demo menu.

The keyword pass runs before model enrichment. Model output may only add or raise allergen warnings, and diet labels are intersected with the deterministic pass. If enrichment fails, unconfirmed allergens become `may_contain` and `tagStatus` is `untagged`; TappyTabs agents do not recommend untagged items.

Tagging uses at most three concurrent Bitdeer requests. A failed or incomplete batch is retried as smaller groups, down to individual items. There is no whole-menu tagging deadline; each model request can take up to two minutes. Convex starts the Actor asynchronously and polls for completion, then saves every validated item in a new active restaurant menu version. A failed run leaves the previous active menu and the editable draft intact.

## Local development and publishing

From this directory, run `npm install`, `npm test`, then `npm run local` to run the checked-in input fixture. Publish with the Apify CLI after configuring the Actor in your account; set its public Store visibility there. TappyTabs calls the published Actor using the Convex environment variables `APIFY_TOKEN` and `APIFY_NORMALIZER_ACTOR` (`username/menu-normalizer`).
